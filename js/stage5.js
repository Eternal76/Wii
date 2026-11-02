(function () {
  var editor = null;
  var task = null;
  var passedSmall = false;
  var passedBig = false;
  var solved = false;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    var html = "";
    for (var i = 0; i < questions.length; i += 1) {
      var id = "reflection-" + i;
      html +=
        '<label class="reflection-question" for="' +
        id +
        '">' +
        escapeHtml(questions[i]) +
        "</label>" +
        '<textarea id="' +
        id +
        '" class="reflection-input" rows="2"></textarea>';
    }
    document.getElementById("reflection-questions").innerHTML = html;
  }

  function initEditor() {
    var textarea = document.getElementById("editor");
    if (typeof CodeMirror === "undefined") {
      return;
    }
    editor = CodeMirror.fromTextArea(textarea, {
      mode: "python",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      lineWrapping: true
    });
  }

  function getCode() {
    return editor ? editor.getValue() : document.getElementById("editor").value;
  }

  function loadFile(path) {
    return fetch(path).then(function (response) {
      if (!response.ok) {
        throw new Error("Не удалось загрузить файл " + path);
      }
      return response.text();
    });
  }

  function check(which) {
    if (!task) {
      return;
    }
    var code = getCode();
    if (!code.trim()) {
      setOutput("Сначала напишите код программы.", "fail");
      return;
    }
    var path = which === "small" ? task.small_file : task.big_file;
    var expected = which === "small" ? task.expected_small : task.expected_big;
    var label = which === "small" ? "Маленький тест пройден" : "Большой тест пройден";

    setOutput("Выполняется…");
    loadFile(path)
      .then(function (fileContent) {
        return runPythonWithInput(code, fileContent);
      })
      .then(function (result) {
        if (result.error && result.error.trim()) {
          setOutput("Ошибка:\n" + result.error.replace(/\s+$/, ""), "error");
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
          if (passedSmall && passedBig) {
            completeStage();
          }
        } else {
          setOutput(
            (got ? "Вывод:\n" + got + "\n\n" : "") +
              "Неверный ответ. Твой: " + (got.trim() || "(пусто)") + ", Ожидаемый: " + expectedTrim + ".",
            "fail"
          );
        }
      })
      .catch(function (err) {
        setOutput("Ошибка: " + (err && err.message ? err.message : String(err)), "error");
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
    if (typeof markStageCompleted === "function") {
      markStageCompleted(5);
    }
    showReflection();
    showNextButton();
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
    document.getElementById("next-task").addEventListener("click", function () {
      window.location.reload();
    });
    document.getElementById("finish-trainer").addEventListener("click", finishTrainer);
  }

  function loadTask() {
    return fetch("data/tasks.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Не удалось загрузить задание");
        }
        return response.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : [data];
        if (!list.length) {
          throw new Error("Пустой файл задания");
        }
        // Случайная задача, чтобы этап можно было проходить многократно.
        task = list[Math.floor(Math.random() * list.length)];
        if (!task) {
          throw new Error("Пустой файл задания");
        }
        renderTask();
        renderReflection();
      });
  }

  function startPyodide() {
    setOutput("Загрузка Python...");
    initPyodide()
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
