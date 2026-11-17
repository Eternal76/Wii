(function () {
  // Прямой URL в недоступный этап — сразу на главную, до загрузки данных.
  if (window.Store) {
    Store.requireStage(5);
  }

  // Хранилище может быть ещё не подключено — тогда работаем только в памяти.
  var S = window.Store;
  // Задержка автосохранения черновика и рефлексии.
  var SAVE_DELAY = 500;

  var editor = null;
  var task = null;
  var passedSmall = false;
  var passedBig = false;
  var solved = false;
  var running = false;

  function debounce(fn) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, SAVE_DELAY);
    };
  }

  function setOutput(text, kind) {
    var el = document.getElementById("output-area");
    el.className = "output-area" + (kind ? " is-" + kind : "");
    el.textContent = text;
  }

  function renderTask() {
    document.getElementById("task-title").textContent = task.title || "";
    document.getElementById("task-description").textContent = task.description || "";
  }

  function renderReflection() {
    var questions = task.reflection || [];
    // Ответы могли быть уже написаны до перезагрузки.
    var saved = (S && S.getReflection(task.id)) || [];
    var html = "";
    for (var i = 0; i < questions.length; i += 1) {
      var id = "reflection-" + i;
      var value = typeof saved[i] === "string" ? Shared.escapeHtml(saved[i]) : "";
      html +=
        '<label class="reflection-question" for="' +
        id +
        '">' +
        Shared.escapeHtml(questions[i]) +
        "</label>" +
        '<textarea id="' +
        id +
        '" class="reflection-input" rows="2">' +
        value +
        "</textarea>";
    }
    document.getElementById("reflection-questions").innerHTML = html;
  }

  function initEditor() {
    editor = Shared.initEditor("editor");
    if (editor) {
      editor.on("change", saveDraftSoon);
    } else {
      document.getElementById("editor").addEventListener("input", saveDraftSoon);
    }
  }

  function getCode() {
    return editor ? editor.getValue() : document.getElementById("editor").value;
  }

  // ---- Черновик кода ----

  function saveDraft() {
    if (!S || !task) {
      return;
    }
    S.saveDraft("stage5:" + task.id, getCode());
  }

  var saveDraftSoon = debounce(saveDraft);

  function restoreDraft() {
    if (!S || !task) {
      return;
    }
    var saved = S.getDraft("stage5:" + task.id);
    if (typeof saved !== "string" || !saved) {
      return;
    }
    if (editor) {
      editor.setValue(saved);
    } else {
      document.getElementById("editor").value = saved;
    }
    var note = document.getElementById("draft-note");
    if (note) {
      note.hidden = false;
    }
  }

  // ---- Рефлексия ----

  function saveReflection() {
    if (!S || !task) {
      return;
    }
    var inputs = document
      .getElementById("reflection-questions")
      .querySelectorAll(".reflection-input");
    var list = [];
    for (var i = 0; i < inputs.length; i += 1) {
      list.push(inputs[i].value);
    }
    S.saveReflection(task.id, list);
  }

  var saveReflectionSoon = debounce(saveReflection);

  // Пишет результат проверки задачи: этап засчитывается только при двух пройденных тестах.
  function saveCheckResult() {
    if (S && task) {
      S.setResult("stage5:" + task.id, { ok: passedSmall && passedBig });
    }
  }

  function loadFile(path) {
    return fetch(path).then(function (response) {
      if (!response.ok) {
        throw new Error("Не удалось загрузить файл " + path);
      }
      return response.text();
    });
  }

  // Блокирует кнопки проверки на время прогона, иначе второй клик перемешает вывод.
  function setChecking(busy, activeId) {
    var ids = ["check-small", "check-big"];
    for (var i = 0; i < ids.length; i += 1) {
      var button = document.getElementById(ids[i]);
      if (!button) {
        continue;
      }
      if (!button.getAttribute("data-label")) {
        button.setAttribute("data-label", button.textContent);
      }
      button.disabled = busy;
      button.textContent = busy && ids[i] === activeId ? "Выполняется…" : button.getAttribute("data-label");
    }
  }

  function check(which) {
    if (!task || running) {
      return;
    }
    // Дебаунс может не успеть — сохраняем код принудительно.
    saveDraft();
    var code = getCode();
    if (!code.trim()) {
      setOutput("Сначала напишите код программы.", "fail");
      return;
    }
    var path = which === "small" ? task.small_file : task.big_file;
    var expected = which === "small" ? task.expected_small : task.expected_big;
    var label = which === "small" ? "Маленький тест пройден" : "Большой тест пройден";

    running = true;
    setChecking(true, which === "small" ? "check-small" : "check-big");
    setOutput("Выполняется…");
    loadFile(path)
      .then(function (fileContent) {
        return runPythonWithInput(code, fileContent);
      })
      .then(function (result) {
        if (result.error && result.error.trim()) {
          setOutput("Ошибка:\n" + result.error.replace(/\s+$/, ""), "error");
          saveCheckResult();
          return;
        }
        var got = result.output.replace(/\s+$/, "");
        var expectedTrim = String(expected).replace(/\s+$/, "");
        if (got.trim() === expectedTrim.trim()) {
          setOutput((got ? got + "\n\n" : "") + label, "ok");
          if (which === "small") {
            passedSmall = true;
          } else {
            passedBig = true;
          }
          saveCheckResult();
          if (passedSmall && passedBig) {
            completeStage();
          }
        } else {
          setOutput(
            (got ? "Вывод:\n" + got + "\n\n" : "") +
              "Неверный ответ. Твой: " + (got.trim() || "(пусто)") + ", Ожидаемый: " + expectedTrim + ".",
            "fail"
          );
          saveCheckResult();
        }
      })
      .catch(function (err) {
        setOutput("Ошибка: " + (err && err.message ? err.message : String(err)), "error");
      })
      .finally(function () {
        running = false;
        setChecking(false, null);
      });
  }

  function showReflection() {
    var block = document.getElementById("reflection-block");
    block.hidden = false;
    if (typeof block.scrollIntoView === "function") {
      block.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function showNextButton() {
    var button = document.getElementById("next-task");
    if (button) {
      button.hidden = false;
    }
  }

  // Оба теста пройдены: засчитываем этап, показываем рефлексию и кнопку следующей задачи.
  function completeStage() {
    if (solved) {
      return;
    }
    solved = true;
    // Сначала показываем результат, чтобы сбой сохранения не спрятал рефлексию.
    showReflection();
    showNextButton();
    if (S && typeof S.markStageCompleted === "function") {
      S.markStageCompleted(5, 1);
    } else if (typeof window.markStageCompleted === "function") {
      window.markStageCompleted(5);
    }
  }

  function finishTrainer() {
    window.location.href = "index.html";
  }

  function bindEvents() {
    document.getElementById("check-small").addEventListener("click", function () {
      check("small");
    });
    document.getElementById("check-big").addEventListener("click", function () {
      check("big");
    });
    document.getElementById("reflection-questions").addEventListener("input", saveReflectionSoon);
    document.getElementById("next-task").addEventListener("click", function () {
      saveDraft();
      // Следующая задача — новая, а не та же из сохранённой сессии.
      if (S) {
        S.clearSession("stage5");
      }
      window.location.reload();
    });
    document.getElementById("finish-trainer").addEventListener("click", finishTrainer);
  }

  function loadTask() {
    return Shared.loadJson("data/tasks.json")
      .then(function (data) {
        var list = Array.isArray(data) ? data : [data];
        if (!list.length) {
          throw new Error("Пустой файл задания");
        }
        // Черновик кода привязан к задаче: возвращаем ту же, что была до перезагрузки.
        var saved = S ? S.getSession("stage5") : null;
        var savedId = saved && saved.id;
        task = null;
        for (var i = 0; i < list.length; i += 1) {
          if (list[i] && list[i].id === savedId) {
            task = list[i];
          }
        }
        // Случайная задача, чтобы этап можно было проходить многократно.
        if (!task) {
          task = list[Math.floor(Math.random() * list.length)];
        }
        if (!task) {
          throw new Error("Пустой файл задания");
        }
        if (S) {
          S.setSession("stage5", { id: task.id });
        }
        renderTask();
        renderReflection();
        restoreDraft();
      });
  }

  function startPyodide() {
    setOutput("Загрузка Python...");
    Promise.resolve(Shared.warmUpPyodide())
      .then(function () {
        setOutput("Готов к запуску");
      })
      .catch(function (err) {
        setOutput("Не удалось загрузить Python: " + (err && err.message ? err.message : String(err)), "error");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    initEditor();
    loadTask()
      .catch(function () {
        setOutput(
          "Не удалось загрузить задание. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      })
      .then(function () {
        startPyodide();
      });
  });
})();
