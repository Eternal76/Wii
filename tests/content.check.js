// Проверка целостности контента. Запуск: node tests/content.check.js
// Ловит то, что раньше находили разовыми скриптами: битые ссылки на файлы,
// верный ответ вне options, задачи без ловушек, схлопнутые эталоны.
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, file), "utf8"));
  } catch (e) {
    err(file + ": " + e.message);
    return null;
  }
}

function checkChoiceSet(where, items) {
  const seen = new Set();
  for (const item of items) {
    const id = item.id;
    if (id === undefined || id === null || id === "") {
      err(where + ": задание без id");
      continue;
    }
    if (seen.has(id)) err(where + ": повтор id " + id);
    seen.add(id);
    if (!Array.isArray(item.options) || item.options.length < 3) {
      err(where + " " + id + ": меньше трёх вариантов");
    } else {
      if (!item.options.includes(item.correct)) {
        err(where + " " + id + ": верный ответ отсутствует в вариантах");
      }
      if (new Set(item.options).size !== item.options.length) {
        err(where + " " + id + ": одинаковые варианты ответа");
      }
    }
    if (!item.pedagogical_hint) {
      warn(where + " " + id + ": нет педагогической подсказки");
    }
  }
}

// --- этап 0 и тест на пропуск ---
const stage0 = read("data/stage0.json");
if (stage0) {
  const all = [];
  for (const mod of stage0.modules || []) {
    if (!mod.id || !mod.title) err("stage0: модуль без id/title");
    if (!mod.tasks || !mod.tasks.length) err("stage0: модуль " + mod.id + " без заданий");
    (mod.tasks || []).forEach((t) => all.push(t));
  }
  checkChoiceSet("stage0", all);
  if (!all.length) err("stage0: нет заданий");
}

const placement = read("data/placement.json");
if (placement) checkChoiceSet("placement", placement.questions || []);

// --- этап 1 ---
const stage1 = read("data/stage1.json");
if (stage1) {
  checkChoiceSet("stage1", stage1);
  for (const q of stage1) {
    if (!q.topic) err("stage1 " + q.id + ": нет темы");
    if (q.type === "code_output" && !q.code) {
      err("stage1 " + q.id + ": code_output без кода");
    }
  }
}

// --- этап 2 ---
const stage2 = read("data/stage2.json");
if (stage2) {
  for (const anim of stage2) {
    const lines = (anim.code || "").split("\n");
    if (!anim.steps || !anim.steps.length) {
      err("stage2 " + anim.id + ": нет шагов");
      continue;
    }
    for (const step of anim.steps) {
      if (!Number.isInteger(step.line) || step.line < 0 || step.line >= lines.length) {
        err("stage2 " + anim.id + ": шаг ссылается на несуществующую строку " + step.line);
      }
      const keys = Object.keys(step.vars || {}).sort().join(",");
      const expected = (anim.variables || []).slice().sort().join(",");
      if (keys !== expected) {
        err("stage2 " + anim.id + ": набор переменных шага не совпадает с variables");
        break;
      }
    }
  }
}

// --- этап 3 ---
const blocks = read("data/blocks.json");
if (blocks) {
  for (const task of blocks) {
    const ids = (task.blocks || []).map((b) => b.id);
    if (new Set(ids).size !== ids.length) err("blocks " + task.id + ": повтор id блока");
    for (const id of task.correct_order || []) {
      if (!ids.includes(id)) err("blocks " + task.id + ": в correct_order нет блока " + id);
    }
    const texts = (task.blocks || []).map((b) => b.text);
    if (new Set(texts).size !== texts.length) {
      err("blocks " + task.id + ": два блока с одинаковым текстом");
    }
    const distractors = (task.blocks || []).length - (task.correct_order || []).length;
    if (distractors < 1) warn("blocks " + task.id + ": нет ни одной ловушки");
    if (!task.hints || task.hints.length < 2) warn("blocks " + task.id + ": мало подсказок");
  }
}

// --- этап 4 ---
const stage4 = read("data/stage4.json");
const hints = read("data/hints.json");
if (stage4) {
  for (const task of stage4) {
    for (const field of ["buggy_code", "input_data", "expected_output"]) {
      if (typeof task[field] !== "string") err("stage4 " + task.id + ": " + field + " не строка");
    }
    if (!hints) continue;
    const key = "stage4_task" + task.id.replace("task_", "");
    if (!hints[key]) err("stage4 " + task.id + ": нет подсказок (" + key + ")");
    else if (hints[key].length !== 3) err("stage4 " + task.id + ": подсказок " + hints[key].length + ", нужно 3");
  }
}
if (hints) {
  for (const [key, list] of Object.entries(hints)) {
    for (const text of list) {
      if (/[\r\n\t]/.test(text)) {
        err("hints " + key + ": настоящий перевод строки/табуляция внутри текста");
      }
    }
  }
}

// --- этап 5 ---
const tasks = read("data/tasks.json");
if (tasks) {
  for (const task of tasks) {
    for (const field of ["small_file", "big_file"]) {
      const file = task[field];
      if (!file) {
        err("tasks " + task.id + ": не указан " + field);
      } else if (!fs.existsSync(path.join(BASE, file))) {
        err("tasks " + task.id + ": файл " + file + " не найден");
      }
    }
    if (task.expected_small === task.expected_big) {
      err("tasks " + task.id + ": ответ на малом и большом файле совпадает (" + task.expected_small + ")");
    }
    if (!Array.isArray(task.reflection) || task.reflection.length < 2) {
      warn("tasks " + task.id + ": меньше двух вопросов рефлексии");
    }
  }
}

// --- отчёт ---
for (const message of warnings) console.log("предупреждение: " + message);
if (errors.length) {
  for (const message of errors) console.log("ОШИБКА: " + message);
  console.log("FAILED: " + errors.length + " ошибок, " + warnings.length + " предупреждений");
  process.exit(1);
}
console.log("OK: контент целостен, предупреждений " + warnings.length);
process.exit(0);
