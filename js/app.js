(function () {
  var STORAGE_KEY = "ege24_trainer_progress";
  var STAGE_COUNT = 5;
  var STAGES = [
    { number: 1, title: "Синтаксис", href: "stage1.html" },
    { number: 2, title: "Анимация", href: "stage2.html" },
    { number: 3, title: "Сборщик", href: "stage3.html" },
    { number: 4, title: "Отладчик", href: "stage4.html" },
    { number: 5, title: "Самостоятельное написание", href: "stage5.html" }
  ];

  function getProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function markStageCompleted(stageNumber) {
    var progress = getProgress();
    progress[String(stageNumber)] = true;
    saveProgress(progress);
    return progress;
  }

  function isStageCompleted(stageNumber) {
    return getProgress()[String(stageNumber)] === true;
  }

  function isStageAvailable(stageNumber) {
    if (stageNumber === 1) {
      return true;
    }
    return isStageCompleted(stageNumber - 1);
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
    for (var i = 1; i <= STAGE_COUNT; i += 1) {
      if (isStageCompleted(i)) {
        n += 1;
      }
    }
    return n;
  }

  function renderHome() {
    var grid = document.getElementById("stages-grid");
    var indicator = document.getElementById("progress-indicator");
    if (!grid) {
      return;
    }

    var completed = countCompleted();
    if (indicator) {
      var percent = Math.round((completed / STAGE_COUNT) * 100);
      indicator.innerHTML =
        '<div class="progress-meta">' +
        "<span>Пройдено этапов: <strong>" +
        completed +
        " / " +
        STAGE_COUNT +
        "</strong></span>" +
        "<span>" +
        percent +
        "%</span>" +
        "</div>" +
        '<div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        percent +
        '">' +
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

  function resetProgress() {
    if (!window.confirm("Вы уверены, что хотите сбросить весь прогресс?")) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
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

  document.addEventListener("DOMContentLoaded", function () {
    renderHome();
    bindResetButton();
  });
})();
