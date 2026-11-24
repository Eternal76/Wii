(function () {
  // Прямой URL в недоступный этап — сразу на главную, до загрузки данных.
  if (window.Store) {
    Store.requireStage(4);
  }

  var editor = null;
  var task = null;
  var hints = [];
  var solved = false;
  var running = false;

  // Режим повторения включается ссылкой; отдельной сессии у этапа нет.
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
      'Режим повторения: задача, где вы ошиблись. <a class="mistakes-link" href="stage4.html">Выйти из режима</a>';
    title.parentNode.insertBefore(note, title.nextSibling);
  }

  // Первая проваленная задача, которая ещё есть в списке заданий.
  function pickMistake(list, prefix) {
    var results = window.Store ? Store.getResults(prefix) : {};
    for (var key in results) {
      if (
        !Object.prototype.hasOwnProperty.call(results, key) ||
        !results[key] ||
        results[key].ok !== false
      ) {
        continue;
      }
      for (var i = 0; i < list.length; i += 1) {
        if (String(list[i].id) === key.slice(prefix.length)) {
          return list[i];
        }
      }
    }
    return null;
  }

  function showNextButton() {
    var button = document.getElementById("next-task");
    if (button) {
      button.hidden = false;
    }
  }

  // Вердикт объявляется live-регионом, вывод лежит рядом без атрибута:
  // длинный вывод целиком не зачитывается, но остаётся доступным по навигации.
  function setOutput(output, verdict, kind) {
    var el = document.getElementById("output-area");
    var text = document.getElementById("output-text");
    var live = document.getElementById("output-verdict");
    el.className = "output-area" + (kind ? " is-" + kind : "");
    text.textContent = output ? (verdict ? output + "\n\n" : output) : "";
    live.textContent = verdict || "";
  }

  // Пока идёт прогон, live-регион молчит и объявляет только финальный вердикт.
  function setBusy(busy) {
    document.getElementById("output-area").setAttribute("aria-busy", busy ? "true" : "false");
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
    editor = Shared.initEditor("editor");
  }

  function showHint(level) {
    var el = document.getElementById("hint-area");
    var text = hints[level - 1];
    // Все кнопки управляют одним блоком: раскрыта только та, чья подсказка показана.
    var buttons = document.querySelectorAll(".hint-actions [data-hint]");
    for (var i = 0; i < buttons.length; i += 1) {
      var open =
        Boolean(text) && Number(buttons[i].getAttribute("data-hint")) === level;
      buttons[i].setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = "Подсказка " + level + ": " + text;
  }

  function runCode() {
    if (!task || running) {
      return;
    }
    var code = editor ? editor.getValue() : document.getElementById("editor").value;
    // Пока идёт прогон, второй запуск смешал бы вывод: stdout у Pyodide общий.
    var button = document.getElementById("run-code");
    var label = button.textContent;
    running = true;
    button.disabled = true;
    button.textContent = "Выполняется…";
    setBusy(true);
    setOutput("", "Выполняется…");
    runPythonWithInput(code, task.input_data)
      .then(function (result) {
        if (result.error && result.error.trim()) {
          if (window.Store) {
            Store.setResult("stage4:" + task.id, { ok: false });
          }
          setOutput(result.error.replace(/\s+$/, ""), "Ошибка выполнения", "error");
          return;
        }
        var got = result.output.replace(/\s+$/, "");
        var expected = String(task.expected_output).replace(/\s+$/, "");
        if (got.trim() === expected.trim()) {
          if (window.Store) {
            Store.setResult("stage4:" + task.id, { ok: true });
          }
          setOutput(got, "Верно! Задача решена", "ok");
          if (!solved) {
            solved = true;
            if (window.Store && typeof Store.markStageCompleted === "function") {
              Store.markStageCompleted(4, 1);
            } else if (typeof window.markStageCompleted === "function") {
              window.markStageCompleted(4);
            }
          }
          showNextButton();
        } else {
          if (window.Store) {
            Store.setResult("stage4:" + task.id, { ok: false });
          }
          setOutput(
            got ? "Вывод:\n" + got : "",
            "Неверный ответ. Твой ответ: " + (got.trim() || "(пусто)") + ". Ожидалось: " + expected + ".",
            "fail"
          );
        }
      })
      .catch(function (err) {
        if (window.Store) {
          Store.setResult("stage4:" + task.id, { ok: false });
        }
        setOutput("", "Ошибка: " + (err && err.message ? err.message : String(err)), "error");
      })
      .finally(function () {
        running = false;
        button.disabled = false;
        button.textContent = label;
        // Занятость снимаем после записи вердикта: объявится уже финальный текст.
        setBusy(false);
      });
  }

  function bindEvents() {
    document.getElementById("run-code").addEventListener("click", runCode);
    document.getElementById("next-task").addEventListener("click", function () {
      window.location.reload();
    });
    var buttons = document.querySelectorAll(".hint-actions [data-hint]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener("click", function (event) {
        showHint(Number(event.currentTarget.getAttribute("data-hint")));
      });
    }
  }

  function loadData() {
    var urls = ["data/stage4.json", "data/hints.json"];
    return Promise.all(urls.map(Shared.loadJson)).then(function (results) {
      var taskData = results[0];
      var hintsData = results[1];
      var list = Array.isArray(taskData) ? taskData : [taskData];
      if (!list.length) {
        throw new Error("Пустой файл задания");
      }
      // Случайная задача, чтобы этап можно было проходить многократно.
      // В режиме ошибок вместо неё — проваленная задача.
      var mistakeTask = isMistakesMode() ? pickMistake(list, "stage4:") : null;
      task = mistakeTask || list[Math.floor(Math.random() * list.length)];
      if (!task) {
        throw new Error("Пустой файл задания");
      }
      if (mistakeTask) {
        showMistakesNote();
      }
      hints = hintsData["stage4_task" + String(task.id).replace("task_", "")] || [];
      renderTask();
    });
  }

  function startPyodide() {
    setOutput("", "Загрузка Python...");
    Promise.resolve(Shared.warmUpPyodide())
      .then(function () {
        setOutput("", "Готов к запуску");
      })
      .catch(function (err) {
        setOutput(
          "",
          "Не удалось загрузить Python: " + (err && err.message ? err.message : String(err)),
          "error"
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    initEditor();
    loadData()
      .catch(function () {
        setOutput(
          "",
          "Не удалось загрузить задание. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      })
      .then(function () {
        startPyodide();
      });
  });
})();
