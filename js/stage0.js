(function () {
  // Порог прохождения модуля: 80% правильных ответов.
  var PASS_THRESHOLD = 0.8;

  var modules = [];
  var totalModules = 0;
  var currentIndex = 0;

  // Ответы и результаты текущего модуля.
  var answers = {};
  var results = {};
  // Состояние текущего модуля: "in-progress" | "passed" | "failed".
  var moduleState = "in-progress";

  // Тест «Я знаю базу» (пропуск этапа).
  var placementQuestions = [];
  var placementChecked = false;
  var PLACEMENT_THRESHOLD = 0.9;

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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentModule() {
    return modules[currentIndex] || null;
  }

  function currentTasks() {
    var module = currentModule();
    return module && module.tasks ? module.tasks : [];
  }

  function findTask(id) {
    var tasks = currentTasks();
    for (var i = 0; i < tasks.length; i += 1) {
      if (tasks[i].id === id) {
        return tasks[i];
      }
    }
    return null;
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

  // ---- Прогресс и статус ----

  function updateProgress() {
    var total = currentTasks().length;
    var checked = countChecked();
    var percent = total ? Math.round((checked / total) * 100) : 0;
    document.getElementById("module-label").textContent =
      "Модуль " + (currentIndex + 1) + " из " + totalModules;
    document.getElementById("answered-percent").textContent = percent + "%";
    document.getElementById("answered-bar").setAttribute("aria-valuenow", String(percent));
    document.getElementById("answered-bar-fill").style.width = percent + "%";
  }

  function showStatus(text, kind) {
    var el = document.getElementById("module-status");
    el.hidden = false;
    el.textContent = text;
    el.className = "quiz-status is-" + kind;
  }

  function hideStatus() {
    var el = document.getElementById("module-status");
    el.hidden = true;
    el.textContent = "";
    el.className = "quiz-status";
  }

  // ---- Рендер вопросов ----

  function renderChoiceOptions(task) {
    var html = '<div class="options">';
    for (var i = 0; i < task.options.length; i += 1) {
      var option = task.options[i];
      html +=
        '<label class="option">' +
        '<input type="radio" name="q-' +
        escapeHtml(task.id) +
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

  function renderTask(task, index) {
    var html =
      '<section class="question-card" data-id="' +
      escapeHtml(task.id) +
      '">' +
      '<p class="question-meta">Вопрос ' +
      (index + 1) +
      "</p>" +
      '<p class="question-prompt">' +
      escapeHtml(task.prompt) +
      "</p>";
    if (task.type === "code_output" && task.code) {
      html += '<pre class="code-block"><code>' + escapeHtml(task.code) + "</code></pre>";
    }
    html += renderChoiceOptions(task);
    html += '<div class="question-feedback" hidden></div>';
    html += "</section>";
    return html;
  }

  function renderTasks() {
    var root = document.getElementById("questions");
    var tasks = currentTasks();
    var html = "";
    for (var i = 0; i < tasks.length; i += 1) {
      html += renderTask(tasks[i], i);
    }
    root.innerHTML = html;
  }

  function renderModuleActions() {
    var actions = document.getElementById("module-actions");
    var html = "";
    if (moduleState === "passed") {
      if (currentIndex === totalModules - 1) {
        html = '<button type="button" class="btn" id="finish-stage0">Завершить этап 0</button>';
      } else {
        html = '<button type="button" class="btn" id="next-module">Следующий модуль</button>';
      }
    } else if (moduleState === "failed") {
      html = '<button type="button" class="btn" id="retry-module">Пройти модуль заново</button>';
    }
    actions.innerHTML = html;
  }

  // ---- Мгновенная проверка ----

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

  function highlightChoice(card, correct) {
    var options = card.querySelectorAll(".option");
    for (var i = 0; i < options.length; i += 1) {
      var input = options[i].querySelector("input");
      if (input && input.checked) {
        options[i].classList.add(correct ? "is-correct" : "is-incorrect");
      }
    }
  }

  function checkQuestion(id) {
    if (moduleState !== "in-progress") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(results, id)) {
      return;
    }
    var task = findTask(id);
    if (!task) {
      return;
    }
    var value = answers[id];
    if (typeof value !== "string" || value === "") {
      return;
    }
    var correct = value === task.correct;
    results[id] = correct;

    var card = document.querySelector('.question-card[data-id="' + id + '"]');
    if (card) {
      highlightChoice(card, correct);
      card.classList.add(correct ? "is-correct" : "is-incorrect");
      lockCard(card);
      showFeedback(card, correct, task.pedagogical_hint);
    }
    updateProgress();

    if (countChecked() === currentTasks().length) {
      evaluateModule();
    }
  }

  function setChoiceAnswer(id, value) {
    answers[id] = value;
    var card = document.querySelector('.question-card[data-id="' + id + '"]');
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

  // ---- Оценка модуля ----

  function evaluateModule() {
    var total = currentTasks().length;
    var correct = countCorrect();
    if (total === 0) {
      moduleState = "passed";
      showStatus("В этом модуле пока нет вопросов.", "pass");
      renderModuleActions();
      return;
    }
    if (correct / total >= PASS_THRESHOLD) {
      moduleState = "passed";
      showStatus("Модуль пройден! Переход к следующему.", "pass");
    } else {
      moduleState = "failed";
      showStatus(
        "Правильных ответов: " + correct + " из " + total + " (нужно 80%). Пройди модуль заново.",
        "fail"
      );
    }
    renderModuleActions();
  }

  // ---- Переключение модулей ----

  function renderModule() {
    var module = currentModule();
    if (!module) {
      return;
    }
    answers = {};
    results = {};
    moduleState = "in-progress";
    hideStatus();
    document.getElementById("module-title").textContent = module.title || module.id;
    renderTasks();
    document.getElementById("module-actions").innerHTML = "";
    updateProgress();
    if (currentTasks().length === 0) {
      evaluateModule();
    }
  }

  function nextModule() {
    if (currentIndex < totalModules - 1) {
      currentIndex += 1;
      renderModule();
    }
  }

  function finishStage0() {
    if (typeof markStageCompleted === "function") {
      markStageCompleted(0);
    }
    window.location.href = "index.html";
  }

  // ---- Тест «Я знаю базу» (пропуск этапа) ----

  function showPlacementStatus(text, kind) {
    var el = document.getElementById("placement-status");
    el.hidden = false;
    el.textContent = text;
    el.className = "quiz-status is-" + kind;
  }

  function renderPlacement() {
    var root = document.getElementById("placement-questions");
    var html = "";
    for (var i = 0; i < placementQuestions.length; i += 1) {
      html += renderTask(placementQuestions[i], i);
    }
    root.innerHTML = html;
    var status = document.getElementById("placement-status");
    status.hidden = true;
    status.textContent = "";
    status.className = "quiz-status";
    document.getElementById("placement-actions").innerHTML =
      '<button type="button" class="btn" id="check-placement">Проверить</button>';
    placementChecked = false;
  }

  function openPlacement() {
    document.getElementById("placement-modal").hidden = false;
    if (placementQuestions.length) {
      renderPlacement();
      return;
    }
    fetch("data/placement.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Не удалось загрузить тест");
        }
        return response.json();
      })
      .then(function (data) {
        placementQuestions = shuffle(data.questions || []);
        renderPlacement();
      })
      .catch(function () {
        showPlacementStatus(
          "Не удалось загрузить тест. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      });
  }

  function closePlacement() {
    document.getElementById("placement-modal").hidden = true;
  }

  function checkPlacement() {
    if (placementChecked) {
      return;
    }
    placementChecked = true;
    var root = document.getElementById("placement-questions");
    var correctCount = 0;
    for (var i = 0; i < placementQuestions.length; i += 1) {
      var question = placementQuestions[i];
      var card = root.querySelector('.question-card[data-id="' + question.id + '"]');
      var selected = card ? card.querySelector('input[type="radio"]:checked') : null;
      var correct = !!selected && selected.value === question.correct;
      if (correct) {
        correctCount += 1;
      }
      if (card) {
        var options = card.querySelectorAll(".option");
        for (var j = 0; j < options.length; j += 1) {
          var input = options[j].querySelector("input");
          if (!input) {
            continue;
          }
          if (input.value === question.correct) {
            options[j].classList.add("is-correct");
          } else if (input.checked) {
            options[j].classList.add("is-incorrect");
          }
          input.disabled = true;
        }
        card.classList.add(correct ? "is-correct" : "is-incorrect");
        card.classList.add("is-locked");
        showFeedback(card, correct, question.pedagogical_hint);
      }
    }

    var total = placementQuestions.length;
    var ratio = total ? correctCount / total : 0;
    if (ratio >= PLACEMENT_THRESHOLD) {
      if (typeof markStageCompleted === "function") {
        markStageCompleted(0);
      }
      showPlacementStatus("Вы успешно прошли тест на знание базы! Этап 1 разблокирован", "pass");
      document.getElementById("placement-actions").innerHTML =
        '<button type="button" class="btn" id="placement-home">На главную</button>';
    } else {
      showPlacementStatus(
        "Стоит повторить базу. Правильных ответов: " +
          correctCount +
          " из " +
          total +
          " (нужно 90%).",
        "fail"
      );
      document.getElementById("placement-actions").innerHTML =
        '<button type="button" class="btn" id="placement-back">Вернуться к модулям</button>';
    }
  }

  function bindEvents() {
    var root = document.getElementById("questions");
    root.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches('input[type="radio"]')) {
        var id = target.name.replace("q-", "");
        setChoiceAnswer(id, target.value);
        checkQuestion(id);
      }
    });

    document.getElementById("module-actions").addEventListener("click", function (event) {
      if (event.target.id === "next-module") {
        nextModule();
      }
      if (event.target.id === "retry-module") {
        renderModule();
      }
      if (event.target.id === "finish-stage0") {
        finishStage0();
      }
    });

    document.getElementById("open-placement").addEventListener("click", openPlacement);
    document.getElementById("close-placement").addEventListener("click", closePlacement);
    document.getElementById("placement-modal").addEventListener("click", function (event) {
      if (event.target.id === "placement-modal") {
        closePlacement();
      }
    });
    document.getElementById("placement-actions").addEventListener("click", function (event) {
      if (event.target.id === "check-placement") {
        checkPlacement();
      }
      if (event.target.id === "placement-home") {
        window.location.href = "index.html";
      }
      if (event.target.id === "placement-back") {
        closePlacement();
      }
    });
  }

  function loadData() {
    fetch("data/stage0.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Не удалось загрузить данные этапа");
        }
        return response.json();
      })
      .then(function (data) {
        modules = data.modules || [];
        totalModules = modules.length;
        currentIndex = 0;
        renderModule();
      })
      .catch(function () {
        showStatus(
          "Не удалось загрузить данные. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadData();
  });
})();
