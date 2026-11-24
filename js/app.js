(function () {
  var STAGES = [
    { number: 0, title: "Обозначения", href: "stage0.html" },
    { number: 1, title: "Синтаксис", href: "stage1.html" },
    { number: 2, title: "Анимация", href: "stage2.html" },
    { number: 3, title: "Сборщик", href: "stage3.html" },
    { number: 4, title: "Отладчик", href: "stage4.html" },
    { number: 5, title: "Самостоятельное написание", href: "stage5.html" }
  ];

  // Склонения счётчика для «Повторить ошибки»: этапы 0 и 2 сюда не входят,
  // у них нет поштучно проверяемого ответа.
  var MISTAKE_NOUNS = {
    1: ["вопрос", "вопроса", "вопросов"],
    3: ["задача", "задачи", "задач"],
    4: ["задача", "задачи", "задач"],
    5: ["задача", "задачи", "задач"]
  };

  // Режим разработчика включается только через ссылку: ?dev=true
  function isDevMode() {
    return new URLSearchParams(window.location.search).get("dev") === "true";
  }

  // Старый формат { "0": true } — оставлен для внешних вызовов
  function getProgress() {
    if (!window.Store) {
      return {};
    }
    var stages = Store.get().stages;
    var progress = {};
    for (var key in stages) {
      if (Object.prototype.hasOwnProperty.call(stages, key) && stages[key] && stages[key].completed) {
        progress[key] = true;
      }
    }
    return progress;
  }

  function markStageCompleted(stageNumber, score) {
    if (window.Store) {
      Store.markStageCompleted(stageNumber, score);
    }
    return getProgress();
  }

  function isStageCompleted(stageNumber) {
    if (!window.Store) {
      return false;
    }
    var stage = Store.getStage(stageNumber);
    return !!stage && stage.completed;
  }

  function isStageAvailable(stageNumber) {
    if (!window.Store) {
      return false;
    }
    return Store.isAvailable(stageNumber);
  }

  function getStageStatus(stageNumber) {
    if (isStageCompleted(stageNumber)) {
      return "completed";
    }
    if (isStageAvailable(stageNumber)) {
      return "available";
    }
    return "locked";
  }

  function countCompleted() {
    var n = 0;
    for (var i = 0; i < STAGES.length; i += 1) {
      if (isStageCompleted(STAGES[i].number)) {
        n += 1;
      }
    }
    return n;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function plural(count, one, few, many) {
    var mod10 = count % 10;
    var mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return one;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return few;
    }
    return many;
  }

  function renderHome() {
    var grid = document.getElementById("stages-grid");
    var indicator = document.getElementById("progress-indicator");
    if (!grid) {
      return;
    }

    var completed = countCompleted();
    if (indicator) {
      var percent = Math.round((completed / STAGES.length) * 100);
      indicator.innerHTML =
        '<div class="progress-meta">' +
        "<span>Пройдено этапов: <strong>" +
        completed +
        " / " +
        STAGES.length +
        "</strong></span>" +
        "<span>" +
        percent +
        "%</span>" +
        "</div>" +
        '<div class="progress-bar" role="progressbar" aria-label="Прогресс этапов" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        percent +
        '" aria-valuetext="Пройдено ' +
        completed +
        " из " +
        STAGES.length +
        ' этапов">' +
        '<div class="progress-bar-fill" style="width:' +
        percent +
        '%"></div>' +
        "</div>";
    }

    var html = "";
    for (var i = 0; i < STAGES.length; i += 1) {
      var stage = STAGES[i];
      var status = getStageStatus(stage.number);
      var statusLabel =
        status === "completed"
          ? "Пройден"
          : status === "available"
            ? "Доступен"
            : "Заблокирован";
      if (status === "locked") {
        html +=
          '<div class="stage-card status-' +
          status +
          '" aria-disabled="true">' +
          '<span class="stage-number">Этап ' +
          stage.number +
          "</span>" +
          "<h2>" +
          stage.title +
          "</h2>" +
          '<span class="stage-status">' +
          statusLabel +
          "</span>" +
          "</div>";
      } else {
        html +=
          '<a class="stage-card status-' +
          status +
          '" href="' +
          stage.href +
          '">' +
          '<span class="stage-number">Этап ' +
          stage.number +
          "</span>" +
          "<h2>" +
          stage.title +
          "</h2>" +
          '<span class="stage-status">' +
          statusLabel +
          "</span>" +
          "</a>";
      }
    }
    grid.innerHTML = html;
  }

  function renderDiagnostics() {
    var section = document.getElementById("diagnostics");
    var content = document.getElementById("diagnostics-content");
    if (!section || !content || !window.Store) {
      return;
    }

    var html = "";
    var hasData = false;
    var i;

    var stageRows = "";
    for (i = 0; i < STAGES.length; i += 1) {
      var stage = STAGES[i];
      var info = Store.getStage(stage.number);
      if (!info || (!info.attempts && info.lastScore === null)) {
        continue;
      }
      var best = info.lastScore === null ? "нет данных" : Math.round(info.lastScore * 100) + "%";
      if (!stageRows) {
        stageRows = '<ul class="diagnostics-list">';
      }
      stageRows +=
        '<li class="diagnostics-row">' +
        '<span class="diagnostics-label">Этап ' +
        stage.number +
        " · " +
        escapeHtml(stage.title) +
        "</span>" +
        '<span class="diagnostics-meta">попыток ' +
        info.attempts +
        " · лучший результат " +
        best +
        "</span></li>";
    }
    if (stageRows) {
      html += stageRows + "</ul>";
      hasData = true;
    }

    var weak = Store.weakTopics().slice(0, 3);
    if (weak.length) {
      html += '<p class="diagnostics-subtitle">Слабые темы</p><ul class="diagnostics-list">';
      for (i = 0; i < weak.length; i += 1) {
        html +=
          '<li class="diagnostics-row"><span class="diagnostics-label">' +
          escapeHtml(weak[i].topic) +
          " — " +
          weak[i].wrong +
          " из " +
          weak[i].total +
          " ошибок</span></li>";
      }
      html += "</ul>";
      hasData = true;
    }

    var reflection = Store.get().reflection;
    var filled = 0;
    for (var taskId in reflection) {
      if (
        Object.prototype.hasOwnProperty.call(reflection, taskId) &&
        Array.isArray(reflection[taskId]) &&
        reflection[taskId].some(function (answer) {
          return typeof answer === "string" && answer.trim() !== "";
        })
      ) {
        filled += 1;
      }
    }
    if (filled > 0) {
      html +=
        '<p class="diagnostics-row diagnostics-reflection">Рефлексия заполнена для ' +
        filled +
        " " +
        plural(filled, "задачи", "задач", "задач") +
        "</p>";
      hasData = true;
    }

    content.innerHTML = html;
    section.hidden = !hasData;
  }

  function countMistakes(stageNumber) {
    var results = Store.getResults("stage" + stageNumber + ":");
    var count = 0;
    for (var key in results) {
      if (Object.prototype.hasOwnProperty.call(results, key) && results[key] && results[key].ok === false) {
        count += 1;
      }
    }
    return count;
  }

  function renderMistakes() {
    var section = document.getElementById("mistakes");
    var content = document.getElementById("mistakes-content");
    if (!section || !content || !window.Store) {
      return;
    }

    var html = "";
    var total = 0;
    for (var i = 0; i < STAGES.length; i += 1) {
      var stage = STAGES[i];
      var nouns = MISTAKE_NOUNS[stage.number];
      if (!nouns) {
        continue;
      }
      var count = countMistakes(stage.number);
      if (!count) {
        continue;
      }
      total += count;
      html +=
        '<li class="diagnostics-row">' +
        '<span class="diagnostics-label">Этап ' +
        stage.number +
        " · " +
        escapeHtml(stage.title) +
        "</span>" +
        '<a class="mistakes-link" href="' +
        stage.href +
        '?mistakes=1">' +
        count +
        " " +
        plural(count, nouns[0], nouns[1], nouns[2]) +
        "</a></li>";
    }

    content.innerHTML = html ? '<ul class="diagnostics-list">' + html + "</ul>" : "";
    section.hidden = total === 0;
  }

  function renderDevBanner() {
    var banner = document.getElementById("dev-banner");
    if (!banner) {
      return;
    }
    banner.hidden = !isDevMode();
  }

  function resetProgress() {
    if (!window.confirm("Вы уверены, что хотите сбросить весь прогресс?")) {
      return;
    }
    if (window.Store) {
      Store.reset();
    }
    window.location.reload();
  }

  function bindResetButton() {
    var button = document.getElementById("reset-progress");
    if (button) {
      button.addEventListener("click", resetProgress);
    }
  }

  window.getProgress = getProgress;
  window.markStageCompleted = markStageCompleted;
  window.isStageAvailable = isStageAvailable;
  window.getStageStatus = getStageStatus;
  window.isDevMode = isDevMode;

  document.addEventListener("DOMContentLoaded", function () {
    renderDevBanner();
    renderHome();
    renderDiagnostics();
    renderMistakes();
    bindResetButton();
  });
})();
