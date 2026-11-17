// Единственный владелец localStorage. Остальной код ходит только через window.Store.
(function () {
  var STORAGE_KEY = "ege24_trainer_progress";
  var VERSION = 2;

  var state = null; // загружается лениво: при require модуль не трогает DOM
  var persistBroken = false; // localStorage недоступен — работаем в памяти

  function emptyState() {
    return {
      version: VERSION,
      stages: {},
      answers: {},
      results: {},
      sessions: {},
      drafts: {},
      reflection: {}
    };
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeStage(value) {
    if (!isPlainObject(value)) {
      return { completed: false, attempts: 0, lastScore: null, updatedAt: null };
    }
    var attempts = typeof value.attempts === "number" && isFinite(value.attempts) && value.attempts > 0
      ? Math.floor(value.attempts)
      : 0;
    var lastScore = typeof value.lastScore === "number" && isFinite(value.lastScore)
      ? Math.min(1, Math.max(0, value.lastScore))
      : null;
    return {
      completed: value.completed === true,
      attempts: attempts,
      lastScore: lastScore,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
    };
  }

  function normalizeResult(value) {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") {
      return null;
    }
    var result = { ok: value.ok };
    if (typeof value.topic === "string" && value.topic) {
      result.topic = value.topic;
    }
    return result;
  }

  // v1: { "0": true, "1": true } — только факты прохождения этапов
  function migrateLegacy(parsed) {
    var next = emptyState();
    for (var key in parsed) {
      if (has(parsed, key) && /^\d+$/.test(key) && parsed[key] === true) {
        next.stages[key] = normalizeStage({ completed: true, attempts: 1 });
      }
    }
    return next;
  }

  function normalize(parsed) {
    if (!isPlainObject(parsed)) {
      return emptyState();
    }
    // Формат новее нашего не понимаем — не падаем, начинаем с чистого листа
    if (parsed.version !== VERSION) {
      if (typeof parsed.version === "number") {
        return emptyState();
      }
      return migrateLegacy(parsed);
    }

    var next = emptyState();
    var fields = ["answers", "sessions", "drafts"];
    var i;
    var key;

    if (isPlainObject(parsed.stages)) {
      for (key in parsed.stages) {
        if (has(parsed.stages, key) && /^\d+$/.test(key)) {
          next.stages[key] = normalizeStage(parsed.stages[key]);
        }
      }
    }
    for (i = 0; i < fields.length; i += 1) {
      if (isPlainObject(parsed[fields[i]])) {
        next[fields[i]] = parsed[fields[i]];
      }
    }
    if (isPlainObject(parsed.results)) {
      for (key in parsed.results) {
        if (has(parsed.results, key)) {
          var result = normalizeResult(parsed.results[key]);
          if (result) {
            next.results[key] = result;
          }
        }
      }
    }
    if (isPlainObject(parsed.reflection)) {
      for (key in parsed.reflection) {
        if (has(parsed.reflection, key) && Array.isArray(parsed.reflection[key])) {
          next.reflection[key] = parsed.reflection[key].filter(function (answer) {
            return typeof answer === "string";
          });
        }
      }
    }
    return next;
  }

  function load() {
    if (state) {
      return state;
    }
    var raw = null;
    try {
      if (typeof localStorage !== "undefined") {
        raw = localStorage.getItem(STORAGE_KEY);
      }
    } catch (err) {
      raw = null;
    }
    if (!raw) {
      state = emptyState();
      return state;
    }
    try {
      state = normalize(JSON.parse(raw));
    } catch (err) {
      state = emptyState();
    }
    return state;
  }

  function persist() {
    if (persistBroken) {
      return;
    }
    try {
      if (typeof localStorage === "undefined") {
        persistBroken = true;
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // приватный режим или переполнение: дальше живём в памяти до перезагрузки
      persistBroken = true;
    }
  }

  function isDevMode() {
    try {
      if (typeof window === "undefined" || !window.location || typeof window.location.search !== "string") {
        return false;
      }
      return new URLSearchParams(window.location.search).get("dev") === "true";
    } catch (err) {
      return false;
    }
  }

  function ensureStage(n) {
    var data = load();
    var key = String(n);
    if (!data.stages[key]) {
      data.stages[key] = { completed: false, attempts: 0, lastScore: null, updatedAt: null };
    }
    return data.stages[key];
  }

  function normalizeScore(score) {
    if (typeof score !== "number" || !isFinite(score)) {
      return null;
    }
    return Math.min(1, Math.max(0, score));
  }

  function touchStage(stage, score) {
    stage.attempts += 1;
    stage.updatedAt = new Date().toISOString();
    var value = normalizeScore(score);
    if (value !== null && (stage.lastScore === null || value > stage.lastScore)) {
      stage.lastScore = value;
    }
  }

  function get() {
    return clone(load());
  }

  function reset() {
    state = emptyState();
    persistBroken = false;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      // сброс остаётся в памяти
    }
    return clone(state);
  }

  function getStage(n) {
    var stage = load().stages[String(n)];
    return stage ? clone(stage) : null;
  }

  function markStageCompleted(n, score) {
    var stage = ensureStage(n);
    stage.completed = true;
    touchStage(stage, score);
    persist();
    return clone(stage);
  }

  function recordStageAttempt(n, score) {
    var stage = ensureStage(n);
    touchStage(stage, score);
    persist();
    return clone(stage);
  }

  function setAnswer(key, value) {
    load().answers[key] = value;
    persist();
    return clone(value);
  }

  function getAnswer(key) {
    var answers = load().answers;
    return has(answers, key) ? clone(answers[key]) : null;
  }

  function setResult(key, record) {
    var result = { ok: !!(record && record.ok) };
    if (record && typeof record.topic === "string" && record.topic) {
      result.topic = record.topic;
    }
    load().results[key] = result;
    persist();
    return clone(result);
  }

  function getResult(key) {
    var result = load().results[key];
    return result ? clone(result) : null;
  }

  function getResults(prefix) {
    var results = load().results;
    var filter = typeof prefix === "string" ? prefix : "";
    var selected = {};
    for (var key in results) {
      if (has(results, key) && key.indexOf(filter) === 0) {
        selected[key] = clone(results[key]);
      }
    }
    return selected;
  }

  function setSession(name, data) {
    load().sessions[name] = clone(data);
    persist();
    return getSession(name);
  }

  function getSession(name) {
    var sessions = load().sessions;
    return has(sessions, name) ? clone(sessions[name]) : null;
  }

  function clearSession(name) {
    delete load().sessions[name];
    persist();
  }

  function saveDraft(key, text) {
    load().drafts[key] = text;
    persist();
    return clone(text);
  }

  function getDraft(key) {
    var drafts = load().drafts;
    return has(drafts, key) ? clone(drafts[key]) : null;
  }

  function saveReflection(taskId, answers) {
    var saved = Array.isArray(answers)
      ? answers.filter(function (answer) {
          return typeof answer === "string";
        })
      : [];
    load().reflection[taskId] = saved;
    persist();
    return saved.slice();
  }

  function getReflection(taskId) {
    var reflection = load().reflection;
    return has(reflection, taskId) ? reflection[taskId].slice() : null;
  }

  function weakTopics() {
    var results = load().results;
    var byTopic = {};
    var order = [];
    for (var key in results) {
      if (!has(results, key) || key.indexOf("stage1:") !== 0) {
        continue;
      }
      var result = results[key];
      if (!result || typeof result.topic !== "string" || !result.topic) {
        continue;
      }
      if (!byTopic[result.topic]) {
        byTopic[result.topic] = { topic: result.topic, total: 0, wrong: 0 };
        order.push(result.topic);
      }
      byTopic[result.topic].total += 1;
      if (!result.ok) {
        byTopic[result.topic].wrong += 1;
      }
    }
    return order
      .map(function (topic) {
        return byTopic[topic];
      })
      .filter(function (topic) {
        return topic.total >= 1;
      })
      .sort(function (a, b) {
        return b.wrong - a.wrong || a.topic.localeCompare(b.topic);
      });
  }

  function isAvailable(n) {
    var number = Number(n);
    if (!isFinite(number)) {
      return false;
    }
    if (number === 0 || isDevMode()) {
      return true;
    }
    var previous = getStage(number - 1);
    return !!previous && previous.completed === true;
  }

  function requireStage(n) {
    if (isAvailable(n)) {
      return true;
    }
    try {
      if (typeof window !== "undefined" && window.location && typeof window.location.replace === "function") {
        window.location.replace("index.html");
      }
    } catch (err) {
      // навигация недоступна — просто не пускаем дальше
    }
    return false;
  }

  window.Store = {
    STORAGE_KEY: STORAGE_KEY,
    get: get,
    reset: reset,
    getStage: getStage,
    markStageCompleted: markStageCompleted,
    recordStageAttempt: recordStageAttempt,
    setAnswer: setAnswer,
    getAnswer: getAnswer,
    setResult: setResult,
    getResult: getResult,
    getResults: getResults,
    setSession: setSession,
    getSession: getSession,
    clearSession: clearSession,
    saveDraft: saveDraft,
    getDraft: getDraft,
    saveReflection: saveReflection,
    getReflection: getReflection,
    weakTopics: weakTopics,
    requireStage: requireStage,
    isAvailable: isAvailable
  };
})();
