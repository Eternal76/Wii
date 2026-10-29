(function () {
  var editor = null;
  var task = null;
  var hints = [];

  function setOutput(text, kind) {
    var el = document.getElementById("output-area");
    el.className = "output-area" + (kind ? " is-" + kind : "");
    el.textContent = text;
  }

  function renderTask() {
    document.getElementById("task-title").textContent = task.title || "";
    document.getElementById("task-description").textContent = task.description || "";
    if (editor) {
      editor.setValue(task.buggy_code || "");
      editor.clearHistory();
    }
  }

  function initEditor() {
    var textarea = document.getElementById("editor");
    if (typeof CodeMirror === "undefined") {
      textarea.value = "";
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

  function showHint(level) {
    var el = document.getElementById("hint-area");
    var text = hints[level - 1];
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = "Подсказка " + level + ": " + text;
  }

  function runCode() {
    if (!task) {
      return;
    }
    var code = editor ? editor.getValue() : document.getElementById("editor").value;
    setOutput("Выполняется…");
    runPythonWithInput(code, task.input_data)
      .then(function (result) {
        if (result.error && result.error.trim()) {
          setOutput("Ошибка:\n" + result.error.replace(/\s+$/, ""), "error");
          return;
        }
        var got = result.output.replace(/\s+$/, "");
        var expected = String(task.expected_output).replace(/\s+$/, "");
        if (got.trim() === expected.trim()) {
          setOutput((got ? got + "\n\n" : "") + "Верно! Задача решена", "ok");
          if (typeof markStageCompleted === "function") {
            markStageCompleted(4);
          }
        } else {
          setOutput(
            (got ? "Вывод:\n" + got + "\n\n" : "") +
              "Твой ответ: " + (got.trim() || "(пусто)") + ". Ожидалось: " + expected + ".",
            "fail"
          );
        }
      })
      .catch(function (err) {
        setOutput("Ошибка: " + (err && err.message ? err.message : String(err)), "error");
      });
  }

  function bindEvents() {
    document.getElementById("run-code").addEventListener("click", runCode);
    var buttons = document.querySelectorAll(".hint-actions [data-hint]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener("click", function (event) {
        showHint(Number(event.currentTarget.getAttribute("data-hint")));
      });
    }
  }

  function loadData() {
    return Promise.all([
      fetch("data/stage4.json").then(function (response) {
        if (!response.ok) {
          throw new Error("stage4.json");
        }
        return response.json();
      }),
      fetch("data/hints.json").then(function (response) {
        if (!response.ok) {
          throw new Error("hints.json");
        }
        return response.json();
      })
    ]).then(function (results) {
      var taskData = results[0];
      var hintsData = results[1];
      task = Array.isArray(taskData) ? taskData[0] : taskData;
      if (!task) {
        throw new Error("Пустой файл задания");
      }
      hints = hintsData["stage4_task" + String(task.id).replace("task_", "")] || [];
      renderTask();
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
    loadData()
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
