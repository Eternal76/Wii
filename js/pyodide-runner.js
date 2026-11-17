(function () {
  // Общий модуль запуска Python в браузере через Pyodide (CDN).
  var PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
  // Сколько ждём код ученика, прежде чем прервать его как зациклившийся.
  var RUN_TIMEOUT_MS = 10000;
  var LOOP_ERROR = "Похоже, код зациклился. Проверьте условие выхода из цикла.\n";

  // Таймер живёт в отдельном потоке: пока Python крутит цикл, главный поток занят
  // и setTimeout в нём не срабатывает. Потоку нужен общий SharedArrayBuffer.
  var WORKER_SOURCE =
    "var timer = null;" +
    "onmessage = function (event) {" +
    "  clearTimeout(timer);" +
    "  if (!event.data || !event.data.ms) { return; }" +
    "  timer = setTimeout(function () {" +
    // 2 — код прерывания Pyodide; Int32Array кладёт его в первый байт буфера.
    "    Atomics.store(new Int32Array(event.data.sab), 0, 2);" +
    "  }, event.data.ms);" +
    "};";

  var pyodideInstance = null;
  var loadingPromise = null;
  var interruptSAB = null;
  var interruptBuffer = null;
  var interruptWorker = null;
  var interruptReady = false;
  var interruptDisabled = false;

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

  // Включает прерывание по таймауту. Без SharedArrayBuffer (GitHub Pages не отдаёт
  // COOP/COEP-заголовки) прерывание невозможно — молча работаем без него.
  function initInterrupt(pyodide) {
    if (interruptReady || interruptDisabled) {
      return interruptReady;
    }
    try {
      if (typeof SharedArrayBuffer === "undefined" || typeof Worker === "undefined") {
        throw new Error("нет SharedArrayBuffer");
      }
      interruptSAB = new SharedArrayBuffer(4);
      interruptBuffer = new Uint8Array(interruptSAB);
      pyodide.setInterruptBuffer(interruptBuffer);
      interruptWorker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" })));
      interruptReady = true;
    } catch (e) {
      interruptSAB = null;
      interruptBuffer = null;
      interruptWorker = null;
      interruptReady = false;
      interruptDisabled = true;
    }
    return interruptReady;
  }

  // Без прерывания единственный способ не подвесить вкладку — не запускать заведомо
  // бесконечный цикл: while True, в теле которого нет break/return/raise/exit.
  function looksEndless(code) {
    var lines = String(code == null ? "" : code).split("\n");
    for (var i = 0; i < lines.length; i += 1) {
      var head = lines[i].match(/^(\s*)while\s+(True|1)\s*:/);
      if (!head) {
        continue;
      }
      var indent = head[1].length;
      var body = "";
      for (var j = i + 1; j < lines.length; j += 1) {
        var line = lines[j];
        if (line.trim() && line.match(/^\s*/)[0].length <= indent) {
          break;
        }
        body += line + "\n";
      }
      if (!/\b(break|return|raise|exit)\b/.test(body)) {
        return true;
      }
    }
    return false;
  }

  // Пишет inputString в виртуальные файлы input.txt, выполняет code и возвращает { output, error }.
  async function runPythonWithInput(code, inputString) {
    var pyodide = await initPyodide();
    var output = "";
    var error = "";
    var text = inputString == null ? "" : String(inputString);

    // Дословно, без добавленного перевода строки: от этого зависят задачи этапа 4.
    pyodide.FS.writeFile("/input.txt", text);
    // Второй путь — относительно рабочего каталога (/home/pyodide), как написано в задании.
    try {
      pyodide.FS.writeFile("input.txt", text);
    } catch (e) {
      // Каталог недоступен — остаётся абсолютный путь.
    }

    var interruptible = initInterrupt(pyodide);
    if (!interruptible && looksEndless(code)) {
      return { output: "", error: LOOP_ERROR };
    }

    pyodide.setStdout({
      batched: function (chunk) {
        output += chunk + "\n";
      }
    });
    pyodide.setStderr({
      batched: function (chunk) {
        error += chunk + "\n";
      }
    });

    var startedAt = Date.now();
    if (interruptible) {
      interruptBuffer.fill(0);
      interruptWorker.postMessage({ sab: interruptSAB, ms: RUN_TIMEOUT_MS });
    }

    try {
      pyodide.runPython(code);
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      // KeyboardInterrupt после нашего таймаута — это зацикливание, а не ошибка ученика.
      if (interruptible && Date.now() - startedAt >= RUN_TIMEOUT_MS - 100 && /KeyboardInterrupt/.test(message)) {
        error += LOOP_ERROR;
      } else {
        error += message + "\n";
      }
    } finally {
      if (interruptible) {
        // Снимаем таймер и флаг прерывания, чтобы следующий запуск шёл нормально.
        interruptWorker.postMessage({});
        interruptBuffer.fill(0);
      }
      pyodide.setStdout({});
      pyodide.setStderr({});
    }

    return { output: output, error: error };
  }

  window.initPyodide = initPyodide;
  window.runPythonWithInput = runPythonWithInput;
})();
