(function () {
  // Текущая анимация (первый элемент массива) и индекс активного шага.
  var animation = null;
  var currentIndex = 0;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTitle(title) {
    document.getElementById("anim-title").textContent = title || "";
  }

  // Отрисовка кода в виде нумерованных строк. Каждая строка получает id line-N.
  function renderCode(code) {
    var lines = String(code).split("\n");
    var html = "";
    for (var i = 0; i < lines.length; i += 1) {
      var text = lines[i] === "" ? "&nbsp;" : escapeHtml(lines[i]);
      html += '<li class="code-line" id="line-' + i + '"><span class="line-text">' + text + "</span></li>";
    }
    document.getElementById("anim-code").innerHTML = html;
  }

  // Отрисовка таблицы переменных. Порядок берем из поля variables, если оно есть.
  function renderVars(vars) {
    var values = vars || {};
    var order =
      animation && animation.variables && animation.variables.length
        ? animation.variables
        : Object.keys(values);
    var html = "";
    for (var i = 0; i < order.length; i += 1) {
      var name = order[i];
      var value = values[name];
      if (value === undefined || value === null || value === "") {
        value = "—";
      }
      html +=
        '<tr><td class="var-name">' +
        escapeHtml(name) +
        "</td>" +
        '<td class="var-value">' +
        escapeHtml(value) +
        "</td></tr>";
    }
    document.getElementById("vars-body").innerHTML = html;
  }

  function clearHighlight() {
    var active = document.querySelectorAll(".code-line.is-active");
    for (var i = 0; i < active.length; i += 1) {
      active[i].classList.remove("is-active");
    }
  }

  function highlightLine(lineNumber) {
    var el = document.getElementById("line-" + lineNumber);
    if (el) {
      el.classList.add("is-active");
      if (typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function showStatus(text, kind) {
    var el = document.getElementById("anim-status");
    el.hidden = false;
    el.textContent = text;
    el.className = "quiz-status is-" + kind;
  }

  function hideStatus() {
    var el = document.getElementById("anim-status");
    el.hidden = true;
    el.textContent = "";
    el.className = "quiz-status";
  }

  // Применяет шаг с указанным индексом: подсветка строки, таблица, пояснение.
  function applyStep(index) {
    if (!animation || !animation.steps || !animation.steps.length) {
      return;
    }
    var step = animation.steps[index];
    clearHighlight();
    highlightLine(step.line);
    renderVars(step.vars);
    document.getElementById("anim-explanation").textContent = step.explanation || "";
  }

  function isLastStep() {
    return currentIndex >= animation.steps.length - 1;
  }

  function updateButtons() {
    var stepBtn = document.getElementById("step-forward");
    var finishBtn = document.getElementById("anim-finish");
    if (isLastStep()) {
      stepBtn.disabled = true;
      finishBtn.hidden = false;
      showStatus("Все шаги пройдены. Нажмите «Этап пройден!».", "pass");
    } else {
      stepBtn.disabled = false;
      finishBtn.hidden = true;
    }
  }

  function stepForward() {
    if (!animation) {
      return;
    }
    if (isLastStep()) {
      return;
    }
    currentIndex += 1;
    applyStep(currentIndex);
    updateButtons();
  }

  function resetAnimation() {
    if (!animation) {
      return;
    }
    currentIndex = 0;
    hideStatus();
    applyStep(0);
    updateButtons();
  }

  function finishStage() {
    showStatus("Этап пройден!", "pass");
    if (typeof markStageCompleted === "function") {
      markStageCompleted(2);
    }
    window.setTimeout(function () {
      window.location.href = "index.html";
    }, 1200);
  }

  function bindEvents() {
    document.getElementById("step-forward").addEventListener("click", stepForward);
    document.getElementById("anim-reset").addEventListener("click", resetAnimation);
    document.getElementById("anim-finish").addEventListener("click", finishStage);
  }

  function loadAnimation() {
    fetch("data/animations.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Не удалось загрузить анимацию");
        }
        return response.json();
      })
      .then(function (data) {
        animation = Array.isArray(data) ? data[0] : data;
        if (!animation) {
          throw new Error("Пустой файл анимаций");
        }
        renderTitle(animation.title);
        renderCode(animation.code);
        resetAnimation();
      })
      .catch(function () {
        showStatus(
          "Не удалось загрузить анимацию. Откройте сайт через локальный сервер, а не file://.",
          "error"
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadAnimation();
  });
})();
