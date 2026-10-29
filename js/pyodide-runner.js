(function () {
  // Общий модуль запуска Python в браузере через Pyodide (CDN).
  var PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
  var pyodideInstance = null;
  var loadingPromise = null;

  // Загружает Pyodide и возвращает объект pyodide. Повторные вызовы используют один экземпляр.
  async function initPyodide() {
    if (pyodideInstance) {
      return pyodideInstance;
    }
    if (loadingPromise) {
      return loadingPromise;
    }
    loadingPromise = (async function () {
      if (typeof loadPyodide === "undefined") {
        throw new Error("Pyodide не загружен. Проверьте подключение к CDN.");
      }
      pyodideInstance = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
      return pyodideInstance;
    })();
    try {
      return await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  // Пишет inputString в виртуальный файл /input.txt, выполняет code и возвращает { output, error }.
  async function runPythonWithInput(code, inputString) {
    var pyodide = await initPyodide();
    var output = "";
    var error = "";

    pyodide.FS.writeFile("/input.txt", inputString == null ? "" : String(inputString));

    pyodide.setStdout({
      batched: function (text) {
        output += text + "\n";
      }
    });
    pyodide.setStderr({
      batched: function (text) {
        error += text + "\n";
      }
    });

    try {
      pyodide.runPython(code);
    } catch (err) {
      error += (err && err.message ? err.message : String(err)) + "\n";
    } finally {
      pyodide.setStdout({});
      pyodide.setStderr({});
    }

    return { output: output, error: error };
  }

  window.initPyodide = initPyodide;
  window.runPythonWithInput = runPythonWithInput;
})();
