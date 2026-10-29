(function () {
  // Порог прохождения этапа: 80% правильных ответов.
  var PASS_THRESHOLD = 0.8;

  var questions = [];
  // Ответы ученика: { id: "вариант" } или { id: { left: right } } для matching.
  var answers = {};
  // Результат проверки: { id: true/false }. Ключ появляется после проверки вопроса.
  var results = {};
  // Состояние этапа: "in-progress" | "failed".
  var stageState = "in-progress";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
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
    document.getElementById("answered-bar").setAttribute("aria-valuenow", String(percent));
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
    var html = '<div class="options">';
    for (var i = 0; i < question.options.length; i += 1) {
      var option = question.options[i];
      html +=
        '<label class="option">' +
        '<input type="radio" name="q-' +
        question.id +
        '" value="' +
        escapeHtml(option) +
        '">' +
        "<span>" +
        escapeHtml(option) +
        "</span></label>";
    }
    html += "</div>";
    return html;
  }

  function renderMatching(question) {
    var rights = shuffle(
      question.pairs.map(function (pair) {
        return pair.right;
      })
    );
    var html = '<div class="matching">';
    for (var i = 0; i < question.pairs.length; i += 1) {
      var left = question.pairs[i].left;
      html +=
        '<div class="matching-left">' +
        escapeHtml(left) +
        "</div>" +
        '<select data-question="' +
        question.id +
        '" data-left="' +
        escapeHtml(left) +
        '">' +
        '<option value="">Выберите назначение</option>';
      for (var j = 0; j < rights.length; j += 1) {
        var right = rights[j];
        html +=
          '<option value="' +
          escapeHtml(right) +
          '">' +
          escapeHtml(right) +
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
      '<p class="question-prompt">' +
      escapeHtml(question.prompt) +
      "</p>";
    if (question.type === "code_output" && question.code) {
      html += '<pre class="code-block"><code>' + escapeHtml(question.code) + "</code></pre>";
    }
    if (question.type === "matching") {
      html += renderMatching(question);
    } else {
      html += renderChoiceOptions(question);
    }
    html += '<div class="question-feedback" hidden></div>';
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
      escapeHtml(title) +
      "</p>" +
      '<p class="feedback-text">' +
      escapeHtml(text) +
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

    var card = document.querySelector('.question-card[data-id="' + id + '"]');
    if (card) {
      if (question.type === "matching") {
        highlightMatching(card, question);
      } else {
        highlightChoice(card, question, correct);
      }
      card.classList.add(correct ? "is-correct" : "is-incorrect");
      lockCard(card);
      showFeedback(card, correct, question.pedagogical_hint);
    }
    updateProgress();
  }

  // ---- Сбор ответов ----

  function setChoiceAnswer(questionId, value) {
    answers[questionId] = value;
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
      showStatus(
        "Этап пройден! Правильных ответов: " + correct + " из " + total + ".",
        "pass"
      );
      if (typeof markStageCompleted === "function") {
        markStageCompleted(1);
      }
      window.setTimeout(function () {
        window.location.href = "index.html";
      }, 1200);
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
    var actions = document.getElementById("quiz-actions");
    actions.innerHTML =
      '<button type="button" class="btn" id="retry-stage">Пройти заново</button>';
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
        window.location.reload();
      }
    });
  }

  function loadQuestions() {
    fetch("data/stage1.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Не удалось загрузить вопросы");
        }
        return response.json();
      })
      .then(function (data) {
        questions = data;
        renderQuestions();
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
