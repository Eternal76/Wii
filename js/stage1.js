(function () {
  // Прямой URL в недоступный этап — сразу на главную, до загрузки данных.
  if (window.Store) {
    Store.requireStage(1);
  }

  // Порог прохождения этапа: 80% правильных ответов.
  var PASS_THRESHOLD = 0.8;
  // Сколько вопросов случайно берётся из каждой темы.
  var QUESTIONS_PER_TOPIC = 2;

  // Хранилище может быть ещё не подключено — тогда работаем только в памяти.
  var S = window.Store;
  var SESSION_KEY = "stage1";
  // Меньше этого числа восстановленных вопросов — сессия считается битой.
  var MIN_RESTORE = 8;

  // Режим повторения включается ссылкой, дальше живёт в сессии.
  function isMistakesMode() {
    return new URLSearchParams(window.location.search).get("mistakes") === "1";
  }

  // Страницы этапов общие, поэтому пояснение режима создаётся из JS.
  function showMistakesNote() {
    var title = document.querySelector(".stage-page h1");
    if (!title || document.getElementById("mistakes-note")) {
      return;
    }
    var note = document.createElement("p");
    note.id = "mistakes-note";
    note.className = "mistakes-note";
    note.innerHTML =
      'Режим повторения: только вопросы, где вы ошиблись. <a class="mistakes-link" href="stage1.html">Выйти из режима</a>';
    // Без сброса сессии выход вернул бы ту же сессию ошибок из Store.
    note.querySelector(".mistakes-link").addEventListener("click", function () {
      if (S) {
        S.clearSession(SESSION_KEY);
      }
    });
    title.parentNode.insertBefore(note, title.nextSibling);
  }

  var questions = [];
  // Ответы ученика: { id: "вариант" } или { id: { left: right } } для matching.
  var answers = {};
  // Результат проверки: { id: true/false }. Ключ появляется после проверки вопроса.
  var results = {};
  // Состояние этапа: "in-progress" | "passed" | "failed".
  var stageState = "in-progress";
  // Сохранённая сессия: { ids: [], answers: {}, results: {}, done: false }.
  var session = null;

  // Группирует вопросы по теме, берёт по QUESTIONS_PER_TOPIC случайных из каждой
  // и перемешивает итоговый список, чтобы темы шли вразнобой.
  function selectQuestions(all) {
    var byTopic = {};
    var topics = [];
    for (var i = 0; i < all.length; i += 1) {
      var topic = all[i].topic || "Без темы";
      if (!byTopic[topic]) {
        byTopic[topic] = [];
        topics.push(topic);
      }
      byTopic[topic].push(all[i]);
    }
    var picked = [];
    for (var t = 0; t < topics.length; t += 1) {
      var group = Shared.shuffle(byTopic[topics[t]]);
      // Если в теме меньше вопросов, чем нужно, берём столько, сколько есть.
      var take = Math.min(QUESTIONS_PER_TOPIC, group.length);
      picked = picked.concat(group.slice(0, take));
    }
    return Shared.shuffle(picked);
  }

  // ---- Сохранение сессии ----

  // Пишет текущий набор вопросов, ответы и результаты в Store.
  function persistSession() {
    if (!S || !session) {
      return;
    }
    session.ids = questions.map(function (question) {
      return question.id;
    });
    session.answers = answers;
    session.results = results;
    S.setSession(SESSION_KEY, session);
  }

  function persistAnswer(id) {
    if (S) {
      S.setAnswer(SESSION_KEY + ":" + id, answers[id]);
    }
    persistSession();
  }

  // Вопросы, проверка которых закончилась ошибкой и которые ещё есть в JSON.
  function selectMistakes(all) {
    var results = S ? S.getResults(SESSION_KEY + ":") : {};
    var wrong = {};
    for (var key in results) {
      if (Object.prototype.hasOwnProperty.call(results, key) && results[key] && results[key].ok === false) {
        wrong[key.slice(SESSION_KEY.length + 1)] = true;
      }
    }
    var picked = [];
    for (var i = 0; i < all.length; i += 1) {
      if (wrong[String(all[i].id)]) {
        picked.push(all[i]);
      }
    }
    return picked;
  }

  // Новая сессия: в режиме ошибок — только проваленные вопросы.
  function startSession(all, requested) {
    var mistakes = requested;
    questions = mistakes ? selectMistakes(all) : [];
    if (!questions.length) {
      mistakes = false;
      questions = selectQuestions(all);
    }
    answers = {};
    results = {};
    session = { ids: [], answers: {}, results: {}, done: false, mistakes: mistakes };
    persistSession();
    // Мягко объясняем, почему набор всё-таки случайный.
    if (requested && !mistakes) {
      showStatus("Ошибок не осталось — вот случайный набор вопросов.", "pass");
    }
  }

  // Восстанавливает незавершённую сессию: те же вопросы в том же порядке.
  function restoreSession(all) {
    if (!S) {
      return false;
    }
    var saved = S.getSession(SESSION_KEY);
    if (!saved || saved.done === true || !Array.isArray(saved.ids)) {
      return false;
    }
    var byId = {};
    for (var i = 0; i < all.length; i += 1) {
      byId[all[i].id] = all[i];
    }
    var picked = [];
    for (var j = 0; j < saved.ids.length; j += 1) {
      var question = byId[saved.ids[j]];
      if (question) {
        picked.push(question);
      }
    }
    // Вопросы могли переехать в stage1.json — тогда начинаем заново.
    // В сессии ошибок может быть 1–2 вопроса, порог 8 ей не подходит.
    var minPicked = saved.mistakes === true ? 1 : MIN_RESTORE;
    if (picked.length < minPicked) {
      return false;
    }
    questions = picked;
    answers = saved.answers || {};
    results = saved.results || {};
    session = {
      ids: [],
      answers: answers,
      results: results,
      done: false,
      mistakes: saved.mistakes === true
    };
    persistSession();
    return true;
  }

  // Возвращает в разметку отмеченные варианты и выбранные соответствия.
  function restoreAnswers() {
    for (var i = 0; i < questions.length; i += 1) {
      var question = questions[i];
      var value = answers[question.id];
      if (!value) {
        continue;
      }
      var card = document.querySelector('.question-card[data-id="' + question.id + '"]');
      if (!card) {
        continue;
      }
      if (question.type === "matching") {
        var selects = card.querySelectorAll("select[data-left]");
        for (var j = 0; j < selects.length; j += 1) {
          var right = value[selects[j].getAttribute("data-left")];
          if (right) {
            selects[j].value = right;
            selects[j].classList.add("is-filled");
          }
        }
      } else {
        var radios = card.querySelectorAll('input[type="radio"]');
        for (var k = 0; k < radios.length; k += 1) {
          if (radios[k].value === value) {
            radios[k].checked = true;
            radios[k].parentNode.classList.add("is-selected");
          }
        }
      }
    }
  }

  // Подсвечивает уже проверенные вопросы и снова их блокирует.
  function restoreResults() {
    for (var i = 0; i < questions.length; i += 1) {
      var question = questions[i];
      if (Object.prototype.hasOwnProperty.call(results, question.id)) {
        paintResult(question, results[question.id] === true);
      }
    }
  }

  function findQuestion(id) {
    var numId = Number(id);
    for (var i = 0; i < questions.length; i += 1) {
      if (questions[i].id === numId) {
        return questions[i];
      }
    }
    return null;
  }

  function isAnswered(question) {
    var value = answers[question.id];
    if (question.type === "matching") {
      if (!value || typeof value !== "object") {
        return false;
      }
      for (var i = 0; i < question.pairs.length; i += 1) {
        if (!value[question.pairs[i].left]) {
          return false;
        }
      }
      return true;
    }
    return typeof value === "string" && value !== "";
  }

  function isCorrect(question) {
    var value = answers[question.id];
    if (question.type === "matching") {
      if (!value) {
        return false;
      }
      for (var i = 0; i < question.pairs.length; i += 1) {
        var pair = question.pairs[i];
        if (value[pair.left] !== pair.right) {
          return false;
        }
      }
      return true;
    }
    return value === question.correct;
  }

  function countChecked() {
    var n = 0;
    for (var key in results) {
      if (Object.prototype.hasOwnProperty.call(results, key)) {
        n += 1;
      }
    }
    return n;
  }

  function countCorrect() {
    var n = 0;
    for (var key in results) {
      if (Object.prototype.hasOwnProperty.call(results, key) && results[key]) {
        n += 1;
      }
    }
    return n;
  }

  function updateProgress() {
    var checked = countChecked();
    var total = questions.length || 0;
    var percent = total ? Math.round((checked / total) * 100) : 0;
    document.getElementById("answered-count").textContent = String(checked);
    document.getElementById("total-count").textContent = String(total);
    document.getElementById("answered-percent").textContent = percent + "%";
    var bar = document.getElementById("answered-bar");
    bar.setAttribute("aria-valuenow", String(percent));
    bar.setAttribute("aria-valuetext", "Отвечено " + checked + " из " + total);
    document.getElementById("answered-bar-fill").style.width = percent + "%";
    if (stageState === "in-progress") {
      renderActions();
    }
  }

  function showStatus(text, kind) {
    var el = document.getElementById("quiz-status");
    el.hidden = false;
    el.textContent = text;
    el.className = "quiz-status is-" + kind;
  }

  // ---- Рендер вопросов ----

  function renderChoiceOptions(question) {
    var options = Shared.stableOptions(String(question.id), question.options);
    // Группа получает имя от текста задания: иначе читается только «1 из 4».
    var html =
      '<div class="options" role="radiogroup" aria-labelledby="prompt-' +
      question.id +
      '">';
    for (var i = 0; i < options.length; i += 1) {
      var option = options[i];
      html +=
        '<label class="option">' +
        '<input type="radio" name="q-' +
        question.id +
        '" value="' +
        Shared.escapeHtml(option) +
        '">' +
        "<span>" +
        Shared.escapeHtml(option) +
        "</span></label>";
    }
    html += "</div>";
    return html;
  }

  function renderMatching(question) {
    var rights = Shared.shuffle(
      question.pairs.map(function (pair) {
        return pair.right;
      })
    );
    var html = '<div class="matching">';
    for (var i = 0; i < question.pairs.length; i += 1) {
      var left = question.pairs[i].left;
      // Левая часть пары служит названием для своего селекта.
      var pairId = "match-" + question.id + "-" + i;
      html +=
        '<div class="matching-left" id="' +
        pairId +
        '">' +
        Shared.escapeHtml(left) +
        "</div>" +
        '<select aria-labelledby="' +
        pairId +
        '" data-question="' +
        question.id +
        '" data-left="' +
        Shared.escapeHtml(left) +
        '">' +
        '<option value="">Выберите назначение</option>';
      for (var j = 0; j < rights.length; j += 1) {
        var right = rights[j];
        html +=
          '<option value="' +
          Shared.escapeHtml(right) +
          '">' +
          Shared.escapeHtml(right) +
          "</option>";
      }
      html += "</select>";
    }
    html += "</div>";
    return html;
  }

  function renderQuestion(question, index) {
    var html =
      '<section class="question-card" data-id="' +
      question.id +
      '">' +
      '<p class="question-meta">Вопрос ' +
      (index + 1) +
      "</p>" +
      '<p class="question-prompt" id="prompt-' +
      question.id +
      '">' +
      Shared.escapeHtml(question.prompt) +
      "</p>";
    if (question.type === "code_output" && question.code) {
      html += '<pre class="code-block"><code>' + Shared.escapeHtml(question.code) + "</code></pre>";
    }
    if (question.type === "matching") {
      html += renderMatching(question);
    } else {
      html += renderChoiceOptions(question);
    }
    html += '<div class="question-feedback" aria-live="polite" aria-atomic="true" hidden></div>';
    html += "</section>";
    return html;
  }

  function renderQuestions() {
    var root = document.getElementById("questions");
    var html = "";
    for (var i = 0; i < questions.length; i += 1) {
      html += renderQuestion(questions[i], i);
    }
    root.innerHTML = html;
    updateProgress();
  }

  function renderActions() {
    var actions = document.getElementById("quiz-actions");
    if (questions.length && countChecked() === questions.length) {
      actions.innerHTML =
        '<button type="button" class="btn" id="finish-stage">Завершить этап</button>';
    } else {
      actions.innerHTML = "";
    }
  }

  // Кнопки после завершения: при успехе — «На главную» и «Пройти заново»,
  // при неудаче — только «Пройти заново».
  function renderFinishActions(passed) {
    var actions = document.getElementById("quiz-actions");
    var html = "";
    if (passed) {
      html += '<button type="button" class="btn" id="go-home">На главную</button>';
    }
    html += '<button type="button" class="btn" id="retry-stage">Пройти заново</button>';
    actions.innerHTML = html;
  }

  // ---- Мгновенная проверка и обратная связь ----

  function lockCard(card) {
    if (!card) {
      return;
    }
    var fields = card.querySelectorAll("input, select");
    for (var i = 0; i < fields.length; i += 1) {
      fields[i].disabled = true;
    }
    card.classList.add("is-locked");
  }

  function showFeedback(card, correct, hint) {
    if (!card) {
      return;
    }
    var box = card.querySelector(".question-feedback");
    if (!box) {
      return;
    }
    var title = correct ? "Верно!" : "Не совсем. Давай подумаем:";
    var text = hint || (correct ? "Ответ верный." : "Ответ неверный. Попробуй вспомнить теорию.");
    box.hidden = false;
    box.className = "question-feedback " + (correct ? "is-correct" : "is-incorrect");
    box.innerHTML =
      '<p class="feedback-title">' +
      Shared.escapeHtml(title) +
      "</p>" +
      '<p class="feedback-text">' +
      Shared.escapeHtml(text) +
      "</p>";
  }

  function highlightChoice(card, question, correct) {
    var options = card.querySelectorAll(".option");
    for (var i = 0; i < options.length; i += 1) {
      var input = options[i].querySelector("input");
      if (input && input.checked) {
        options[i].classList.add(correct ? "is-correct" : "is-incorrect");
      }
    }
  }

  function highlightMatching(card, question) {
    var selects = card.querySelectorAll("select[data-left]");
    for (var i = 0; i < selects.length; i += 1) {
      var left = selects[i].getAttribute("data-left");
      var expected = null;
      for (var j = 0; j < question.pairs.length; j += 1) {
        if (question.pairs[j].left === left) {
          expected = question.pairs[j].right;
          break;
        }
      }
      if (selects[i].value && expected && selects[i].value === expected) {
        selects[i].classList.add("is-correct");
      } else {
        selects[i].classList.add("is-incorrect");
      }
    }
  }

  // Применяет к карточке результат проверки: подсветка, блокировка, подсказка.
  function paintResult(question, correct) {
    var card = document.querySelector('.question-card[data-id="' + question.id + '"]');
    if (!card) {
      return;
    }
    if (question.type === "matching") {
      highlightMatching(card, question);
    } else {
      highlightChoice(card, question, correct);
    }
    card.classList.add(correct ? "is-correct" : "is-incorrect");
    lockCard(card);
    showFeedback(card, correct, question.pedagogical_hint);
  }

  function checkQuestion(id) {
    if (Object.prototype.hasOwnProperty.call(results, id)) {
      return;
    }
    var question = findQuestion(id);
    if (!question || !isAnswered(question)) {
      return;
    }
    var correct = isCorrect(question);
    results[id] = correct;
    // Слабые темы на главной считаются по этим записям.
    if (S) {
      S.setResult(SESSION_KEY + ":" + id, { ok: correct, topic: question.topic });
    }
    persistSession();

    paintResult(question, correct);
    updateProgress();
  }

  // ---- Сбор ответов ----

  function setChoiceAnswer(questionId, value) {
    answers[questionId] = value;
    persistAnswer(questionId);
    var card = document.querySelector('.question-card[data-id="' + questionId + '"]');
    if (card) {
      var options = card.querySelectorAll(".option");
      for (var i = 0; i < options.length; i += 1) {
        var input = options[i].querySelector("input");
        if (input && input.value === value) {
          options[i].classList.add("is-selected");
        } else {
          options[i].classList.remove("is-selected");
        }
      }
    }
  }

  function setMatchingAnswer(questionId, left, right) {
    if (!answers[questionId]) {
      answers[questionId] = {};
    }
    if (!right) {
      delete answers[questionId][left];
    } else {
      var current = answers[questionId];
      for (var key in current) {
        if (
          Object.prototype.hasOwnProperty.call(current, key) &&
          current[key] === right &&
          key !== left
        ) {
          delete current[key];
          var other = document.querySelector(
            'select[data-question="' + questionId + '"][data-left="' + key + '"]'
          );
          if (other) {
            other.value = "";
          }
        }
      }
      answers[questionId][left] = right;
    }
    persistAnswer(questionId);
    var select = document.querySelector(
      'select[data-question="' + questionId + '"][data-left="' + left + '"]'
    );
    if (select) {
      if (right) {
        select.classList.add("is-filled");
      } else {
        select.classList.remove("is-filled");
      }
    }
  }

  // ---- Завершение этапа ----

  function finishStage() {
    var total = questions.length || 0;
    var correct = countCorrect();
    var ratio = total ? correct / total : 0;
    if (ratio >= PASS_THRESHOLD) {
      stageState = "passed";
      // Пройденную сессию при следующей загрузке заводим заново.
      if (session) {
        session.done = true;
        persistSession();
      }
      showStatus(
        "Этап пройден! Правильных ответов: " + correct + " из " + total + ".",
        "pass"
      );
      if (S && typeof S.markStageCompleted === "function") {
        S.markStageCompleted(1, ratio);
      } else if (typeof window.markStageCompleted === "function") {
        window.markStageCompleted(1);
      }
      renderFinishActions(true);
      return;
    }
    stageState = "failed";
    showStatus(
      "Пока получилось " +
        correct +
        " из " +
        total +
        " (нужно 80%). Давай повторим этап ещё раз.",
      "fail"
    );
    renderFinishActions(false);
  }

  // ---- События ----

  function bindEvents() {
    var root = document.getElementById("questions");
    root.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches('input[type="radio"]')) {
        var id = Number(target.name.replace("q-", ""));
        setChoiceAnswer(id, target.value);
        checkQuestion(id);
      }
      if (target.matches("select[data-question]")) {
        var qid = Number(target.getAttribute("data-question"));
        setMatchingAnswer(qid, target.getAttribute("data-left"), target.value);
        checkQuestion(qid);
      }
    });

    document.getElementById("quiz-actions").addEventListener("click", function (event) {
      if (event.target.id === "finish-stage") {
        finishStage();
      }
      if (event.target.id === "retry-stage") {
        // Заново — значит с новыми вопросами и чистыми ответами.
        if (S) {
          S.clearSession(SESSION_KEY);
        }
        window.location.reload();
      }
      if (event.target.id === "go-home") {
        window.location.href = "index.html";
      }
    });
  }

  function loadQuestions() {
    var requested = isMistakesMode();
    Shared.loadJson("data/stage1.json")
      .then(function (data) {
        // Незавершённая сессия возвращает те же вопросы с ответами после F5.
        var restored = restoreSession(data);
        // Вошли по ссылке «Повторить ошибки», а сессия от обычного прохождения —
        // режим важнее: собираем набор из ошибок заново.
        if (restored && requested && !session.mistakes) {
          restored = false;
        }
        if (!restored) {
          startSession(data, requested);
        }
        if (session && session.mistakes) {
          showMistakesNote();
        }
        renderQuestions();
        restoreAnswers();
        restoreResults();
        updateProgress();
      })
      .catch(function () {
        showStatus(
          "Не удалось загрузить вопросы. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadQuestions();
  });
})();
