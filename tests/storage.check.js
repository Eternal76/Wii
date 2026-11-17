"use strict";

const assert = require("node:assert");
const path = require("node:path");

const STORAGE_PATH = path.join(__dirname, "..", "js", "storage.js");

// Map-backed заглушка localStorage с возможностью ломать запись
function makeStorage(initialRaw) {
  const data = new Map();
  if (initialRaw !== undefined) {
    data.set("ege24_trainer_progress", initialRaw);
  }
  return {
    data: data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function makeBrokenStorage() {
  return {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    }
  };
}

// Свежий Store на каждую сцену: модуль кешируется require, поэтому чистим кеш
function loadStore(storage) {
  global.localStorage = storage;
  global.window = {};
  delete require.cache[require.resolve(STORAGE_PATH)];
  require(STORAGE_PATH);
  return global.window.Store;
}

try {
  // 1. Контракт и миграция v1 -> v2
  let store = loadStore(makeStorage(JSON.stringify({ "0": true, "1": true })));
  assert.ok(store, "window.Store должен быть создан");
  assert.strictEqual(store.STORAGE_KEY, "ege24_trainer_progress");
  assert.strictEqual(store.get().version, 2, "миграция поднимает версию до 2");
  assert.strictEqual(store.getStage(0).completed, true, "этап 0 мигрирует");
  assert.strictEqual(store.getStage(1).completed, true, "этап 1 мигрирует");
  assert.strictEqual(store.getStage(2), null, "незавершённого этапа нет в состоянии");
  assert.strictEqual(store.isAvailable(0), true, "этап 0 доступен всегда");
  assert.strictEqual(store.isAvailable(2), true, "этап 2 доступен после этапа 1");
  assert.strictEqual(store.isAvailable(3), false, "этап 3 заблокирован");

  // 2. попытки и lastScore = максимум
  store = loadStore(makeStorage());
  store.markStageCompleted(2, 0.4);
  store.markStageCompleted(2, 0.9);
  store.markStageCompleted(2, 0.5);
  const stage2 = store.getStage(2);
  assert.strictEqual(stage2.completed, true);
  assert.strictEqual(stage2.attempts, 3, "markStageCompleted считает попытки");
  assert.strictEqual(stage2.lastScore, 0.9, "lastScore хранит максимум");
  assert.ok(stage2.updatedAt, "updatedAt заполняется");
  store.recordStageAttempt(2, 0.7);
  assert.strictEqual(store.getStage(2).attempts, 4, "recordStageAttempt тоже считает попытку");
  assert.strictEqual(store.getStage(2).lastScore, 0.9, "более низкий результат не понижает lastScore");

  // 3. results фильтруются по префиксу
  store.reset();
  store.setResult("stage1:12", { ok: false, topic: "Функции" });
  store.setResult("stage1:13", { ok: true, topic: "Функции" });
  store.setResult("stage2:1", { ok: false, topic: "Строки" });
  const stage1Results = store.getResults("stage1:");
  assert.deepStrictEqual(Object.keys(stage1Results).sort(), ["stage1:12", "stage1:13"]);
  assert.deepStrictEqual(stage1Results["stage1:12"], { ok: false, topic: "Функции" });
  assert.strictEqual(store.getResult("stage2:1").topic, "Строки");
  assert.deepStrictEqual(store.getResults("stage3:"), {});

  // 4. weakTopics сортирует по числу ошибок и игнорирует чужие этапы
  store.setResult("stage1:14", { ok: false, topic: "Рекурсия" });
  store.setResult("stage1:15", { ok: false, topic: "Функции" });
  const weak = store.weakTopics();
  assert.deepStrictEqual(weak[0], { topic: "Функции", total: 3, wrong: 2 }, "самая слабая тема первой");
  assert.deepStrictEqual(weak[1], { topic: "Рекурсия", total: 1, wrong: 1 });
  assert.strictEqual(weak.length, 2, "этап 2 не попадает в weakTopics");

  // 5. ответы, сессии, черновики, рефлексия
  store.setAnswer("stage1:12", "3");
  assert.strictEqual(store.getAnswer("stage1:12"), "3");
  assert.strictEqual(store.getAnswer("stage1:99"), null);
  store.setSession("stage1", { index: 2 });
  assert.deepStrictEqual(store.getSession("stage1"), { index: 2 });
  store.clearSession("stage1");
  assert.strictEqual(store.getSession("stage1"), null);
  store.saveDraft("stage5:task_7", "print(sum(a))");
  assert.strictEqual(store.getDraft("stage5:task_7"), "print(sum(a))");
  store.saveReflection("task_7", ["что понял", "что осталось"]);
  assert.deepStrictEqual(store.getReflection("task_7"), ["что понял", "что осталось"]);
  assert.strictEqual(store.getReflection("task_8"), null);

  // 6. сломанный setItem: Store продолжает работать в памяти
  store = loadStore(makeBrokenStorage());
  assert.doesNotThrow(() => store.reset(), "reset не бросает при недоступном хранилище");
  assert.doesNotThrow(() => store.markStageCompleted(5, 1), "запись не бросает наружу");
  assert.strictEqual(store.getStage(5).completed, true, "состояние живёт в памяти");
  assert.strictEqual(store.getStage(5).lastScore, 1);
  store.setAnswer("stage1:12", "ответ");
  assert.strictEqual(store.getAnswer("stage1:12"), "ответ");

  // 7. битый JSON -> пустое состояние, без падения
  store = loadStore(makeStorage("не json {{{"));
  assert.strictEqual(store.getStage(0), null);
  assert.strictEqual(store.get().version, 2);
  assert.strictEqual(store.isAvailable(0), true);
  assert.doesNotThrow(() => store.markStageCompleted(0));

  // 8. requireStage: блокирует и уводит на index.html, dev-режим всё открывает
  store = loadStore(makeStorage());
  let redirected = null;
  global.window.location = {
    search: "",
    replace(url) {
      redirected = url;
    }
  };
  assert.strictEqual(store.requireStage(2), false);
  assert.strictEqual(redirected, "index.html");
  assert.strictEqual(store.requireStage(0), true, "этап 0 не редиректит");
  global.window.location = { search: "?dev=true", replace() {} };
  assert.strictEqual(store.isAvailable(5), true, "?dev=true разблокирует всё");

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
