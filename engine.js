// Движок профиля и советов. Работает по правилам, без ИИ и без сервера.
// Чистые функции: ничего не знают про страницу и хранилище, поэтому легко проверяются тестом.
(function (root) {
  "use strict";

  const MIN_CHECKINS = 3;   // сколько отзывов нужно для профиля
  const WINDOW_DAYS = 14;   // по какому периоду считаем

  const TYPES = {
    sprinter: {
      title: "Спринтер",
      summary: "Энергия скачет: сильные рывки сменяются провалами и паузами. Типичный риск — «сорвался на два дня и всё бросил».",
      helps: ["Короткие цели на неделю, а не на месяц", "«Минимум дня»: 10 минут растяжки тоже засчитываются", "Без наказаний за пропуск — быстро возвращать в режим"],
    },
    tired: {
      title: "Уставший",
      summary: "Энергии в среднем мало. Главный риск — перегрузить себя и выгореть.",
      helps: ["Короткие и мягкие тренировки", "Больше растяжки и восстановления", "Следить за сном и питанием"],
    },
    bored: {
      title: "Ищущий новизны",
      summary: "Быстро скучает от однообразия. Риск — бросить не из-за усталости, а из-за скуки.",
      helps: ["Чередовать программы и видео", "Новые маленькие цели и испытания", "Не заставлять повторять одно и то же много раз подряд"],
    },
    steady: {
      title: "Ровный бегун",
      summary: "Энергия стабильная, перерывы небольшие. Подходит план с понятным прогрессом.",
      helps: ["Следовать плану и видеть цифры", "Постепенно усложнять нагрузку", "Беречь серию и отмечать прогресс"],
    },
  };

  const BARRIER_LABELS = { time: "нет времени", tired: "усталость", boring: "скучно", pain: "что-то болит", mood: "нет настроения" };

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };

  // Самое частое препятствие (без «ничего не мешает»); при равенстве — более свежее.
  function topBarrier(checkins) {
    const count = {}, last = {};
    checkins.forEach((c, i) => {
      if (!c.barrier || c.barrier === "none") return;
      count[c.barrier] = (count[c.barrier] || 0) + 1;
      last[c.barrier] = i;
    });
    const ids = Object.keys(count);
    if (!ids.length) return null;
    ids.sort((a, b) => count[b] - count[a] || last[b] - last[a]);
    return { id: ids[0], count: count[ids[0]], label: BARRIER_LABELS[ids[0]] || ids[0] };
  }

  // Самая длинная пауза между тренировками за период (включая паузу до сегодняшнего дня).
  function maxGap(workoutDayNums, todayNum) {
    const from = todayNum - (WINDOW_DAYS - 1);
    const days = workoutDayNums.filter(d => d >= from && d <= todayNum).sort((a, b) => a - b);
    if (!days.length) return WINDOW_DAYS;
    let gap = todayNum - days[days.length - 1];
    for (let i = 1; i < days.length; i++) gap = Math.max(gap, days[i] - days[i - 1]);
    return gap;
  }

  // in: { checkins: [{date, energy, mood, barrier}], workoutDayNums: [int], todayNum: int }
  function computeProfile(input) {
    const checkins = (input.checkins || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-WINDOW_DAYS);
    if (checkins.length < MIN_CHECKINS) {
      return { ready: false, n: checkins.length, need: MIN_CHECKINS - checkins.length };
    }
    const energies = checkins.map(c => c.energy);
    const avgEnergy = mean(energies);
    const stdEnergy = std(energies);
    const avgMood = mean(checkins.map(c => c.mood));
    const barrier = topBarrier(checkins);
    const gap = maxGap(input.workoutDayNums || [], input.todayNum);

    let type;
    if (avgEnergy < 2.6) type = "tired";
    else if (barrier && barrier.id === "boring" && barrier.count >= 2) type = "bored";
    else if (stdEnergy >= 1.0 || gap >= 4) type = "sprinter";
    else type = "steady";

    return Object.assign({ ready: true, n: checkins.length, type, avgEnergy, avgMood, stdEnergy, barrier, maxGap: gap }, TYPES[type]);
  }

  const TONE = {
    sprinter: {
      return: "Пауза — это нормально, ты спринтер: рывки и передышки у тебя в природе. Не начинай заново, сделай минимум на 10 минут и серия продолжится.",
      go: "Сегодня подходящий день. Поставь цель на неделю: три тренировки — и хватит.",
    },
    tired: {
      return: "Без давления. Начни с мягкой растяжки — она тоже считается тренировкой.",
      go: "Сил хватает — сделай тренировку спокойно, без рекордов. Лучше короче, чем выгореть.",
    },
    bored: {
      return: "Скука — частая причина паузы. Попробуй другую программу или видео, не обязательно возвращаться к прежнему.",
      go: "Для разнообразия выбери программу, которую ещё не пробовал.",
    },
    steady: {
      return: "Небольшая пауза. Вернись по плану: день, на котором остановился, ждёт тебя.",
      go: "Ты в хорошем ритме. Следующий день плана — на этом экране.",
    },
    none: {
      return: "Перерыв — не провал. Начни с минимума: 10 минут растяжки вернут ритм.",
      go: "Хороший день для тренировки: следующий день плана ждёт тебя.",
    },
  };

  // in: { profile, today: checkin|null, daysSinceWorkout: int|null, trainedToday: bool, maxGap: int }
  // out: { kind: done|checkin|light|start|return|go, title, text }
  function advice(c) {
    const tone = TONE[(c.profile && c.profile.ready && c.profile.type) || "none"];
    if (c.trainedToday) {
      return { kind: "done", title: "Сегодня всё сделано", text: "Тренировка засчитана. Отдых — часть программы: следующая завтра или через день." };
    }
    if (!c.today) {
      return { kind: "checkin", title: "Минута на отзыв", text: "Скажи, как ты сегодня. От этого зависит, какую нагрузку я предложу." };
    }
    if (c.today.barrier === "pain") {
      return { kind: "light", title: "Сегодня мягко", text: "Если что-то болит — не терпи. Выбери лёгкую растяжку и не тяни в больное место. При сильной или долгой боли обратись к врачу." };
    }
    if (c.today.energy <= 2) {
      return { kind: "light", title: "Лёгкий день", text: "Сил мало — это нормально. Сегодня достаточно растяжки на 10 минут: она засчитывается в серию, и ты ничего не теряешь." };
    }
    if (c.daysSinceWorkout === null) {
      return { kind: "start", title: "Начни с первого дня", text: "Первый день плана короткий. Главное — сделать его, а не сделать идеально." };
    }
    if (c.daysSinceWorkout > c.maxGap) {
      return { kind: "return", title: "С возвращением", text: tone.return };
    }
    const full = c.today.energy >= 4 ? " Энергии много — можно работать в полную силу." : "";
    return { kind: "go", title: "Время тренироваться", text: tone.go + full };
  }

  const api = { MIN_CHECKINS, WINDOW_DAYS, TYPES, BARRIER_LABELS, computeProfile, advice };
  root.Engine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
