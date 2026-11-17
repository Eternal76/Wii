"use strict";

// Проверка js/shared.js без браузера: window — пустая заглушка, DOM не нужен.
const assert = require("node:assert");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "js", "shared.js"));

const Shared = global.window.Shared;
assert.ok(Shared, "Shared должен висеть на window");

function main() {
  // escapeHtml: все пять спецсимволов.
  assert.strictEqual(
    Shared.escapeHtml("<a href=\"x\">&'</a>"),
    "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
  );
  assert.strictEqual(Shared.escapeHtml("'"), "&#39;");
  assert.strictEqual(Shared.escapeHtml(42), "42");

  // shuffle: новый массив, та же длина и состав, исходный не тронут.
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const snapshot = source.slice();
  const shuffled = Shared.shuffle(source);
  assert.notStrictEqual(shuffled, source);
  assert.deepStrictEqual(source, snapshot);
  assert.strictEqual(shuffled.length, source.length);
  assert.deepStrictEqual(shuffled.slice().sort(), snapshot.slice().sort());

  // stableOptions: детерминирован и не всегда ставит верный ответ первым.
  const options = ["верный", "неверный-1", "неверный-2", "неверный-3"];
  const firstOrder = Shared.stableOptions("17", options);
  assert.deepStrictEqual(Shared.stableOptions("17", options), firstOrder);
  assert.deepStrictEqual(options, ["верный", "неверный-1", "неверный-2", "неверный-3"]);

  let firstPositions = {};
  for (let id = 1; id <= 20; id += 1) {
    const ordered = Shared.stableOptions(String(id), options);
    assert.deepStrictEqual(
      ordered.slice().sort(),
      options.slice().sort(),
      "stableOptions потерял вариант"
    );
    const pos = ordered.indexOf("верный");
    firstPositions[pos] = (firstPositions[pos] || 0) + 1;
  }
  const notFirst = 20 - (firstPositions[0] || 0);
  assert.ok(notFirst >= 5, "верный ответ стоит первым почти всегда: " + notFirst + "/20");

  return runAsync();
}

async function runAsync() {
  // loadJson: недоступный URL даёт rejected promise, а не вечное ожидание.
  const hang = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("loadJson завис")), 5000);
    if (timer.unref) {
      timer.unref();
    }
  });
  await assert.rejects(
    Promise.race([Shared.loadJson("http://127.0.0.1:9/нет-такого.json"), hang]),
    /Откройте сайт через локальный сервер, а не file:\/\//
  );

  // warmUpPyodide без initPyodide не бросает.
  assert.doesNotThrow(() => Shared.warmUpPyodide());
  // И с падающим initPyodide тоже: ошибка уходит в console.warn.
  const warn = console.warn;
  console.warn = () => {};
  try {
    global.window.initPyodide = () => {
      throw new Error("boom");
    };
    assert.doesNotThrow(() => Shared.warmUpPyodide());
    global.window.initPyodide = () => Promise.reject(new Error("boom"));
    assert.doesNotThrow(() => Shared.warmUpPyodide());
  } finally {
    console.warn = warn;
    delete global.window.initPyodide;
  }

  console.log("OK");
  process.exit(0);
}

main();
