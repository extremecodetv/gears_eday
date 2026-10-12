/* Временный харнесс: прогоняет <script> из index.html в Node с DOM-заглушкой. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error("не найден <script> в index.html");
const code = m[1];

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? "  OK   " : "  FAIL ") + msg);
  if (!cond) fail++;
};

/* ---- минимальная DOM-заглушка ---- */
class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.textContent = "";
    this.hidden = false;
    this._html = "";
    this.classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } };
  }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  blur() {}
  get offsetWidth() { return 1; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.textContent = String(v).replace(/<[^>]*>/g, ""); }
}

const byId = {};
const handlers = {};
const documentStub = {
  getElementById: (id) => (byId[id] || (byId[id] = new El("div"))),
  createElement: (tag) => new El(tag),
  addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
  body: new El("body"),
  execCommand: () => true
};

const sandbox = {
  document: documentStub,
  navigator: {},
  window: { isSecureContext: false },
  location: { href: "file:///index.html" },
  setTimeout, clearTimeout, console, Promise, Math, JSON, Array, String, Number
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
/* const/let не становятся свойствами sandbox — вытаскиваем их эпитафией */
vm.runInContext(code + "\n;globalThis.__FACTS = FACTS; globalThis.__CATS = CATS;", sandbox);
const FACTS = sandbox.__FACTS;
const CATS = sandbox.__CATS;

const fire = (ev) => handlers.keydown.forEach((fn) => fn(Object.assign({ preventDefault() {} }, ev)));
const numNow = () => parseInt(byId.num.textContent.replace(/\D+/g, ""), 10);

/* ---- проверки ---- */
console.log("\n[1] база и чипсы");
ok(FACTS.length >= 60, "набросов в базе: " + FACTS.length);
ok(byId.total.textContent === FACTS.length, "счётчик в шапке = " + byId.total.textContent);
ok(byId.tags.children.length === CATS.length + 1, "чипсов рубрик: " + byId.tags.children.length);

console.log("[2] целостность данных");
const keys = new Set(CATS.map((c) => c[0]));
ok(FACTS.filter((f) => !keys.has(f.t)).length === 0, "набросов с неизвестной рубрикой: 0");
ok(FACTS.filter((f) => !f.x || f.x.trim().length < 20).length === 0, "пустых/коротких набросов: 0");
const seenText = new Map();
FACTS.forEach((f) => seenText.set(f.x, (seenText.get(f.x) || 0) + 1));
ok([...seenText.values()].filter((n) => n > 1).length === 0, "дублей текста: 0");
ok(new Set(FACTS.map((f) => f.t)).size === CATS.length, "задействовано рубрик: " + new Set(FACTS.map((f) => f.t)).size + " / " + CATS.length);
ok(FACTS.every((f) => !/\uFFFD/.test(f.x)), "нет битой кодировки (U+FFFD)");

console.log("[2.1] пруфы");
ok(FACTS.every((f) => typeof f.q === "string" && f.q.length > 8), "у каждого наброса есть пруф-цитата");
ok(FACTS.every((f) => typeof f.a === "string" && f.a.length > 2), "у каждого наброса есть атрибуция");
ok(new Set(FACTS.map((f) => f.q)).size === FACTS.length, "дублей пруф-цитат: 0");
ok(FACTS.every((f) => !/\u2665\u2665/.test(f.q)), "в пруфах нет стимовской цензуры ♥♥");
ok(FACTS.every((f) => !/<[a-z]+[^>]*>/i.test(f.q)), "в пруфах нет HTML-тегов");
ok(FACTS.every((f) => !/\uFFFD/.test(f.q + f.a)), "пруфы без битой кодировки");

console.log("[3] старт");
ok(byId.num.textContent === "наброс № 0", "до первого клика: " + byId.num.textContent);

console.log("[4] ролл");
fire({ key: " " });
ok(numNow() === 1, "после пробела: " + byId.num.textContent);
ok(byId.fact.innerHTML.length > 20, "текст наброса выведен");
const firstFact = byId.fact.innerHTML;
ok(byId.badge.textContent.length > 2, "бейдж рубрики: " + byId.badge.textContent);
ok(byId.card.classList.contains("anim"), "анимация запущена");
ok(byId.proofQ.textContent.length > 8, "пруф выведен: «" + byId.proofQ.textContent.slice(0, 36) + "…»");
ok(byId.proofA.textContent.length > 2, "атрибуция: " + byId.proofA.textContent);
ok(byId.proof.hidden === false, "пруф виден по умолчанию");
fire({ key: "ArrowRight" });
fire({ key: "Enter" });
ok(numNow() === 3, "счётчик растёт: " + byId.num.textContent);
ok(byId.fact.innerHTML !== firstFact, "наброс не повторился подряд");
ok(byId.proofQ.textContent === FACTS.find((f) => f.x === byId.fact.innerHTML).q, "пруф соответствует набросу");

console.log("[5] фильтр по рубрике");
fire({ key: "2" }); /* ГЕЙМПЛЕЙ */
const pressed = byId.tags.children.map((c) => c.attrs["aria-pressed"]);
ok(pressed.filter((p) => p === "true").length === 1, "активна ровно одна рубрика");
let alwaysFilled = true;
for (let i = 0; i < 40; i++) { fire({ key: " " }); if (byId.fact.innerHTML.length < 20) alwaysFilled = false; }
ok(alwaysFilled, "40 роллов внутри рубрики — текст всегда есть");
fire({ key: "9" });
ok(byId.badge.textContent.indexOf("Цена") !== -1, "рубрика 9 = " + byId.badge.textContent);
fire({ key: "0" });
ok(byId.tags.children[0].attrs["aria-pressed"] === "true", "клавиша 0 = «Всё подряд»");

console.log("[6] случайность (500 роллов)");
const before = numNow();
const seen = new Set();
for (let i = 0; i < 500; i++) { fire({ key: " " }); seen.add(byId.fact.innerHTML); }
ok(numNow() === before + 500, "счётчик вырос ровно на 500: " + byId.num.textContent);
ok(seen.size >= 65, "разных выпавших набросов за 500 роллов: " + seen.size + " / " + FACTS.length);

console.log("[7] разметка и подвал");
ok(/id="proofQ"/.test(html) && /id="proofA"/.test(html), "разметка пруфа на месте");
ok(/id="proofToggle"/.test(html), "кнопка переключения пруфов на месте");
ok(/\.proof\[hidden\]/.test(html), "CSS скрывает пруф (.proof[hidden])");
ok(/negativereviews/.test(html), "в подвале ссылка на негативные обзоры Steam");
ok(/app 3010850/.test(html), "в шапке указан app 3010850");

console.log(fail === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nПРОВАЛЕНО ПРОВЕРОК: " + fail);
process.exit(fail === 0 ? 0 : 1);
