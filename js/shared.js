(function () {
  // Общие помощники этапов: экранирование, перемешивание, загрузка JSON, редактор.
  // DOM на загрузке не трогаем — файл должен грузиться и в node (для проверок).
  var root = typeof window !== "undefined" ? window : globalThis;

  // Одна формулировка на все этапы: чаще всего страницу открыли как файл.
  var LOAD_ERROR =
    "Не удалось загрузить данные. Откройте сайт через локальный сервер, а не file://.";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function hashString(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return hash;
  }

  // Верный ответ в данных лежит первым, поэтому варианты перемешиваем.
  // Порядок зависит от id: перебор не работает, а F5 картинку не меняет.
  function stableOptions(id, options) {
    return options.slice().sort(function (a, b) {
      return hashString(id + a) - hashString(id + b);
    });
  }

  function loadJson(url) {
    return fetch(url).then(
      function (response) {
        if (!response.ok) {
          // Сервер ответил, но файла нет.
          throw new Error("HTTP " + response.status + ". " + LOAD_ERROR);
        }
        return response.json();
      },
      function () {
        // Сети нет или страница открыта как file://.
        throw new Error(LOAD_ERROR);
      }
    );
  }

  // Без CodeMirror этап должен работать на голом textarea, поэтому null — норма.
  function initEditor(textareaId) {
    if (!root.CodeMirror) {
      return null;
    }
    var textarea = document.getElementById(textareaId);
    if (!textarea) {
      return null;
    }
    return root.CodeMirror.fromTextArea(textarea, {
      mode: "python",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      lineWrapping: true
    });
  }

  // Грузим Pyodide заранее, чтобы первый запуск кода не ждал CDN.
  function warmUpPyodide() {
    if (typeof root.initPyodide !== "function") {
      return;
    }
    try {
      Promise.resolve(root.initPyodide()).catch(function (error) {
        console.warn("Pyodide не прогрелся:", error);
      });
    } catch (error) {
      console.warn("Pyodide не прогрелся:", error);
    }
  }

  root.Shared = {
    escapeHtml: escapeHtml,
    shuffle: shuffle,
    stableOptions: stableOptions,
    loadJson: loadJson,
    initEditor: initEditor,
    warmUpPyodide: warmUpPyodide
  };
})();
