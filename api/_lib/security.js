// Пароли (scrypt), сессии (случайный токен, в базе только его хэш), cookie.
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const N = 16384, R = 8, P = 1, KEYLEN = 64;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), dk.toString("base64")].join("$");
}

async function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const newToken = () => crypto.randomBytes(32).toString("base64url");
const tokenHash = t => crypto.createHash("sha256").update(String(t)).digest("hex");

const COOKIE = "fw_session";
const DAYS = 30;
function sessionCookie(token, { secure = true } = {}) {
  return COOKIE + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + DAYS * 86400 + (secure ? "; Secure" : "");
}
const clearCookie = ({ secure = true } = {}) => COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + (secure ? "; Secure" : "");

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

module.exports = { hashPassword, verifyPassword, newToken, tokenHash, sessionCookie, clearCookie, parseCookies, COOKIE, DAYS };
