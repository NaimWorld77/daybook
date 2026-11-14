(() => {
  "use strict";

  const KEYS = {
    data: "daybook.v1",
    profile: "daybook.profile.v1",
    goal: "daybook.goal.v1",
    results: "daybook.goal.results.v1",
    watch: "daybook.watch.v1"
  };

  const TICK_MS = 250;
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const MAX_TITLE = 140;
  const VALID_STATUSES = new Set(["pending", "running", "paused", "done"]);
  const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  const state = {
    data: { version: 1, days: {} },
    profile: null,
    goal: null,
    results: {},
    watch: { accumulatedMs: 0, startedAt: null },
    todayKey: "",
    selectedDay: "",
    editingTaskId: null,
    editingDayKey: null,
    deleteConfirmId: null,
    deleteConfirmTimer: null,
    notice: null,
    noticeTimer: null,
    lastChartSecond: 0,
    profilePictureDraft: ""
  };

  let els = {};

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    cacheElements();
    loadState();

    state.todayKey = ymd(new Date());
    state.selectedDay = state.todayKey;

    bindEvents();
    handleDayChange(state.todayKey, { announce: true, initial: true });

    renderAll();
    updateClock(Date.now());
    document.getElementById("announce").textContent = "";

    state.lastChartSecond = Math.floor(Date.now() / 1000);
    window.setInterval(tick, TICK_MS);
  }

  function cacheElements() {
    els = {
      clockTime: document.getElementById("clockTime"),
      clockDate: document.getElementById("clockDate"),
      profileArea: document.getElementById("profileArea"),
      sectionMenu: document.getElementById("sectionMenu"),
      dayCards: document.getElementById("dayCards"),
      backToday: document.getElementById("backToday"),
      selectedTitle: document.getElementById("selectedTitle"),
      selectedMeta: document.getElementById("selectedMeta"),
      moveNotice: document.getElementById("moveNotice"),
      addForm: document.getElementById("addForm"),
      taskInput: document.getElementById("taskInput"),
      taskList: document.getElementById("taskList"),
      emptyState: document.getElementById("emptyState"),
      announce: document.getElementById("announce"),
      stopwatch: document.getElementById("stopwatch"),
      stopwatchMode: document.getElementById("stopwatchMode"),
      stopwatchTime: document.getElementById("stopwatchTime"),
      stopwatchTask: document.getElementById("stopwatchTask"),
      stopwatchActions: document.getElementById("stopwatchActions"),
      stopwatchToday: document.getElementById("stopwatchToday"),
      goalForm: document.getElementById("goalForm"),
      goalHours: document.getElementById("goalHours"),
      goalMinutes: document.getElementById("goalMinutes"),
      goalError: document.getElementById("goalError"),
      goalSince: document.getElementById("goalSince"),
      goalStatus: document.getElementById("goalStatus"),
      goalHistory: document.getElementById("goalHistory"),
      weekTotal: document.getElementById("weekTotal"),
      allRecorded: document.getElementById("allRecorded"),
      weekChart: document.getElementById("weekChart"),
      flowMeta: document.getElementById("flowMeta"),
      flowChart: document.getElementById("flowChart"),
      profileDialog: document.getElementById("profileDialog"),
      profileForm: document.getElementById("profileForm"),
      profileDialogTitle: document.getElementById("profileDialogTitle"),
      profileName: document.getElementById("profileName"),
      profileEmail: document.getElementById("profileEmail"),
      profilePicture: document.getElementById("profilePicture"),
      profilePreview: document.getElementById("profilePreview"),
      profileError: document.getElementById("profileError")
    };
  }

  function loadState() {
    state.data = normalizeData(readJSON(KEYS.data, null));
    state.profile = normalizeProfile(readJSON(KEYS.profile, null));
    state.goal = normalizeGoal(readJSON(KEYS.goal, null));
    state.results = normalizeResults(readJSON(KEYS.results, null));
    state.watch = normalizeWatch(readJSON(KEYS.watch, null));
    state.profilePictureDraft = state.profile ? state.profile.picture || "" : "";
  }

  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Daybook could not read local storage.", error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Daybook could not save local storage.", error);
      return false;
    }
  }

  function removeStored(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("Daybook could not clear local storage.", error);
    }
  }

  function persistData() {
    writeJSON(KEYS.data, state.data);
  }

  function persistGoal() {
    writeJSON(KEYS.goal, state.goal);
  }

  function persistResults() {
    writeJSON(KEYS.results, state.results);
  }

  function persistWatch() {
    writeJSON(KEYS.watch, state.watch);
  }

  function normalizeData(raw) {
    const data = { version: 1, days: {} };
    if (!raw || typeof raw !== "object" || !raw.days || typeof raw.days !== "object") {
      return data;
    }

    for (const [key, day] of Object.entries(raw.days)) {
      if (!isDayKey(key) || !day || !Array.isArray(day.tasks)) continue;
      const tasks = day.tasks
        .map(normalizeTask)
        .filter(Boolean)
        .sort(compareTasks);

      if (tasks.length) {
        data.days[key] = { tasks };
      }
    }

    const running = [];
    for (const day of Object.values(data.days)) {
      for (const task of day.tasks) {
        if (task.status === "running") running.push(task);
      }
    }

    if (running.length > 1) {
      running.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      for (let index = 1; index < running.length; index += 1) {
        const task = running[index];
        task.accumulatedMs = Math.round(taskElapsed(task));
        task.startedAt = null;
        task.status = "paused";
      }
    }

    return data;
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object") return null;

    const status = VALID_STATUSES.has(raw.status) ? raw.status : "pending";
    let startedAt = Number.isFinite(raw.startedAt) ? raw.startedAt : null;
    let firstStartedAt = Number.isFinite(raw.firstStartedAt) ? raw.firstStartedAt : null;
    let completedAt = Number.isFinite(raw.completedAt) ? raw.completedAt : null;
    const accumulatedMs = Math.max(0, Math.round(Number(raw.accumulatedMs) || 0));
    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    const title = String(raw.title == null ? "" : raw.title).trim().slice(0, MAX_TITLE) || "Untitled";
    const id = String(raw.id || makeId());

    if (status === "running" && startedAt == null) {
      return {
        id,
        title,
        status: accumulatedMs > 0 || firstStartedAt ? "paused" : "pending",
        accumulatedMs,
        startedAt: null,
        firstStartedAt,
        completedAt: status === "done" ? completedAt : null,
        createdAt
      };
    }

    if (status !== "running") startedAt = null;
    if (status !== "done") completedAt = null;

    return {
      id,
      title,
      status,
      accumulatedMs,
      startedAt,
      firstStartedAt,
      completedAt,
      createdAt
    };
  }

  function normalizeProfile(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name == null ? "" : raw.name).trim().slice(0, 80);
    const email = String(raw.email == null ? "" : raw.email).trim().slice(0, 120);
    const picture = typeof raw.picture === "string" && raw.picture.indexOf("data:image/jpeg") === 0
      ? raw.picture
      : "";
    if (!name && !email && !picture) return null;
    return { name, email, picture };
  }

  function normalizeGoal(raw) {
    if (!raw || typeof raw !== "object") return null;
    const ms = Math.round(Number(raw.ms));
    if (!Number.isFinite(ms) || ms < 0) return null;
    const since = isDayKey(raw.since) ? raw.since : ymd(new Date());
    return { ms: Math.min(ms, 24 * HOUR), since };
  }

  function normalizeResults(raw) {
    const results = {};
    if (!raw || typeof raw !== "object") return results;

    for (const [key, result] of Object.entries(raw)) {
      if (!isDayKey(key) || !result || typeof result !== "object") continue;
      const counted = {};
      if (result.counted && typeof result.counted === "object") {
        for (const [taskId, ms] of Object.entries(result.counted)) {
          counted[taskId] = Math.max(0, Math.round(Number(ms) || 0));
        }
      }
      results[key] = {
        totalMs: Math.max(0, Math.round(Number(result.totalMs) || 0)),
        goalMs: Math.max(0, Math.round(Number(result.goalMs) || 0)),
        met: typeof result.met === "boolean" ? result.met : null,
        counted
      };
    }

    return results;
  }

  function normalizeWatch(raw) {
    if (!raw || typeof raw !== "object") {
      return { accumulatedMs: 0, startedAt: null };
    }
    return {
      accumulatedMs: Math.max(0, Math.round(Number(raw.accumulatedMs) || 0)),
      startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null
    };
  }

  function bindEvents() {
    els.addForm.addEventListener("submit", addTaskFromInput);
    els.goalForm.addEventListener("submit", saveGoalFromForm);
    els.sectionMenu.addEventListener("change", handleSectionMenu);
    els.backToday.addEventListener("click", () => selectDay(state.todayKey, true));

    document.addEventListener("click", handleDelegatedClick);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);

    els.profileForm.addEventListener("submit", saveProfileFromForm);
    els.profileName.addEventListener("input", renderProfilePreview);
    els.profilePicture.addEventListener("change", handleProfilePicture);
    els.profileDialog.addEventListener("click", (event) => {
      if (event.target === els.profileDialog) els.profileDialog.close();
    });
  }

  function handleDelegatedClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    const dayKey = target.dataset.day || "";
    const taskId = target.dataset.taskId || "";

    switch (action) {
      case "open-profile":
        event.preventDefault();
        openProfileDialog();
        break;
      case "close-profile":
        event.preventDefault();
        els.profileDialog.close();
        break;
      case "signout":
        event.preventDefault();
        signOut();
        break;
      case "select-day":
        selectDay(dayKey, false);
        break;
      case "rename-task":
        beginRename(dayKey, taskId);
        break;
      case "toggle-done":
        toggleTaskDone(dayKey, taskId);
        break;
      case "start-task":
        startTask(dayKey, taskId);
        break;
      case "pause-task":
        pauseTask(dayKey, taskId);
        break;
      case "done-task":
        markTaskDone(dayKey, taskId);
        break;
      case "delete-task":
        requestDeleteTask(dayKey, taskId);
        break;
      case "watch-start":
        startAloneWatch();
        break;
      case "watch-end":
        endAloneWatch();
        break;
      default:
        break;
    }
  }

  function handleSectionMenu() {
    const value = els.sectionMenu.value;
    els.sectionMenu.value = "";
    if (!value) return;

    if (value === "list") {
      selectDay(state.todayKey, false);
      scrollToSection("list");
      return;
    }

    if (value === "day:yesterday") {
      selectDay(addDaysKey(state.todayKey, -1), false);
      scrollToSection("list");
      return;
    }

    if (value === "day:tomorrow") {
      selectDay(addDaysKey(state.todayKey, 1), false);
      scrollToSection("list");
      return;
    }

    scrollToSection(value);
  }

  function scrollToSection(id) {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectDay(dayKey, scroll) {
    if (!isDayKey(dayKey)) return;
    state.selectedDay = dayKey;
    state.editingTaskId = null;
    state.editingDayKey = null;
    clearDeleteConfirmation();
    renderAll();
    if (scroll) scrollToSection("list");
  }

  function tick() {
    const now = Date.now();
    const currentToday = ymd(new Date(now));

    if (currentToday !== state.todayKey) {
      handleDayChange(currentToday, { announce: true });
      state.lastChartSecond = 0;
      renderAll();
    } else {
      updateClock(now);
    }

    updateLiveTaskTimes(now);
    updateStopwatchLive(now);
    updateListMeta(now);
    renderGoal(now);
    updateTabTitle(now);

    const second = Math.floor(now / 1000);
    if (second !== state.lastChartSecond) {
      state.lastChartSecond = second;
      renderCharts(now);
    }
  }

  function handleDayChange(newToday, options) {
    const opts = options || {};
    const previousToday = state.todayKey;
    const now = Date.now();

    state.todayKey = newToday;
    const settled = settleFinishedDays(newToday, now);
    const moved = moveUnfinishedToToday(newToday, now);

    if (!state.selectedDay || state.selectedDay === previousToday) {
      state.selectedDay = newToday;
    } else if (state.selectedDay < addDaysKey(newToday, -1)) {
      state.selectedDay = newToday;
    }

    persistData();
    if (settled) persistResults();
    if (moved > 0) showMoveNotice(moved);

    if (opts.initial && !state.selectedDay) state.selectedDay = newToday;
    return moved;
  }

  function settleFinishedDays(todayKey, now) {
    const keys = new Set();

    for (const key of Object.keys(state.data.days)) {
      if (key < todayKey) keys.add(key);
    }

    if (goalExists()) {
      let cursor = goalSince();
      const recentFloor = addDaysKey(todayKey, -31);
      if (cursor < recentFloor) cursor = recentFloor;
      let guard = 0;
      while (cursor < todayKey && guard < 400) {
        keys.add(cursor);
        cursor = addDaysKey(cursor, 1);
        guard += 1;
      }
    }

    const ordered = Array.from(keys).sort();
    let changed = false;

    for (const key of ordered) {
      if (state.results[key]) continue;
      state.results[key] = freezeDay(key, now);
      changed = true;
    }

    return changed;
  }

  function freezeDay(dayKey, now) {
    const tasks = getDayTasks(dayKey).slice();
    const boundary = Math.min(dayEndMs(dayKey), now);
    const counted = {};
    let total = 0;

    for (const task of tasks) {
      const ms = countedTaskThrough(task, dayKey, boundary);
      counted[task.id] = ms;
      total += ms;
    }

    const goal = goalForDay(dayKey);
    return {
      totalMs: Math.round(total),
      goalMs: goal,
      met: goal > 0 ? total >= goal : null,
      counted
    };
  }

  function countedTaskThrough(task, dayKey, boundary) {
    let elapsedAtBoundary = Math.max(0, Math.round(Number(task.accumulatedMs) || 0));

    if (task.status === "running" && Number.isFinite(task.startedAt) && task.startedAt < boundary) {
      elapsedAtBoundary += Math.max(0, Math.round(boundary - task.startedAt));
    }

    return Math.max(0, Math.round(elapsedAtBoundary - priorCountedForTask(task.id, dayKey)));
  }

  function moveUnfinishedToToday(todayKey, now) {
    let moved = 0;
    const todayDay = ensureDay(todayKey);
    const pastKeys = Object.keys(state.data.days).filter((key) => key < todayKey).sort();

    for (const key of pastKeys) {
      const day = state.data.days[key];
      if (!day || !Array.isArray(day.tasks)) continue;

      const keep = [];
      for (const task of day.tasks) {
        if (task.status === "done") {
          keep.push(task);
          continue;
        }

        if (task.status === "running") {
          stopTaskTimer(task, now);
        }

        todayDay.tasks.push(task);
        moved += 1;
      }

      day.tasks = keep;
      if (!day.tasks.length) delete state.data.days[key];
    }

    if (moved > 0) todayDay.tasks.sort(compareTasks);
    return moved;
  }

  function showMoveNotice(count) {
    const text = "Moved " + count + " unfinished task" + (count === 1 ? "" : "s") + " to today.";
    state.notice = { text, expires: Date.now() + 10000 };
    els.announce.textContent = "";
    window.setTimeout(() => {
      els.announce.textContent = text;
    }, 20);
    if (state.noticeTimer) window.clearTimeout(state.noticeTimer);
    state.noticeTimer = window.setTimeout(() => {
      state.notice = null;
      renderNotice();
    }, 10000);
    renderNotice();
  }

  function renderNotice() {
    if (!state.notice || state.notice.expires < Date.now()) {
      els.moveNotice.hidden = true;
      els.moveNotice.textContent = "";
      return;
    }
    els.moveNotice.hidden = false;
    els.moveNotice.textContent = state.notice.text;
  }

  function renderAll() {
    const now = Date.now();
    renderProfile();
    renderDays(now);
    renderListHeader(now);
    renderNotice();
    renderTasks(now);
    renderStopwatch(now);
    renderGoal(now);
    syncGoalForm(false);
    renderCharts(now);
    updateClock(now);
    updateTabTitle(now);
  }

  function renderProfile() {
    if (!state.profile) {
      els.profileArea.innerHTML =
        '<button class="btn btn-ghost btn-small" type="button" data-action="open-profile">Sign in</button>';
      return;
    }

    const name = state.profile.name || "Profile";
    const email = state.profile.email || "";
    const initial = (name || email || "?").trim().charAt(0).toUpperCase() || "?";
    const avatar = state.profile.picture
      ? '<span class="avatar"><img src="' + esc(state.profile.picture) + '" alt=""></span>'
      : '<span class="avatar">' + esc(initial) + "</span>";

    els.profileArea.innerHTML =
      '<div class="profile-chip">' +
        avatar +
        '<span class="profile-copy">' +
          '<span class="profile-name">' + esc(name) + "</span>" +
          '<span class="profile-email">' + esc(email) + "</span>" +
        "</span>" +
        '<button class="signout" type="button" data-action="signout">Sign out</button>' +
      "</div>";
  }

  function openProfileDialog() {
    const profile = state.profile;
    els.profileName.value = profile ? profile.name || "" : "";
    els.profileEmail.value = profile ? profile.email || "" : "";
    state.profilePictureDraft = profile ? profile.picture || "" : "";
    els.profilePicture.value = "";
    hideProfileError();

    els.profileDialogTitle.textContent = profile ? "Edit your profile" : "Create your profile";
    const submit = els.profileForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = profile ? "Save changes" : "Save profile";

    renderProfilePreview();

    if (!els.profileDialog.open) els.profileDialog.showModal();
    window.setTimeout(() => els.profileName.focus(), 30);
  }

  function signOut() {
    removeStored(KEYS.profile);
    state.profile = null;
    state.profilePictureDraft = "";
    renderProfile();
    els.announce.textContent = "Signed out. Your tasks are still here.";
  }

  function renderProfilePreview() {
    const name = els.profileName.value.trim();
    if (state.profilePictureDraft) {
      els.profilePreview.innerHTML = '<img src="' + esc(state.profilePictureDraft) + '" alt="">';
      return;
    }
    els.profilePreview.textContent = (name.charAt(0) || "?").toUpperCase();
  }

  async function handleProfilePicture() {
    const file = els.profilePicture.files && els.profilePicture.files[0];
    if (!file) return;

    if (!file.type || file.type.indexOf("image/") !== 0) {
      els.profilePicture.value = "";
      showProfileError("Choose an image file for your picture.");
      return;
    }

    try {
      const jpeg = await resizeImageToJpeg(file, 96);
      state.profilePictureDraft = jpeg;
      hideProfileError();
      renderProfilePreview();
    } catch (error) {
      console.warn("Daybook could not resize the picture.", error);
      els.profilePicture.value = "";
      showProfileError("That picture could not be read. Try another image.");
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = src;
    });
  }

  async function resizeImageToJpeg(file, size) {
    const src = await readFileAsDataUrl(file);
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");

    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2;
    const y = (size - height) / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x, y, width, height);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  function saveProfileFromForm(event) {
    event.preventDefault();
    const name = els.profileName.value.trim().slice(0, 80);
    const email = els.profileEmail.value.trim().slice(0, 120);

    if (!name) {
      showProfileError("Add your name to create the profile.");
      els.profileName.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showProfileError("Add a valid email address.");
      els.profileEmail.focus();
      return;
    }

    state.profile = {
      name,
      email,
      picture: state.profilePictureDraft || ""
    };

    writeJSON(KEYS.profile, state.profile);
    hideProfileError();
    els.profileDialog.close();
    renderProfile();
    els.announce.textContent = "Profile saved only in this browser.";
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function showProfileError(message) {
    els.profileError.textContent = message;
    els.profileError.hidden = false;
  }

  function hideProfileError() {
    els.profileError.textContent = "";
    els.profileError.hidden = true;
  }

  function renderDays(now) {
    const cards = [
      { offset: -1, name: "Yesterday" },
      { offset: 0, name: "Today" },
      { offset: 1, name: "Tomorrow" }
    ];

    els.dayCards.innerHTML = cards.map((card) => {
      const key = addDaysKey(state.todayKey, card.offset);
      const tasks = getDayTasks(key);
      const open = tasks.filter((task) => task.status !== "done").length;
      const total = dayCountedTotal(key, now);
      const active = key === state.selectedDay ? " is-active" : "";
      const meta = tasks.length
        ? open + " open · " + formatDuration(total)
        : "No tasks";
      return (
        '<button class="day-card' + active + '" type="button" data-action="select-day" data-day="' + esc(key) + '" aria-pressed="' + (active ? "true" : "false") + '">' +
          '<span class="day-name">' + esc(card.name) + "</span>" +
          '<span class="day-date">' + esc(formatDateShort(key)) + "</span>" +
          '<span class="day-meta">' + esc(meta) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderListHeader(now) {
    const label = dayLabel(state.selectedDay);
    els.selectedTitle.textContent = label;
    els.selectedMeta.textContent = selectedDaySummary(now);
    els.backToday.hidden = state.selectedDay === state.todayKey;
    els.taskInput.placeholder = "Add a task for " + label.toLowerCase();
  }

  function selectedDaySummary(now) {
    const tasks = getDayTasks(state.selectedDay);
    if (!tasks.length) return "No tasks yet";
    const open = tasks.filter((task) => task.status !== "done").length;
    const total = dayCountedTotal(state.selectedDay, now);
    return formatFullDate(state.selectedDay) + " · " + tasks.length + " task" +
      (tasks.length === 1 ? "" : "s") + " · " + open + " open · " + formatDuration(total);
  }

  function updateListMeta(now) {
    if (els.selectedMeta) els.selectedMeta.textContent = selectedDaySummary(now);
  }

  function renderTasks(now) {
    const tasks = getDayTasks(state.selectedDay).slice().sort(compareTasks);
    const deleteMissing = state.deleteConfirmId && !tasks.some((task) => task.id === state.deleteConfirmId);
    if (deleteMissing) clearDeleteConfirmation();

    if (!tasks.length) {
      els.taskList.innerHTML = "";
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    els.taskList.innerHTML = tasks.map((task) => taskCardMarkup(task, now)).join("");
    attachRenameInput();
  }

  function taskCardMarkup(task, now) {
    const dayKey = state.selectedDay;
    const isEditing = state.editingTaskId === task.id && state.editingDayKey === dayKey;
    const status = task.status;
    const classes = "task-card" +
      (status === "running" ? " is-running" : "") +
      (status === "done" ? " is-done" : "");

    const title = isEditing
      ? '<input class="rename-input" data-rename-input type="text" maxlength="' + MAX_TITLE +
        '" value="' + esc(task.title) + '" aria-label="Rename task">'
      : '<button class="task-title-btn" type="button" data-action="rename-task" data-day="' + esc(dayKey) +
        '" data-task-id="' + esc(task.id) + '" title="Rename task">' + esc(task.title) + "</button>";

    const checkLabel = status === "done" ? "Reopen task" : "Mark task done";
    const check =
      '<button class="task-check" type="button" data-action="toggle-done" data-day="' + esc(dayKey) +
      '" data-task-id="' + esc(task.id) + '" aria-label="' + checkLabel + '" aria-pressed="' +
      (status === "done" ? "true" : "false") + '">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5 8 14.5 16 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
      "</button>";

    let meta = "";
    if (status === "done") {
      meta = '<span class="status-pill is-done">Done</span>' +
        '<span class="done-line">' + esc(doneLine(task)) + "</span>";
    } else if (status === "pending") {
      meta = '<span class="status-pill">Pending</span><span class="task-time">Not started</span>';
    } else {
      const statusLabel = status === "running" ? "Running" : "Paused";
      const pillClass = status === "running" ? " is-running" : " is-paused";
      meta = '<span class="status-pill' + pillClass + '">' + statusLabel + "</span>" +
        '<span class="task-time" data-elapsed-id="' + esc(task.id) + '">' +
        esc(clockText(taskElapsed(task, now))) + "</span>";
    }

    const actions = [];
    if (status === "pending") {
      actions.push(taskButton("start-task", dayKey, task.id, "Start", "btn-primary"));
    } else if (status === "paused") {
      actions.push(taskButton("start-task", dayKey, task.id, "Resume", "btn-primary"));
      actions.push(taskButton("done-task", dayKey, task.id, "Done", "btn-green"));
    } else if (status === "running") {
      actions.push(taskButton("pause-task", dayKey, task.id, "Pause", "btn-ghost"));
      actions.push(taskButton("done-task", dayKey, task.id, "Done", "btn-green"));
    }

    const confirming = state.deleteConfirmId === task.id;
    actions.push(
      '<button class="btn btn-small btn-danger' + (confirming ? " is-confirm" : "") +
      '" type="button" data-action="delete-task" data-day="' + esc(dayKey) +
      '" data-task-id="' + esc(task.id) + '">' + (confirming ? "Remove?" : "Delete") + "</button>"
    );

    return (
      '<li class="' + classes + '">' +
        check +
        '<div class="task-body">' +
          title +
          '<div class="task-meta">' + meta + "</div>" +
        "</div>" +
        '<div class="task-actions">' + actions.join("") + "</div>" +
      "</li>"
    );
  }

  function taskButton(action, dayKey, taskId, label, className) {
    return '<button class="btn btn-small ' + className + '" type="button" data-action="' + action +
      '" data-day="' + esc(dayKey) + '" data-task-id="' + esc(taskId) + '">' + label + "</button>";
  }

  function beginRename(dayKey, taskId) {
    state.editingTaskId = taskId;
    state.editingDayKey = dayKey;
    renderTasks(Date.now());
  }

  function attachRenameInput() {
    const input = document.querySelector("[data-rename-input]");
    if (!input) return;

    let finished = false;
    input.focus();
    input.select();

    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (!save) {
        state.editingTaskId = null;
        state.editingDayKey = null;
        renderTasks(Date.now());
        return;
      }
      commitRename(input.value);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      if (!finished) finish(true);
    });
  }

  function commitRename(value) {
    const found = findTask(state.editingTaskId, state.editingDayKey);
    if (found) {
      const nextTitle = value.trim().slice(0, MAX_TITLE);
      found.task.title = nextTitle || found.task.title || "Untitled";
    }
    state.editingTaskId = null;
    state.editingDayKey = null;
    persistData();
    renderAll();
  }

  function addTaskFromInput(event) {
    event.preventDefault();
    const title = els.taskInput.value.trim().slice(0, MAX_TITLE);
    if (!title) {
      els.taskInput.focus();
      return;
    }

    const day = ensureDay(state.selectedDay);
    day.tasks.push({
      id: makeId(),
      title,
      status: "pending",
      accumulatedMs: 0,
      startedAt: null,
      firstStartedAt: null,
      completedAt: null,
      createdAt: Date.now()
    });
    day.tasks.sort(compareTasks);

    persistData();
    els.taskInput.value = "";
    renderAll();
    els.taskInput.focus();
  }

  function startTask(dayKey, taskId) {
    const found = findTask(taskId, dayKey);
    if (!found || found.task.status === "done") return;

    const now = Date.now();
    pauseRunningTask(now, found.task.id);
    freezeAloneWatch(now);

    found.task.status = "running";
    found.task.startedAt = now;
    found.task.completedAt = null;
    if (!found.task.firstStartedAt) found.task.firstStartedAt = now;

    persistData();
    persistWatch();
    renderAll();
  }

  function pauseTask(dayKey, taskId) {
    const found = findTask(taskId, dayKey);
    if (!found || found.task.status !== "running") return;
    stopTaskTimer(found.task, Date.now());
    persistData();
    renderAll();
  }

  function markTaskDone(dayKey, taskId) {
    const found = findTask(taskId, dayKey);
    if (!found || found.task.status === "done") return;

    const now = Date.now();
    stopTaskTimer(found.task, now);
    found.task.status = "done";
    found.task.completedAt = now;
    found.task.startedAt = null;

    persistData();
    renderAll();
  }

  function toggleTaskDone(dayKey, taskId) {
    const found = findTask(taskId, dayKey);
    if (!found) return;

    if (found.task.status === "done") {
      found.task.completedAt = null;
      found.task.startedAt = null;
      found.task.status = found.task.accumulatedMs > 0 ? "paused" : "pending";
    } else {
      const now = Date.now();
      stopTaskTimer(found.task, now);
      found.task.status = "done";
      found.task.completedAt = now;
      found.task.startedAt = null;
    }

    persistData();
    renderAll();
  }

  function requestDeleteTask(dayKey, taskId) {
    if (state.deleteConfirmId === taskId) {
      deleteTask(dayKey, taskId);
      return;
    }

    clearDeleteConfirmation();
    state.deleteConfirmId = taskId;
    state.deleteConfirmTimer = window.setTimeout(() => {
      state.deleteConfirmId = null;
      renderTasks(Date.now());
    }, 4500);
    renderTasks(Date.now());
  }

  function clearDeleteConfirmation() {
    if (state.deleteConfirmTimer) window.clearTimeout(state.deleteConfirmTimer);
    state.deleteConfirmTimer = null;
    state.deleteConfirmId = null;
  }

  function deleteTask(dayKey, taskId) {
    const day = state.data.days[dayKey];
    if (!day) return;

    day.tasks = day.tasks.filter((task) => task.id !== taskId);
    if (!day.tasks.length && dayKey < state.todayKey) delete state.data.days[dayKey];

    clearDeleteConfirmation();
    persistData();
    renderAll();
  }

  function pauseRunningTask(now, exceptId) {
    const running = runningTask();
    if (!running || running.task.id === exceptId) return;
    stopTaskTimer(running.task, now);
  }

  function stopTaskTimer(task, at) {
    task.accumulatedMs = Math.round(taskElapsed(task, at));
    task.startedAt = null;
    if (task.status === "running") task.status = "paused";
  }

  function runningTask() {
    for (const dayKey of Object.keys(state.data.days)) {
      const day = state.data.days[dayKey];
      if (!day || !Array.isArray(day.tasks)) continue;
      const task = day.tasks.find((item) => item.status === "running");
      if (task) return { dayKey, task };
    }
    return null;
  }

  function findTask(taskId, dayKey) {
    if (!taskId) return null;
    const keys = dayKey ? [dayKey] : Object.keys(state.data.days);
    for (const key of keys) {
      const day = state.data.days[key];
      if (!day || !Array.isArray(day.tasks)) continue;
      const task = day.tasks.find((item) => item.id === taskId);
      if (task) return { dayKey: key, task };
    }
    return null;
  }

  function getDayTasks(dayKey) {
    const day = state.data.days[dayKey];
    return day && Array.isArray(day.tasks) ? day.tasks : [];
  }

  function ensureDay(dayKey) {
    if (!state.data.days[dayKey]) state.data.days[dayKey] = { tasks: [] };
    if (!Array.isArray(state.data.days[dayKey].tasks)) state.data.days[dayKey].tasks = [];
    return state.data.days[dayKey];
  }

  function compareTasks(a, b) {
    return (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));
  }

  function taskElapsed(task, now) {
    const base = Math.max(0, Number(task.accumulatedMs) || 0);
    const clock = Number.isFinite(now) ? now : Date.now();
    if (task.status === "running" && Number.isFinite(task.startedAt)) {
      return base + Math.max(0, clock - task.startedAt);
    }
    return base;
  }

  function doneLine(task) {
    const accumulated = Math.max(0, Math.round(Number(task.accumulatedMs) || 0));
    const done = Number.isFinite(task.completedAt) ? task.completedAt : null;
    let start = Number.isFinite(task.firstStartedAt) ? task.firstStartedAt : null;

    if (!start && done && accumulated > 0) {
      start = done - accumulated;
    }

    if (accumulated > 0 && start && done) {
      return "Started at " + formatTimeOfDay(start) + " · Done at " + formatTimeOfDay(done);
    }
    if (accumulated > 0 && start) {
      return "Started at " + formatTimeOfDay(start);
    }
    if (accumulated > 0 && done) {
      return "Done at " + formatTimeOfDay(done);
    }
    if (done) {
      return "Done at " + formatTimeOfDay(done) + " · no time recorded";
    }
    return "Done · no time recorded";
  }

  function startAloneWatch() {
    if (runningTask()) return;
    state.watch = { accumulatedMs: 0, startedAt: Date.now() };
    persistWatch();
    renderAll();
  }

  function endAloneWatch() {
    if (!Number.isFinite(state.watch.startedAt)) return;
    state.watch = {
      accumulatedMs: Math.round(watchElapsed(Date.now())),
      startedAt: null
    };
    persistWatch();
    renderAll();
  }

  function freezeAloneWatch(now) {
    if (!Number.isFinite(state.watch.startedAt)) return;
    state.watch = {
      accumulatedMs: Math.round(watchElapsed(now)),
      startedAt: null
    };
  }

  function watchElapsed(now) {
    const base = Math.max(0, Number(state.watch.accumulatedMs) || 0);
    if (Number.isFinite(state.watch.startedAt)) {
      return base + Math.max(0, now - state.watch.startedAt);
    }
    return base;
  }

  function renderStopwatch(now) {
    const running = runningTask();
    const watchRunning = Number.isFinite(state.watch.startedAt);
    els.stopwatch.classList.toggle("is-live", Boolean(running) || watchRunning);

    if (running) {
      els.stopwatchMode.textContent = "Running task";
      els.stopwatchTime.textContent = clockText(taskElapsed(running.task, now));
      els.stopwatchTask.textContent = running.task.title;
      els.stopwatchActions.innerHTML =
        '<button class="btn btn-ghost" type="button" data-action="pause-task" data-day="' + esc(running.dayKey) +
        '" data-task-id="' + esc(running.task.id) + '">Pause</button>' +
        '<button class="btn btn-green" type="button" data-action="done-task" data-day="' + esc(running.dayKey) +
        '" data-task-id="' + esc(running.task.id) + '">Mark done</button>';
    } else {
      els.stopwatchMode.textContent = "Stopwatch on its own";
      els.stopwatchTime.textContent = clockText(watchElapsed(now));
      if (watchRunning) {
        els.stopwatchTask.textContent = "A timer on its own. This time is not added to tasks, today, or your goal.";
      } else if (state.watch.accumulatedMs > 0) {
        els.stopwatchTask.textContent = "Frozen at " + formatClockForText(state.watch.accumulatedMs) +
          ". It is not counted anywhere. Start again from zero.";
      } else {
        els.stopwatchTask.textContent = "Nothing is running. Start a task, or use the stopwatch by itself.";
      }

      els.stopwatchActions.innerHTML =
        '<button class="btn btn-primary" type="button" data-action="watch-start"' +
        (watchRunning ? " disabled" : "") + ">Start</button>" +
        '<button class="btn btn-ghost" type="button" data-action="watch-end"' +
        (watchRunning ? "" : " disabled") + ">End</button>";
    }

    updateStopwatchLive(now);
  }

  function updateStopwatchLive(now) {
    const running = runningTask();
    const todayTotal = dayCountedTotal(state.todayKey, now);

    if (running) {
      els.stopwatchTime.textContent = clockText(taskElapsed(running.task, now));
      els.stopwatchToday.innerHTML = "Today so far: <strong>" + esc(formatDuration(todayTotal)) +
        "</strong> · this task: <strong>" + esc(clockText(taskElapsed(running.task, now))) + "</strong>";
    } else {
      els.stopwatchTime.textContent = clockText(watchElapsed(now));
      els.stopwatchToday.innerHTML = "Today so far: <strong>" + esc(formatDuration(todayTotal)) +
        "</strong> · stopwatch-only time is not counted.";
    }
  }

  function updateLiveTaskTimes(now) {
    const timers = document.querySelectorAll("[data-elapsed-id]");
    timers.forEach((element) => {
      const task = findTask(element.dataset.elapsedId, state.selectedDay);
      if (task) element.textContent = clockText(taskElapsed(task.task, now));
    });
  }

  function goalMs() {
    return state.goal && Number.isFinite(state.goal.ms) ? Math.max(0, Math.round(state.goal.ms)) : 0;
  }

  function goalSince() {
    return state.goal && isDayKey(state.goal.since) ? state.goal.since : null;
  }

  function goalExists() {
    return goalMs() > 0 && Boolean(goalSince());
  }

  function goalForDay(dayKey) {
    if (!goalExists()) return 0;
    return dayKey >= goalSince() ? goalMs() : 0;
  }

  function priorCountedForTask(taskId, beforeDayKey) {
    let total = 0;
    for (const [key, result] of Object.entries(state.results)) {
      if (key >= beforeDayKey) continue;
      if (result && result.counted && Object.prototype.hasOwnProperty.call(result.counted, taskId)) {
        total += Math.max(0, Number(result.counted[taskId]) || 0);
      }
    }
    return total;
  }

  function countedForTaskOnDay(task, dayKey, now) {
    if (dayKey < state.todayKey) {
      const result = state.results[dayKey];
      if (result) {
        if (result.counted && Object.prototype.hasOwnProperty.call(result.counted, task.id)) {
          return Math.max(0, Math.round(Number(result.counted[task.id]) || 0));
        }
        return 0;
      }
    }

    const elapsed = taskElapsed(task, now);
    return Math.max(0, Math.round(elapsed - priorCountedForTask(task.id, dayKey)));
  }

  function dayCountedTotal(dayKey, now) {
    if (dayKey < state.todayKey && state.results[dayKey]) {
      return Math.max(0, Math.round(Number(state.results[dayKey].totalMs) || 0));
    }

    return getDayTasks(dayKey).reduce((total, task) => {
      return total + countedForTaskOnDay(task, dayKey, now);
    }, 0);
  }

  function saveGoalFromForm(event) {
    event.preventDefault();

    const hoursRaw = els.goalHours.value.trim();
    const minutesRaw = els.goalMinutes.value.trim();

    if (!hoursRaw && !minutesRaw) {
      showGoalError("Add hours or minutes for your daily goal.");
      return;
    }

    const hours = Number(hoursRaw || 0);
    const minutes = Number(minutesRaw || 0);

    if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
      showGoalError("Enter hours from 0 to 24.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      showGoalError("Enter minutes from 0 to 59.");
      return;
    }

    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes < 1) {
      showGoalError("Set a goal of at least 1 minute.");
      return;
    }
    if (totalMinutes > 24 * 60) {
      showGoalError("The daily goal cannot be more than 24 hours.");
      return;
    }

    const existingSince = goalExists() && isDayKey(state.goal.since) ? state.goal.since : state.todayKey;
    state.goal = { ms: totalMinutes * MINUTE, since: existingSince };
    hideGoalError();
    persistGoal();
    syncGoalForm(true);
    renderAll();
  }

  function showGoalError(message) {
    els.goalError.textContent = message;
    els.goalError.hidden = false;
  }

  function hideGoalError() {
    els.goalError.textContent = "";
    els.goalError.hidden = true;
  }

  function syncGoalForm(force) {
    const active = document.activeElement;
    if (!force && (active === els.goalHours || active === els.goalMinutes)) return;

    const ms = goalMs();
    els.goalHours.value = ms ? String(Math.floor(ms / HOUR)) : "";
    els.goalMinutes.value = ms ? String(Math.floor((ms % HOUR) / MINUTE)) : "";
  }

  function renderGoal(now) {
    const hasGoal = goalExists();
    const today = state.todayKey;

    if (!hasGoal) {
      els.goalStatus.className = "goal-status is-neutral";
      els.goalStatus.innerHTML =
        '<div class="goal-status-icon">?</div>' +
        '<div class="goal-status-copy">' +
          '<div class="goal-status-title">Set a daily goal</div>' +
          '<div class="goal-status-detail">Pick any amount from 1 minute to 24 hours. A goal of 0 shows no progress marks.</div>' +
        "</div>";
      els.goalSince.textContent = "No goal set yet.";
    } else if (today < goalSince()) {
      els.goalStatus.className = "goal-status is-neutral";
      els.goalStatus.innerHTML =
        '<div class="goal-status-icon">·</div>' +
        '<div class="goal-status-copy">' +
          '<div class="goal-status-title">Goal starts later</div>' +
          '<div class="goal-status-detail">Your first goal day is ' + esc(formatFullDate(goalSince())) + ".</div>" +
        "</div>";
      els.goalSince.textContent = "Goal active since " + formatFullDate(goalSince()) + ".";
    } else {
      const goal = goalForDay(today);
      const total = dayCountedTotal(today, now);
      const met = goal > 0 && total >= goal;
      const percent = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

      els.goalStatus.className = "goal-status " + (met ? "is-met" : "is-missed");
      els.goalStatus.innerHTML =
        '<div class="goal-status-icon">' + (met ? "✓" : "✕") + "</div>" +
        '<div class="goal-status-copy">' +
          '<div class="goal-status-title">' + (met ? "Goal completed" : "Goal not completed") + "</div>" +
          '<div class="goal-status-detail">' + esc(formatDuration(total)) + " of " +
            esc(formatDuration(goal)) + " · " + percent + "%" +
            (met ? "" : " · " + esc(formatDuration(Math.max(0, goal - total))) + " to go") +
          "</div>" +
          '<div class="goal-meter"><span style="width:' + percent + '%"></span></div>' +
        "</div>";

      els.goalSince.textContent = goalSince() === today
        ? "Goal active since today. Changing the amount keeps this start date."
        : "Goal active since " + formatFullDate(goalSince()) + ". Changing the amount keeps this start date.";
    }

    renderGoalHistory(now, hasGoal);
  }

  function renderGoalHistory(now, hasGoal) {
    const parts = [];
    for (let index = 0; index < 7; index += 1) {
      const key = addDaysKey(state.todayKey, -index);
      const info = goalDayInfo(key, now, hasGoal);
      const name = index === 0 ? "Today" : index === 1 ? "Yesterday" : formatWeekdayShort(key);
      const mark = info.kind === "met" ? "✓" : info.kind === "missed" ? "✕" : "·";
      const className = info.kind === "met" ? " is-met" : info.kind === "missed" ? " is-missed" : "";
      const title = goalDayTitle(key, info);
      const detail = info.kind === "before"
        ? "Didn't add a goal"
        : info.kind === "none"
          ? "No goal set"
          : formatDuration(info.total) + " of " + formatDuration(info.goal);

      parts.push(
        '<div class="goal-day' + className + '" title="' + esc(title) + '">' +
          '<span class="goal-day-top">' +
            '<span class="goal-day-name">' + esc(name) + "</span>" +
            '<span class="goal-day-date">' + esc(formatDateShort(key)) + "</span>" +
          "</span>" +
          '<span class="goal-day-detail">' + esc(detail) + "</span>" +
          '<span class="goal-day-mark">' + mark + "</span>" +
        "</div>"
      );
    }
    els.goalHistory.innerHTML = parts.join("");
  }

  function goalDayInfo(key, now, hasGoal) {
    if (!hasGoal) {
      return { kind: "none", total: 0, goal: 0, label: "No goal" };
    }
    if (!goalSince() || key < goalSince()) {
      return { kind: "before", total: 0, goal: 0, label: "Didn't add a goal" };
    }

    if (key < state.todayKey && state.results[key]) {
      const result = state.results[key];
      const goal = Math.max(0, Number(result.goalMs) || 0);
      if (!goal) return { kind: "none", total: result.totalMs || 0, goal: 0, label: "No goal" };
      return {
        kind: result.met ? "met" : "missed",
        total: Math.max(0, Number(result.totalMs) || 0),
        goal,
        label: result.met ? "Goal completed" : "Goal not completed"
      };
    }

    const goal = goalForDay(key);
    if (!goal) return { kind: "none", total: dayCountedTotal(key, now), goal: 0, label: "No goal" };
    const total = dayCountedTotal(key, now);
    return {
      kind: total >= goal ? "met" : "missed",
      total,
      goal,
      label: total >= goal ? "Goal completed" : "Goal not completed"
    };
  }

  function goalDayTitle(key, info) {
    if (info.kind === "before") return formatFullDate(key) + ": Didn't add a goal";
    if (info.kind === "none") return formatFullDate(key) + ": No goal";
    return formatFullDate(key) + ": " + info.label + " · " +
      formatDuration(info.total) + " of " + formatDuration(info.goal);
  }

  function renderCharts(now) {
    renderWeekChart(now);
    renderFlowChart(now);
  }

  function renderWeekChart(now) {
    const days = [];
    for (let index = 0; index < 7; index += 1) {
      const key = addDaysKey(state.todayKey, -index);
      days.push({ key, total: dayCountedTotal(key, now) });
    }

    const max = Math.max(1, Math.max.apply(null, days.map((day) => day.total)));
    const weekTotal = days.reduce((total, day) => total + day.total, 0);

    els.weekChart.innerHTML = days.map((day) => {
      const isToday = day.key === state.todayKey;
      const empty = day.total <= 0;
      const height = empty ? 4 : Math.max(6, Math.min(64, Math.round((day.total / max) * 64)));
      const label = isToday ? "Today" : formatWeekdayShort(day.key);
      const className = "bar-col" + (isToday ? " is-today" : "") + (empty ? " is-empty" : "");
      return (
        '<div class="' + className + '" title="' + esc(formatFullDate(day.key) + ": " + formatDuration(day.total)) + '">' +
          '<span class="bar-value">' + esc(formatDuration(day.total)) + "</span>" +
          '<div class="bar-track"><div class="bar-fill" style="height:' + height + 'px"></div></div>' +
          '<span class="bar-label">' + esc(label) + "</span>" +
        "</div>"
      );
    }).join("");

    els.weekTotal.textContent = formatDuration(weekTotal);
    els.allRecorded.textContent = formatDuration(allRecordedTotal(now));
    els.weekChart.setAttribute(
      "aria-label",
      "Last 7 days task time. Week total " + formatDuration(weekTotal) + "."
    );
  }

  function allRecordedTotal(now) {
    const keys = new Set(Object.keys(state.data.days));
    Object.keys(state.results).forEach((key) => keys.add(key));
    let total = 0;
    keys.forEach((key) => {
      total += dayCountedTotal(key, now);
    });
    return total;
  }

  function renderFlowChart(now) {
    const tasks = getDayTasks(state.selectedDay).slice().sort(compareTasks);
    const total = tasks.reduce((sum, task) => {
      return sum + countedForTaskOnDay(task, state.selectedDay, now);
    }, 0);

    els.flowMeta.textContent = dayLabel(state.selectedDay) + " · " + formatDateShort(state.selectedDay);

    const nodes = [];
    nodes.push(
      '<div class="flow-node is-start">' +
        '<span class="flow-index">▶</span>' +
        '<div class="flow-main">' +
          '<div class="flow-name">Start</div>' +
          '<div class="flow-sub">' + esc(formatFullDate(state.selectedDay)) + "</div>" +
        "</div>" +
        '<span class="flow-time">—</span>' +
      "</div>"
    );

    tasks.forEach((task, index) => {
      const status = flowStatusLabel(task.status);
      const stepMs = countedForTaskOnDay(task, state.selectedDay, now);
      nodes.push(
        '<div class="flow-node' + (task.status === "running" ? " is-running" : "") + '">' +
          '<span class="flow-index">' + (index + 1) + "</span>" +
          '<div class="flow-main">' +
            '<div class="flow-name">' + esc(task.title) + "</div>" +
            '<div class="flow-sub">' + esc(status) + "</div>" +
          "</div>" +
          '<span class="flow-time">' + esc(clockText(stepMs)) + "</span>" +
        "</div>"
      );
    });

    nodes.push(
      '<div class="flow-node is-total">' +
        '<span class="flow-index">Σ</span>' +
        '<div class="flow-main">' +
          '<div class="flow-name">Total</div>' +
          '<div class="flow-sub">' + tasks.length + " task" + (tasks.length === 1 ? "" : "s") + "</div>" +
        "</div>" +
        '<span class="flow-time">' + esc(clockText(total)) + "</span>" +
      "</div>"
    );

    els.flowChart.innerHTML = nodes.join("");
  }

  function flowStatusLabel(status) {
    if (status === "running") return "Running";
    if (status === "paused") return "Paused";
    if (status === "done") return "Done";
    return "Pending";
  }

  function updateClock(now) {
    const date = new Date(now);
    els.clockTime.textContent = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
    els.clockDate.textContent = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function updateTabTitle(now) {
    const running = runningTask();
    if (running) {
      document.title = clockText(taskElapsed(running.task, now)) + " · " + running.task.title + " · Daybook";
      return;
    }
    if (Number.isFinite(state.watch.startedAt)) {
      document.title = clockText(watchElapsed(now)) + " Stopwatch · Daybook";
      return;
    }
    document.title = "Daybook · Daily to-do";
  }

  function formatClockForText(ms) {
    return clockText(ms);
  }

  function clockText(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return pad2(hours) + ":" + pad2(minutes) + ":" + pad2(remainder);
  }

  function formatDuration(ms) {
    const value = Math.max(0, Number(ms) || 0);
    const totalMinutes = Math.floor(value / MINUTE);
    if (totalMinutes === 0) return value > 0 ? "<1m" : "0m";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return minutes + "m";
    if (minutes === 0) return hours + "h";
    return hours + "h " + minutes + "m";
  }

  function formatTimeOfDay(ms) {
    return new Date(ms).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatFullDate(key) {
    return parseDayKey(key).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatDateShort(key) {
    return parseDayKey(key).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }

  function formatWeekdayShort(key) {
    return parseDayKey(key).toLocaleDateString("en-US", { weekday: "short" });
  }

  function dayLabel(key) {
    if (key === state.todayKey) return "Today";
    if (key === addDaysKey(state.todayKey, -1)) return "Yesterday";
    if (key === addDaysKey(state.todayKey, 1)) return "Tomorrow";
    return parseDayKey(key).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
  }

  function ymd(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function isDayKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function parseDayKey(key) {
    const parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function dayStartMs(key) {
    return parseDayKey(key).getTime();
  }

  function dayEndMs(key) {
    return dayStartMs(addDaysKey(key, 1));
  }

  function addDaysKey(key, days) {
    const date = parseDayKey(key);
    date.setDate(date.getDate() + days);
    return ymd(date);
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }
})();
