(function () {
  var task = null;
  var hintIndex = 0;
  var solved = false;

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
      mixed = shuffle(blocks);
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

  function renderTitle() {
    document.getElementById("task-title").textContent = task.title || "";
    document.getElementById("task-description").textContent = task.description || "";
  }

  function renderBlocks(blocks) {
    var list = document.getElementById("sortable-list");
    list.innerHTML = "";
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      var li = document.createElement("li");
      li.className = "block-item";
      li.setAttribute("data-id", block.id);

      var pre = document.createElement("pre");
      var code = document.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      li.appendChild(pre);

      list.appendChild(li);
    }
  }

  function currentOrder() {
    var items = document.querySelectorAll("#sortable-list .block-item");
    var order = [];
    for (var i = 0; i < items.length; i += 1) {
      order.push(items[i].getAttribute("data-id"));
    }
    return order;
  }

  function clearMarks() {
    var items = document.querySelectorAll("#sortable-list .block-item");
    for (var i = 0; i < items.length; i += 1) {
      items[i].classList.remove("correct", "wrong");
    }
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
    if (solved) {
      return;
    }
    clearMarks();
    var order = currentOrder();
    var items = document.querySelectorAll("#sortable-list .block-item");
    var correct = true;

    for (var i = 0; i < order.length; i += 1) {
      if (order[i] === task.correct_order[i]) {
        items[i].classList.add("correct");
      } else {
        items[i].classList.add("wrong");
        correct = false;
      }
    }

    if (correct) {
      solved = true;
      showMessage("Верно! Программа собрана.", "ok");
      if (typeof markStageCompleted === "function") {
        markStageCompleted(3);
      }
      showNextButton();
      return;
    }

    var hints = task.hints || [];
    var hint = hints.length ? hints[Math.min(hintIndex, hints.length - 1)] : "Порядок пока неверный. Попробуй ещё раз.";
    if (hintIndex < hints.length) {
      hintIndex += 1;
    }
    showMessage("Не совсем. " + hint, "hint");
  }

  function resetOrder() {
    solved = false;
    hintIndex = 0;
    clearMarks();
    hideMessage();
    hideNextButton();
    renderBlocks(shuffledBlocks());
  }

  function bindEvents() {
    document.getElementById("check-order").addEventListener("click", checkOrder);
    document.getElementById("reset-order").addEventListener("click", resetOrder);
    document.getElementById("next-task").addEventListener("click", function () {
      window.location.reload();
    });
  }

  function initSortable() {
    var list = document.getElementById("sortable-list");
    if (typeof Sortable !== "undefined") {
      new Sortable(list, { animation: 150, ghostClass: "block-ghost", chosenClass: "block-chosen" });
    }
  }

  function loadTask() {
    fetch("data/blocks.json")
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
        if (!task || !task.blocks) {
          throw new Error("Пустое задание");
        }
        renderTitle();
        renderBlocks(shuffledBlocks());
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
