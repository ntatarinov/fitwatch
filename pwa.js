// Установка сайта как приложения (PWA): регистрация сервис-воркера, кнопка «Установить», подсказка для iPhone.
(function (root) {
  "use strict";
  let deferred = null;
  const listeners = [];
  const nav = root.navigator || {};

  const isStandalone = () => {
    try { if (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) return true; } catch (e) { /* нет matchMedia */ }
    return nav.standalone === true;
  };
  const isIos = () => /iphone|ipad|ipod/i.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const secure = () => !!root.location && (root.location.protocol === "https:" || root.location.hostname === "localhost" || root.location.hostname === "127.0.0.1");

  // installed — уже стоит; prompt — браузер даёт системное окно; ios — только через «Поделиться»; none — ничего предложить нельзя.
  function status() {
    if (isStandalone()) return "installed";
    if (deferred) return "prompt";
    if (isIos()) return "ios";
    return "none";
  }
  const notify = () => listeners.slice().forEach(f => { try { f(status()); } catch (e) { /* подписчик не должен ломать остальных */ } });
  const onChange = f => { listeners.push(f); };

  async function install() {
    if (!deferred) return "unavailable";
    const ev = deferred; deferred = null;
    try { ev.prompt(); const r = await ev.userChoice; notify(); return r && r.outcome ? r.outcome : "dismissed"; } catch (e) { notify(); return "dismissed"; }
  }

  function register() {
    if (!("serviceWorker" in nav) || !secure()) return Promise.resolve(false);
    return nav.serviceWorker.register("/sw.js").then(() => true, () => false);
  }

  // Карточка установки: кнопка, если браузер умеет, иначе короткая инструкция. Если ставить нечего, пусто.
  function card(opts) {
    const o = opts || {}, s = status();
    if (s === "installed" || s === "none") return "";
    const x = o.dismissible ? `<button type="button" class="ghost tiny-btn" data-install-x>Не сейчас</button>` : "";
    const body = s === "prompt"
      ? `<p class="muted">Открывается с экрана телефона как обычное приложение, без адресной строки, быстрее и даже без сети.</p><div class="row"><button type="button" data-install>Установить</button>${x}</div>`
      : `<p class="muted">На iPhone: нажми «Поделиться» <span class="ios-share" aria-hidden="true">${root.Icons ? root.Icons.svg("share", 16) : ""}</span> (в Safari значок внизу экрана, в Chrome справа в адресной строке) и выбери «На экран Домой». Открывай сайт в браузере, а не внутри Telegram или Instagram. Значок появится рядом с остальными приложениями.</p>${x ? `<div class="row">${x}</div>` : ""}`;
    return `<div class="card install" id="installcard"><div class="row"><b>${root.Icons ? root.Icons.svg("download", 18) : ""} Установи как приложение</b></div>${body}</div>`;
  }

  function init() {
    if (!root.addEventListener) return;
    root.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); deferred = ev; notify(); });
    root.addEventListener("appinstalled", () => { deferred = null; notify(); });
    register();
  }

  const api = { status, install, card, onChange, init, register, isStandalone, isIos, _set(ev) { deferred = ev; } };
  root.Pwa = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
