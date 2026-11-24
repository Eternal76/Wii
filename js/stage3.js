(function () {
  // Прямой URL в недоступный этап — сразу на главную, до загрузки данных.
  if (window.Store) {
    Store.requireStage(3);
  }

  var task = null;
  var hintIndex = 0;
  var solved = false;
  var pool = []; // блоки, из которых собирают программу
  var program = []; // уже собранная программа
  var poolRank = {}; // исходный порядок пула: id -> индекс

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
      'Режим повторения: задача, где вы ошиблись. <a class="mistakes-link" href="stage3.html">Выйти из режима</a>';
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

  function sameOrder(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  // Перемешивает блоки так, чтобы они случайно не оказались уже в верном порядке.
  function shuffledBlocks() {
    var blocks = task.blocks;
    var order = blocks.map(function (block) {
      return block.id;
    });
    if (order.length < 2) {
      return blocks.slice();
    }
    var mixed;
    do {
      mixed = Shared.shuffle(blocks);
    } while (
      mixed.length > 1 &&
      sameOrder(
        mixed.map(function (block) {
          return block.id;
        }),
        task.correct_order
      )
    );
    return mixed;
  }

  // Пул получает свежий порядок, программа пуста.
  function fillPool() {
    pool = shuffledBlocks();
    poolRank = {};
    for (var i = 0; i < pool.length; i += 1) {
      poolRank[pool[i].id] = i;
    }
    program = [];
  }

  // Убранный из программы блок возвращается на своё место в пуле.
  function sortPool(blocks) {
    return blocks.slice().sort(function (a, b) {
      return poolRank[a.id] - poolRank[b.id];
    });
  }

  function findBlock(id) {
    for (var i = 0; i < task.blocks.length; i += 1) {
      if (task.blocks[i].id === id) {
        return task.blocks[i];
      }
    }
    return null;
  }

  function renderTitle() {
    document.getElementById("task-title").textContent = task.title || "";
    document.getElementById("task-description").textContent = task.description || "";
  }

  function createBlockItem(block, inProgram) {
    var li = document.createElement("li");
    li.className = "block-item";
    li.setAttribute("data-id", block.id);

    var pre = document.createElement("pre");
    var code = document.createElement("code");
    code.textContent = block.text;
    pre.appendChild(code);
    li.appendChild(pre);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "block-btn";
    button.setAttribute("data-id", block.id);
    button.setAttribute("data-action", inProgram ? "remove" : "add");
    button.textContent = inProgram ? "← Убрать" : "Добавить →";
    // Подпись называет сам блок: «Добавить» без текста блока скринридеру бесполезно.
    button.setAttribute(
      "aria-label",
      (inProgram ? "Убрать блок: " : "Добавить блок: ") + code.textContent.replace(/\s+/g, " ").trim()
    );
    li.appendChild(button);

    return li;
  }

  function renderList(blocks, list, inProgram) {
    list.innerHTML = "";
    for (var i = 0; i < blocks.length; i += 1) {
      list.appendChild(createBlockItem(blocks[i], inProgram));
    }
  }

  function renderZones() {
    renderList(pool, document.getElementById("block-pool"), false);
    renderList(program, document.getElementById("block-program"), true);
  }

  function announce(text) {
    var el = document.getElementById("builder-status");
    if (el) {
      el.textContent = text;
    }
  }

  function addToProgram(id) {
    var block = null;
    var rest = [];
    for (var i = 0; i < pool.length; i += 1) {
      if (pool[i].id === id) {
        block = pool[i];
      } else {
        rest.push(pool[i]);
      }
    }
    if (!block) {
      return;
    }
    pool = rest;
    program.push(block);
    renderZones();
    announce("Блок добавлен, в программе " + program.length + " из " + task.correct_order.length);
  }

  function removeFromProgram(id) {
    var rest = [];
    for (var i = 0; i < program.length; i += 1) {
      if (program[i].id === id) {
        pool.push(program[i]);
      } else {
        rest.push(program[i]);
      }
    }
    program = rest;
    pool = sortPool(pool);
    renderZones();
    announce("Блок убран, в программе " + program.length + " из " + task.correct_order.length);
  }

  function readIds(list) {
    var items = list.querySelectorAll(".block-item");
    var ids = [];
    for (var i = 0; i < items.length; i += 1) {
      ids.push(items[i].getAttribute("data-id"));
    }
    return ids;
  }

  // Переносит состояние из DOM в массивы. Потерянный при перетаскивании блок
  // возвращается в пул, дубль отбрасывается — задача всегда остаётся решаемой.
  function syncFromDom() {
    if (!task) {
      return;
    }
    var used = {};
    var nextProgram = [];
    var nextPool = [];
    var i;
    var block;

    var programIds = readIds(document.getElementById("block-program"));
    for (i = 0; i < programIds.length; i += 1) {
      block = findBlock(programIds[i]);
      if (block && !used[block.id]) {
        used[block.id] = true;
        nextProgram.push(block);
      }
    }

    var poolIds = readIds(document.getElementById("block-pool"));
    for (i = 0; i < poolIds.length; i += 1) {
      block = findBlock(poolIds[i]);
      if (block && !used[block.id]) {
        used[block.id] = true;
        nextPool.push(block);
      }
    }

    for (i = 0; i < task.blocks.length; i += 1) {
      if (!used[task.blocks[i].id]) {
        nextPool.push(task.blocks[i]);
      }
    }

    program = nextProgram;
    pool = sortPool(nextPool);
    renderZones();
  }

  function showMessage(text, kind) {
    var el = document.getElementById("builder-message");
    el.hidden = false;
    el.textContent = text;
    el.className = "builder-message is-" + kind;
  }

  function hideMessage() {
    var el = document.getElementById("builder-message");
    el.hidden = true;
    el.textContent = "";
    el.className = "builder-message";
  }

  function showNextButton() {
    var button = document.getElementById("next-task");
    if (button) {
      button.hidden = false;
    }
  }

  function hideNextButton() {
    var button = document.getElementById("next-task");
    if (button) {
      button.hidden = true;
    }
  }

  function checkOrder() {
    if (solved || !task) {
      return;
    }
    if (!program.length) {
      showMessage("Сначала соберите программу: добавьте блоки из «Блоков».", "hint");
      return;
    }

    var items = document.querySelectorAll("#block-program .block-item");
    var correct = program.length === task.correct_order.length;

    for (var i = 0; i < program.length; i += 1) {
      if (program[i].id === task.correct_order[i]) {
        items[i].classList.add("correct");
      } else {
        items[i].classList.add("wrong");
        correct = false;
      }
    }

    if (correct) {
      solved = true;
      if (window.Store) {
        Store.setResult("stage3:" + task.id, { ok: true });
        Store.markStageCompleted(3, 1);
      } else if (typeof window.markStageCompleted === "function") {
        window.markStageCompleted(3);
      }
      showMessage("Верно! Программа собрана.", "ok");
      showNextButton();
      return;
    }

    if (window.Store) {
      Store.setResult("stage3:" + task.id, { ok: false });
    }

    var hints = task.hints || [];
    var hint = hints.length ? hints[Math.min(hintIndex, hints.length - 1)] : "Порядок пока неверный. Попробуй ещё раз.";
    if (hintIndex < hints.length) {
      hintIndex += 1;
    }
    showMessage(
      "Не совсем. " +
        hint +
        " Лишние блоки оставьте в «Блоках»: в программе должно быть " +
        task.correct_order.length +
        ".",
      "hint"
    );
  }

  function resetOrder() {
    solved = false;
    hintIndex = 0;
    hideMessage();
    hideNextButton();
    fillPool();
    renderZones();
  }

  function onZoneClick(event) {
    var button = event.target.closest(".block-btn");
    if (!button) {
      return;
    }
    var id = button.getAttribute("data-id");
    if (button.getAttribute("data-action") === "add") {
      addToProgram(id);
    } else {
      removeFromProgram(id);
    }
  }

  function bindEvents() {
    document.getElementById("check-order").addEventListener("click", checkOrder);
    document.getElementById("reset-order").addEventListener("click", resetOrder);
    document.getElementById("next-task").addEventListener("click", function () {
      window.location.reload();
    });
    document.getElementById("block-pool").addEventListener("click", onZoneClick);
    document.getElementById("block-program").addEventListener("click", onZoneClick);
  }

  function sortableOptions(sort) {
    return {
      group: { name: "blocks", pull: true, put: true },
      sort: sort,
      animation: 150,
      ghostClass: "block-ghost",
      chosenClass: "block-chosen",
      filter: ".block-btn", // кнопки не должны начинать перетаскивание
      onEnd: function () {
        // Отложенно: Sortable ещё держит перетаскиваемый элемент в момент onEnd.
        setTimeout(syncFromDom, 0);
      }
    };
  }

  function initSortable() {
    if (typeof Sortable === "undefined") {
      return;
    }
    // Внутри пула порядок не важен, поэтому там sort: false.
    new Sortable(document.getElementById("block-pool"), sortableOptions(false));
    new Sortable(document.getElementById("block-program"), sortableOptions(true));
  }

  function loadTask() {
    Shared.loadJson("data/blocks.json")
      .then(function (data) {
        var list = Array.isArray(data) ? data : [data];
        if (!list.length) {
          throw new Error("Пустой файл задания");
        }
        // Случайная задача, чтобы этап можно было проходить многократно.
        // В режиме ошибок вместо неё — проваленная задача.
        var mistakeTask = isMistakesMode() ? pickMistake(list, "stage3:") : null;
        task = mistakeTask || list[Math.floor(Math.random() * list.length)];
        if (!task || !task.blocks) {
          throw new Error("Пустое задание");
        }
        if (mistakeTask) {
          showMistakesNote();
        }
        renderTitle();
        fillPool();
        renderZones();
        initSortable();
      })
      .catch(function () {
        showMessage(
          "Не удалось загрузить задание. Откройте сайт через локальный сервер, а не file://.",
          "hint"
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadTask();
  });
})();
