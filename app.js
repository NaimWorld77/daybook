(() => {
  "use strict";

  const STORAGE_KEY = "daybook.v1";
  const PROFILE_KEY = "daybook.profile.v1";
  const GOAL_KEY = "daybook.goal.v1";
  const GOAL_RESULTS_KEY = "daybook.goal.results.v1";

  let state = { days: {}, selected: "" };
  let confirmDelete = null;
  let confirmTimer = 0;
  let knownToday = "";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function uid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function todayKey(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function parseKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(key, amount) {
    const date = parseKey(key);
    date.setDate(date.getDate() + amount);
    return todayKey(date);
  }

  function dayRelation(key) {
    const today = todayKey();
    if (key === today) return "Today";
    if (key === addDays(today, -1)) return "Yesterday";
    if (key === addDays(today, 1)) return "Tomorrow";
    return "";
  }

  function formatDay(key) {
    return parseKey(key).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  function formatCardDate(key) {
    return parseKey(key).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function clockTime(stamp) {
    return new Date(stamp).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function lastNDays(count) {
    const end = todayKey();
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1) keys.push(addDays(end, -i));
    return keys;
  }

  function announce(message) {
    setText(document.getElementById("live"), message);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { days: {} };
      const data = JSON.parse(raw);
      if (!data || typeof data.days !== "object" || !data.days) return { days: {} };
      const days = {};
      for (const [key, day] of Object.entries(data.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || !Array.isArray(day.tasks)) continue;
        const tasks = day.tasks.map(normalizeTask).filter(Boolean);
        if (tasks.length) days[key] = { tasks };
      }
      return { days };
    } catch {
      return { days: {} };
    }
  }

  function normalizeTask(task) {
    if (!task || typeof task !== "object") return null;
    const allowed = ["pending", "running", "paused", "done"];
    let status = allowed.includes(task.status) ? task.status : "pending";
    const startedAt = Number(task.startedAt) || null;
    if (status === "running" && !startedAt) status = "paused";
    const title = String(task.title || "Untitled").trim().slice(0, 140) || "Untitled";
    return {
      id: String(task.id || uid()),
      title,
      status,
      accumulatedMs: Math.max(0, Number(task.accumulatedMs) || 0),
      startedAt: status === "running" ? startedAt : null,
      firstStartedAt: Number(task.firstStartedAt) || null,
      completedAt: Number(task.completedAt) || null,
      createdAt: Number(task.createdAt) || Date.now(),
    };
  }

  function enforceSingleRunner(days) {
    const running = [];
    for (const day of Object.values(days)) {
      for (const task of day.tasks) {
        if (task.status === "running") running.push(task);
      }
    }
    if (running.length <= 1) return false;
    running.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const now = Date.now();
    for (const task of running.slice(1)) {
      task.accumulatedMs += Math.max(0, now - (task.startedAt || now));
      task.startedAt = null;
      task.status = "paused";
    }
    return true;
  }

  function save() {
    const days = {};
    for (const [key, day] of Object.entries(state.days)) {
      if (day.tasks && day.tasks.length) days[key] = day;
    }
    const note = document.getElementById("save-note");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, days }));
      if (note) note.textContent = "Saved in this browser, on this computer.";
    } catch {
      if (note) note.textContent = "This browser blocked saving, so the list lasts until you close the page.";
    }
  }

  function dayTasks(key) {
    return (state.days[key] && state.days[key].tasks) || [];
  }

  function ensureDay(key) {
    if (!state.days[key]) state.days[key] = { tasks: [] };
    return state.days[key];
  }

  function rollUnfinished(now = new Date()) {
    const today = todayKey(now);
    const stamp = now.getTime();
    const keys = Object.keys(state.days).filter((key) => key < today).sort();
    const carried = [];
    for (const key of keys) {
      const day = state.days[key];
      if (!day || !Array.isArray(day.tasks)) continue;
      const staying = [];
      for (const task of day.tasks) {
        if (task.status === "done") {
          staying.push(task);
          continue;
        }
        if (task.status === "running") {
          task.accumulatedMs = elapsed(task, stamp);
          task.startedAt = null;
          task.status = "paused";
        }
        carried.push(task);
      }
      if (staying.length) day.tasks = staying;
      else delete state.days[key];
    }
    if (!carried.length) return 0;
    const day = ensureDay(today);
    day.tasks = carried.concat(day.tasks);
    save();
    return carried.length;
  }

  function findTask(id) {
    for (const [key, day] of Object.entries(state.days)) {
      const task = day.tasks.find((item) => item.id === id);
      if (task) return { key, day, task };
    }
    return null;
  }

  function runningTask() {
    for (const [key, day] of Object.entries(state.days)) {
      const task = day.tasks.find((item) => item.status === "running");
      if (task) return { key, day, task };
    }
    return null;
  }

  function elapsed(task, now = Date.now()) {
    const base = Math.max(0, Number(task.accumulatedMs) || 0);
    if (task.status === "running" && task.startedAt) {
      return base + Math.max(0, now - task.startedAt);
    }
    return base;
  }

  function dayTotal(key, now = Date.now()) {
    return dayTasks(key).reduce((sum, task) => sum + elapsed(task, now), 0);
  }

  function allTotal(now = Date.now()) {
    return Object.keys(state.days).reduce((sum, key) => sum + dayTotal(key, now), 0);
  }

  function weekTotal(now = Date.now()) {
    return lastNDays(7).reduce((sum, key) => sum + dayTotal(key, now), 0);
  }

  function totalFor(token, now = Date.now()) {
    if (token === "__all__") return allTotal(now);
    if (token === "__today__") return dayTotal(todayKey(new Date(now)), now);
    if (token === "__week__") return weekTotal(now);
    if (token === "__selected__") return dayTotal(state.selected, now);
    return dayTotal(token, now);
  }

  function liveFor(token) {
    const running = runningTask();
    if (!running) return false;
    if (token === "__all__") return true;
    if (token === "__today__") return running.key === todayKey();
    if (token === "__week__") return lastNDays(7).includes(running.key);
    if (token === "__selected__") return running.key === state.selected;
    return running.key === token;
  }

  function parts(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return {
      h: Math.floor(total / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60,
    };
  }

  function formatClock(ms) {
    const { h, m, s } = parts(ms);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function formatCompact(ms, live) {
    const { h, m, s } = parts(ms);
    if (h > 0) return live ? `${h}h ${pad(m)}m ${pad(s)}s` : `${h}h ${pad(m)}m`;
    if (m > 0) return live || s ? `${m}m ${pad(s)}s` : `${m}m`;
    if (s > 0 || live) return `${s}s`;
    return "0m";
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function formatWords(ms, live) {
    const { h, m, s } = parts(ms);
    if (h === 0 && m === 0 && s === 0) return live ? "0 seconds" : "0 minutes";
    const bits = [];
    if (h) bits.push(plural(h, "hour"));
    if (m) bits.push(plural(m, "minute"));
    if (s && (live || h === 0)) bits.push(plural(s, "second"));
    return bits.join(" ") || "0 minutes";
  }

  function textFor(format, ms, live) {
    if (format === "clock") return formatClock(ms);
    if (format === "words") return formatWords(ms, live);
    return formatCompact(ms, live);
  }

  function clearArmedDelete() {
    confirmDelete = null;
    clearTimeout(confirmTimer);
  }

  function taskButton(action, id) {
    const safe = window.CSS && CSS.escape ? CSS.escape(id) : id;
    return document.querySelector(`[data-action="${action}"][data-id="${safe}"]`);
  }

  function refreshDeleteButton(id) {
    const button = taskButton("delete", id);
    if (!button) return;
    const armed = confirmDelete === id;
    button.textContent = armed ? "Remove?" : "Delete";
    button.classList.toggle("danger", armed);
  }

  function armDelete(id) {
    const previous = confirmDelete;
    confirmDelete = id;
    clearTimeout(confirmTimer);
    if (previous && previous !== id) refreshDeleteButton(previous);
    refreshDeleteButton(id);
    confirmTimer = setTimeout(() => {
      const armed = confirmDelete;
      confirmDelete = null;
      if (armed) refreshDeleteButton(armed);
    }, 2200);
  }

  function displayTitle(task) {
    return task.title.trim() || "Untitled";
  }

  function syncTitleDisplays(task) {
    const label = displayTitle(task);
    const safe = window.CSS && CSS.escape ? CSS.escape(task.id) : task.id;
    document.querySelectorAll(`[data-title-for="${safe}"]`).forEach((node) => setText(node, label));
  }

  function goToSection(value) {
    if (!value) return;
    if (value === "yesterday") selectDay(addDays(todayKey(), -1));
    else if (value === "tomorrow") selectDay(addDays(todayKey(), 1));
    else if (value === "list") selectDay(todayKey());
    const target = document.getElementById(value === "yesterday" || value === "tomorrow" ? "list" : value);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectDay(key) {
    if (!key) return;
    clearArmedDelete();
    state.selected = key;
    renderAll();
  }

  function addTask() {
    const input = document.getElementById("task-input");
    const title = input.value.trim();
    if (!title) {
      input.value = "";
      input.focus();
      return;
    }
    clearArmedDelete();
    ensureDay(state.selected).tasks.push({
      id: uid(),
      title,
      status: "pending",
      accumulatedMs: 0,
      startedAt: null,
      firstStartedAt: null,
      completedAt: null,
      createdAt: Date.now(),
    });
    input.value = "";
    save();
    announce(`Added ${title}.`);
    renderAll();
    input.focus();
  }

  function startTask(id) {
    const found = findTask(id);
    if (!found) return;
    clearArmedDelete();
    const now = Date.now();
    let pausedName = "";
    for (const day of Object.values(state.days)) {
      for (const task of day.tasks) {
        if (task.status === "running" && task.id !== id) {
          task.accumulatedMs = elapsed(task, now);
          task.startedAt = null;
          task.status = "paused";
          pausedName = displayTitle(task);
        }
      }
    }
    const task = found.task;
    if (task.status === "running" || task.status === "done") return;
    task.completedAt = null;
    task.status = "running";
    task.startedAt = now;
    if (!task.firstStartedAt) task.firstStartedAt = now;
    save();
    const name = displayTitle(task);
    announce(pausedName ? `Paused ${pausedName}. Timing ${name}.` : `Timing ${name}.`);
    renderAll();
  }

  function pauseTask(id) {
    const found = findTask(id);
    if (!found || found.task.status !== "running") return;
    clearArmedDelete();
    const task = found.task;
    task.accumulatedMs = elapsed(task);
    task.startedAt = null;
    task.status = "paused";
    save();
    announce(`Paused ${displayTitle(task)} at ${formatClock(task.accumulatedMs)}.`);
    renderAll();
  }

  function completeTask(id) {
    const found = findTask(id);
    if (!found || found.task.status === "done") return;
    clearArmedDelete();
    const task = found.task;
    if (task.status === "running") {
      task.accumulatedMs = elapsed(task);
      task.startedAt = null;
    }
    task.status = "done";
    task.completedAt = Date.now();
    save();
    announce(`${displayTitle(task)} checked off. ${formatWords(task.accumulatedMs, true)}.`);
    renderAll();
  }

  function reopenTask(id) {
    const found = findTask(id);
    if (!found || found.task.status !== "done") return;
    clearArmedDelete();
    const task = found.task;
    task.completedAt = null;
    task.status = task.accumulatedMs > 0 ? "paused" : "pending";
    save();
    announce(`${displayTitle(task)} reopened.`);
    renderAll();
  }

  function toggleTask(id) {
    const found = findTask(id);
    if (!found) return;
    if (found.task.status === "done") reopenTask(id);
    else completeTask(id);
  }

  function deleteTask(id) {
    if (confirmDelete !== id) {
      armDelete(id);
      return;
    }
    clearArmedDelete();
    for (const day of Object.values(state.days)) {
      const index = day.tasks.findIndex((task) => task.id === id);
      if (index < 0) continue;
      const [task] = day.tasks.splice(index, 1);
      save();
      announce(`Removed ${displayTitle(task)}.`);
      renderAll();
      return;
    }
  }

  function statusText(task) {
    if (task.status === "running") return "Timing";
    if (task.status === "paused") return "Paused";
    if (task.status === "done") {
      const doneAt = task.completedAt ? `Done at ${clockTime(task.completedAt)}` : "Done";
      const startedAt = task.firstStartedAt
        || (task.completedAt && task.accumulatedMs > 0 ? task.completedAt - task.accumulatedMs : null);
      if ((task.accumulatedMs || 0) <= 0) {
        return task.completedAt ? `${doneAt} · no time recorded` : "Done · no time recorded";
      }
      return startedAt ? `Started at ${clockTime(startedAt)} · ${doneAt}` : doneAt;
    }
    return "Not started";
  }

  function actionButton(text, action, id, variant) {
    return el("button", {
      type: "button",
      class: variant ? `btn ${variant}` : "btn",
      "data-action": action,
      "data-id": id,
      text,
    });
  }

  function cardMeta(name, tasks) {
    if (!tasks.length) {
      if (name === "Tomorrow") return "Nothing planned";
      if (name === "Yesterday") return "Nothing recorded";
      return "Nothing yet";
    }
    const done = tasks.filter((task) => task.status === "done").length;
    if (name === "Tomorrow" && done === 0) return `${tasks.length} planned`;
    return `${done} of ${tasks.length} done`;
  }

  function emptyCopy(key) {
    const relation = dayRelation(key);
    if (relation === "Today") {
      return "Your list for today is empty. Add what you want to finish, then press Start when you begin.";
    }
    if (relation === "Tomorrow") return "Nothing planned for tomorrow yet. You can line the day up now.";
    if (relation === "Yesterday") return "Nothing was recorded yesterday.";
    return "Nothing was recorded on this day.";
  }

  function renderHeader() {
    setText(document.getElementById("wall-date"), formatDay(todayKey()));
  }

  function renderCards() {
    const today = todayKey();
    const specs = [
      { key: addDays(today, -1), name: "Yesterday" },
      { key: today, name: "Today" },
      { key: addDays(today, 1), name: "Tomorrow" },
    ];
    const running = runningTask();
    const cards = specs.map(({ key, name }) => {
      const tasks = dayTasks(key);
      const timing = running && running.key === key;
      return el("button", {
        type: "button",
        class: `day-card${key === today ? " today" : ""}`,
        "data-action": "select-day",
        "data-day": key,
        "aria-pressed": key === state.selected ? "true" : "false",
      }, [
        el("span", { class: "card-kicker" }, [
          el("span", { class: "eyebrow", text: name }),
          timing ? el("span", { class: "rec", "aria-label": "Timer running" }) : null,
        ]),
        el("span", { class: "card-date", text: formatCardDate(key) }),
        el("span", {
          class: "time card-time",
          "data-day-time": key,
          "data-format": "compact",
          text: formatCompact(dayTotal(key), liveFor(key)),
        }),
        el("span", { class: "quiet", text: cardMeta(name, tasks) }),
      ]);
    });
    document.getElementById("day-cards").replaceChildren(el("div", { class: "days" }, cards));
  }

  function watchSide() {
    return el("div", { class: "watch-side" }, [
      el("p", { class: "eyebrow", text: "Today so far" }),
      el("p", {
        class: "side-time time",
        "data-day-time": "__today__",
        "data-format": "clock",
        text: formatClock(totalFor("__today__")),
      }),
      el("p", {
        class: "watch-words",
        "data-day-time": "__today__",
        "data-format": "words",
        text: formatWords(totalFor("__today__"), liveFor("__today__")),
      }),
    ]);
  }

  function renderStopwatch() {
    const running = runningTask();
    const root = document.getElementById("stopwatch");
    root.className = running ? "watch" : "watch is-idle";
    if (!running) {
      root.replaceChildren(
        el("div", { class: "watch-main" }, [
          el("p", { class: "eyebrow", text: "Stopwatch" }),
          el("h2", { class: "watch-task", text: "No task is running" }),
          el("p", { class: "watch-time time", text: "00:00:00" }),
          el("p", {
            class: "watch-help",
            text: "Press Start on a task. That clock, and today’s total, both move until you pause or mark it done.",
          }),
        ]),
        watchSide(),
      );
      return;
    }
    const { task, key } = running;
    const where = dayRelation(key) || formatDay(key);
    root.replaceChildren(
      el("div", { class: "watch-main" }, [
        el("p", { class: "eyebrow watch-kicker" }, [
          el("span", { class: "rec", "aria-hidden": "true" }),
          el("span", { text: "Timing now" }),
        ]),
        el("h2", { class: "watch-task", "data-title-for": task.id, text: displayTitle(task) }),
        el("p", { class: "watch-where", text: where }),
        el("p", {
          class: "watch-time time",
          "data-task-time": task.id,
          "data-format": "clock",
          text: formatClock(elapsed(task)),
        }),
        el("p", {
          class: "watch-words",
          "data-task-time": task.id,
          "data-format": "words",
          text: formatWords(elapsed(task), true),
        }),
        el("div", { class: "watch-actions" }, [
          actionButton("Pause", "pause", task.id),
          actionButton("Mark done", "done", task.id, "good"),
        ]),
      ]),
      watchSide(),
    );
  }

  function createTaskRow(task) {
    const done = task.status === "done";
    const check = el("button", {
      type: "button",
      class: "check",
      "data-action": "toggle",
      "data-id": task.id,
      "aria-pressed": done ? "true" : "false",
      "aria-label": done ? `Reopen ${displayTitle(task)}` : `Mark ${displayTitle(task)} done`,
      text: done ? "✓" : "",
    });
    const title = el("input", {
      class: "task-title",
      value: task.title,
      maxlength: "140",
      "aria-label": "Task name",
      autocomplete: "off",
    });
    title.value = task.title;
    const actions = el("div", { class: "task-actions" });
    if (task.status === "running") {
      actions.append(actionButton("Pause", "pause", task.id));
      actions.append(actionButton("Done", "done", task.id, "good"));
    } else if (task.status === "paused") {
      actions.append(actionButton("Resume", "start", task.id));
      actions.append(actionButton("Done", "done", task.id, "good"));
    } else if (task.status === "pending") {
      actions.append(actionButton("Start", "start", task.id));
    }
    const remove = actionButton(confirmDelete === task.id ? "Remove?" : "Delete", "delete", task.id, confirmDelete === task.id ? "danger" : "");
    actions.append(remove);
    const row = el("article", { class: `task ${task.status}`, role: "listitem" }, [
      check,
      el("div", { class: "task-main" }, [
        title,
        el("p", { class: "status", text: statusText(task) }),
      ]),
      el("div", { class: "task-side" }, [
        el("p", {
          class: "time task-clock",
          "data-task-time": task.id,
          "data-format": "clock",
          text: formatClock(elapsed(task)),
        }),
        actions,
      ]),
    ]);
    title.addEventListener("focus", () => {
      title.dataset.prev = task.title;
    });
    title.addEventListener("input", () => {
      task.title = title.value;
      save();
      syncTitleDisplays(task);
      check.setAttribute("aria-label", task.status === "done"
        ? `Reopen ${displayTitle(task)}`
        : `Mark ${displayTitle(task)} done`);
    });
    title.addEventListener("blur", () => {
      const next = title.value.trim();
      const fallback = (title.dataset.prev || "").trim();
      task.title = (next || fallback || "Untitled").slice(0, 140);
      title.value = task.title;
      save();
      syncTitleDisplays(task);
    });
    return row;
  }

  function renderTasks() {
    const key = state.selected;
    const tasks = dayTasks(key);
    const relation = dayRelation(key);
    setText(document.getElementById("list-title"), relation || formatDay(key));
    setText(document.getElementById("list-date"), relation ? formatDay(key) : "Recorded day");
    document.getElementById("back-today").hidden = key === todayKey();
    setText(document.getElementById("composer-label"), `Add to ${relation || formatDay(key)}`);

    const stats = document.getElementById("list-stats");
    if (!tasks.length) {
      stats.textContent = "No tasks yet";
    } else {
      const done = tasks.filter((task) => task.status === "done").length;
      stats.replaceChildren(
        document.createTextNode(`${done} of ${tasks.length} done · `),
        el("span", {
          class: "time",
          "data-day-time": key,
          "data-format": "compact",
          text: formatCompact(dayTotal(key), liveFor(key)),
        }),
      );
    }

    const list = document.getElementById("task-list");
    if (!tasks.length) {
      list.removeAttribute("role");
      list.removeAttribute("aria-label");
      list.replaceChildren(el("p", { class: "empty", text: emptyCopy(key) }));
    } else {
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", `Tasks for ${relation || formatDay(key)}`);
      list.replaceChildren(...tasks.map(createTaskRow));
    }
    renderDayTotal(key, tasks.length > 0);
  }

  function renderDayTotal(key, visible) {
    const root = document.getElementById("day-total");
    if (!visible) {
      root.hidden = true;
      root.replaceChildren();
      return;
    }
    root.hidden = false;
    root.replaceChildren(
      el("p", { class: "eyebrow", text: "Total for this day" }),
      el("p", {
        class: "time total-clock",
        "data-day-time": key,
        "data-format": "clock",
        text: formatClock(dayTotal(key)),
      }),
      el("p", {
        class: "quiet",
        "data-day-time": key,
        "data-format": "words",
        text: formatWords(dayTotal(key), liveFor(key)),
      }),
    );
  }

  function flowTasks(tasks) {
    const started = [];
    const waiting = [];
    for (const task of tasks) {
      if (task.firstStartedAt || task.completedAt) started.push(task);
      else waiting.push(task);
    }
    started.sort((a, b) => (a.firstStartedAt || a.completedAt) - (b.firstStartedAt || b.completedAt));
    return started.concat(waiting);
  }

  function flowLabel(task) {
    if (task.status === "running") return "Timing";
    if (task.status === "paused") return "Paused";
    if (task.status === "done") return "✓ Done";
    return "Planned";
  }

  function renderFlow() {
    const tasks = dayTasks(state.selected);
    const root = document.getElementById("flow");
    if (!tasks.length) {
      root.replaceChildren(el("p", {
        class: "empty",
        text: "The flow chart appears here once you add tasks. Steps line up in the order you work them.",
      }));
      return;
    }
    const flow = el("div", { class: "flow", role: "list" });
    const push = (node) => {
      node.setAttribute("role", "listitem");
      flow.append(node);
    };
    push(el("div", { class: "node bookend" }, [
      el("p", { class: "eyebrow", text: "Start" }),
      el("p", { class: "node-title", text: dayRelation(state.selected) || formatCardDate(state.selected) }),
    ]));
    flowTasks(tasks).forEach((task, index) => {
      flow.append(el("div", { class: "arrow", "aria-hidden": "true" }));
      push(el("div", { class: `node ${task.status}` }, [
        el("p", { class: "eyebrow", text: `Step ${index + 1}` }),
        el("p", { class: "node-title", "data-title-for": task.id, text: displayTitle(task) }),
        el("p", {
          class: "time",
          "data-task-time": task.id,
          "data-format": "compact",
          text: formatCompact(elapsed(task), task.status === "running"),
        }),
        el("p", { class: "quiet", text: flowLabel(task) }),
      ]));
    });
    flow.append(el("div", { class: "arrow", "aria-hidden": "true" }));
    push(el("div", { class: "node bookend" }, [
      el("p", { class: "eyebrow", text: "Total" }),
      el("p", {
        class: "time",
        "data-day-time": state.selected,
        "data-format": "compact",
        text: formatCompact(dayTotal(state.selected), liveFor(state.selected)),
      }),
    ]));
    root.replaceChildren(flow);
    const live = flow.querySelector(".node.running");
    if (live) {
      const left = live.offsetLeft - flow.clientWidth / 2 + live.clientWidth / 2;
      flow.scrollLeft = Math.max(0, left);
    }
  }

  function renderHistory() {
    const keys = lastNDays(7);
    const columns = keys.map((key) => el("button", {
      type: "button",
      class: `week-col${key === todayKey() ? " is-today" : ""}`,
      "data-action": "select-day",
      "data-day": key,
      "aria-pressed": key === state.selected ? "true" : "false",
    }, [
      el("span", { class: "bar-track" }, [
        el("span", { class: "bar", "data-week-bar": key }),
      ]),
      el("span", { class: "week-name", text: parseKey(key).toLocaleDateString(undefined, { weekday: "short" }) }),
      el("span", {
        class: "time week-value",
        "data-day-time": key,
        "data-format": "compact",
        text: formatCompact(dayTotal(key), liveFor(key)),
      }),
    ]));

    const weekStart = keys[0];
    const olderKeys = Object.keys(state.days)
      .filter((key) => key < weekStart && dayTasks(key).length)
      .sort()
      .reverse();

    const parts = [
      el("div", { class: "week" }, columns),
      el("div", { class: "history-totals" }, [
        el("p", {}, [
          "This week: ",
          el("span", {
            class: "time",
            "data-day-time": "__week__",
            "data-format": "words",
            text: formatWords(weekTotal(), liveFor("__week__")),
          }),
        ]),
        el("p", {}, [
          "All recorded days: ",
          el("span", {
            class: "time",
            "data-day-time": "__all__",
            "data-format": "words",
            text: formatWords(allTotal(), liveFor("__all__")),
          }),
        ]),
      ]),
    ];

    if (olderKeys.length) {
      parts.push(el("h3", { text: "Earlier" }));
      parts.push(el("div", { class: "older" }, olderKeys.map((key) => {
        const tasks = dayTasks(key);
        const done = tasks.filter((task) => task.status === "done").length;
        return el("button", {
          type: "button",
          class: "older-row",
          "data-action": "select-day",
          "data-day": key,
          "aria-pressed": key === state.selected ? "true" : "false",
        }, [
          el("span", { text: formatDay(key) }),
          el("span", { class: "quiet", text: `${done} of ${tasks.length} done` }),
          el("span", {
            class: "time",
            "data-day-time": key,
            "data-format": "compact",
            text: formatCompact(dayTotal(key), liveFor(key)),
          }),
        ]);
      })));
    }

    document.getElementById("history").replaceChildren(...parts);
  }

  function paintBars(now = Date.now()) {
    const bars = [...document.querySelectorAll("[data-week-bar]")];
    if (!bars.length) return;
    const usable = 64;
    const values = bars.map((bar) => dayTotal(bar.getAttribute("data-week-bar"), now));
    const max = Math.max(...values, 1);
    bars.forEach((bar, index) => {
      const ms = values[index];
      const px = ms <= 0 ? 2 : Math.max(6, Math.min(usable, Math.round((ms / max) * usable)));
      bar.style.height = `${px}px`;
      bar.style.maxHeight = `${usable}px`;
      bar.classList.toggle("is-empty", ms <= 0);
    });
  }

  function paintTimes(stamp) {
    for (const day of Object.values(state.days)) {
      for (const task of day.tasks) {
        if (task.status === "running" && task.startedAt && stamp < task.startedAt) {
          task.startedAt = stamp;
          save();
        }
      }
    }
    document.querySelectorAll("[data-task-time]").forEach((node) => {
      const found = findTask(node.getAttribute("data-task-time"));
      if (!found) return;
      const live = found.task.status === "running";
      setText(node, textFor(node.getAttribute("data-format") || "clock", elapsed(found.task, stamp), live));
    });
    document.querySelectorAll("[data-day-time]").forEach((node) => {
      const token = node.getAttribute("data-day-time");
      setText(node, textFor(node.getAttribute("data-format") || "compact", totalFor(token, stamp), liveFor(token)));
    });
    const running = runningTask();
    const nextTitle = running
      ? `${formatClock(elapsed(running.task, stamp))} · ${displayTitle(running.task)} · Daybook`
      : "Daybook";
    if (document.title !== nextTitle) document.title = nextTitle;
    paintBars(stamp);
    paintGoals(stamp);
  }

  function loadGoal() {
    try {
      const data = JSON.parse(localStorage.getItem(GOAL_KEY) || "null");
      const ms = Number(data && data.ms);
      if (!Number.isFinite(ms) || ms <= 0) return { ms: 0, since: "" };
      const since = typeof data.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.since)
        ? data.since
        : "";
      return { ms: Math.min(ms, 24 * 60 * 60 * 1000), since };
    } catch {
      return { ms: 0, since: "" };
    }
  }

  function goalMs() {
    return loadGoal().ms;
  }

  function goalSince() {
    const goal = loadGoal();
    if (!goal.ms) return "";
    return goal.since || todayKey();
  }

  function saveGoal(ms) {
    const since = loadGoal().since || todayKey();
    localStorage.setItem(GOAL_KEY, JSON.stringify({ ms, since }));
  }

  function rememberGoalStart() {
    const goal = loadGoal();
    if (!goal.ms || goal.since) return;
    localStorage.setItem(GOAL_KEY, JSON.stringify({ ms: goal.ms, since: todayKey() }));
  }

  function loadGoalResults() {
    try {
      const data = JSON.parse(localStorage.getItem(GOAL_RESULTS_KEY) || "null");
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function saveGoalResults(results) {
    localStorage.setItem(GOAL_RESULTS_KEY, JSON.stringify(results));
  }

  function goalCredit(taskId, results) {
    const since = goalSince();
    let sum = 0;
    Object.entries(results).forEach(([key, record]) => {
      if (since && key < since) return;
      const portion = record && record.counted && Number(record.counted[taskId]);
      if (Number.isFinite(portion) && portion > 0) sum += portion;
    });
    return sum;
  }

  function goalDayTotal(key, stamp, results) {
    return dayTasks(key).reduce((sum, task) => {
      return sum + Math.max(0, elapsed(task, stamp) - goalCredit(task.id, results));
    }, 0);
  }

  function settleGoalDays(now = new Date()) {
    const goal = goalMs();
    const since = goalSince();
    if (!goal || !since) return;
    const today = todayKey(now);
    const stamp = now.getTime();
    const results = loadGoalResults();
    const keys = new Set(Object.keys(state.days).filter((key) => key < today));
    for (let i = 1; i <= 7; i += 1) keys.add(addDays(today, -i));
    let changed = false;
    [...keys].sort().forEach((key) => {
      if (key < since) {
        if (results[key]) {
          delete results[key];
          changed = true;
        }
        return;
      }
      if (results[key]) return;
      const counted = {};
      let totalMs = 0;
      dayTasks(key).forEach((task) => {
        const portion = Math.max(0, elapsed(task, stamp) - goalCredit(task.id, results));
        if (portion > 0) counted[task.id] = portion;
        totalMs += portion;
      });
      results[key] = { totalMs, goalMs: goal, met: totalMs >= goal, counted };
      changed = true;
    });
    if (changed) saveGoalResults(results);
  }

  function renderGoal() {
    const root = document.getElementById("goal-board");
    const goal = goalMs();
    const hours = document.getElementById("goal-hours");
    const minutes = document.getElementById("goal-minutes");
    if (hours && document.activeElement !== hours) hours.value = String(Math.floor(goal / 3600000));
    if (minutes && document.activeElement !== minutes) {
      minutes.value = String(Math.floor((goal % 3600000) / 60000));
    }
    if (!goal) {
      root.replaceChildren(el("p", {
        class: "empty",
        text: "Set a daily goal. From that day on, a day gets a green tick when you reach it. Earlier days say you didn't add a goal.",
      }));
      return;
    }
    const cards = lastNDays(7).slice().reverse().map((key) => el("article", {
      class: "goal-card",
      "data-goal-day": key,
    }, [
      el("span", { class: "goal-mark", "data-goal-mark": key, "aria-hidden": "true", text: "" }),
      el("div", { class: "goal-copy" }, [
        el("p", { class: "goal-day", text: dayRelation(key) || formatCardDate(key) }),
        el("p", { class: "goal-progress", "data-goal-progress": key, text: "" }),
        el("p", { class: "goal-state", "data-goal-state": key, text: "" }),
      ]),
    ]));
    root.replaceChildren(el("div", { class: "goal-board" }, cards));
  }

  function paintGoals(stamp) {
    const goal = goalMs();
    if (!goal) return;
    const today = todayKey(new Date(stamp));
    const since = goalSince();
    const results = loadGoalResults();
    document.querySelectorAll("[data-goal-day]").forEach((card) => {
      const key = card.getAttribute("data-goal-day");
      const mark = card.querySelector("[data-goal-mark]");
      const progress = card.querySelector("[data-goal-progress]");
      const state = card.querySelector("[data-goal-state]");
      if (since && key < since) {
        card.classList.remove("is-met", "is-short");
        card.classList.add("is-unset");
        setText(mark, "");
        setText(progress, "");
        setText(state, "Didn't add a goal");
        return;
      }
      card.classList.remove("is-unset");
      const saved = key < today ? results[key] : null;
      const total = saved ? saved.totalMs : goalDayTotal(key, stamp, results);
      const target = saved ? saved.goalMs : goal;
      const met = saved ? Boolean(saved.met) : total >= target;
      card.classList.toggle("is-met", met);
      card.classList.toggle("is-short", !met);
      setText(mark, met ? "✓" : "×");
      setText(progress, `${formatWords(total, !saved && liveFor(key))} of ${formatWords(target)}`);
      setText(state, met ? "Goal completed" : "Goal not completed");
    });
  }

  function renderAll() {
    renderHeader();
    renderCards();
    renderStopwatch();
    renderTasks();
    renderFlow();
    renderHistory();
    renderGoal();
    paintTimes(Date.now());
  }

  function tick() {
    const now = new Date();
    const key = todayKey(now);
    if (key !== knownToday) {
      settleGoalDays(now);
      knownToday = key;
      const moved = rollUnfinished(now);
      renderAll();
      if (moved) announce(moved === 1
        ? "Moved 1 unfinished task to today."
        : `Moved ${moved} unfinished tasks to today.`);
      return;
    }
    const wall = document.getElementById("wall-clock");
    setText(wall, now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }));
    paintTimes(now.getTime());
  }

  function onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "select-day") selectDay(button.dataset.day);
    else if (action === "select-today") selectDay(todayKey());
    else if (action === "start") startTask(id);
    else if (action === "pause") pauseTask(id);
    else if (action === "done") completeTask(id);
    else if (action === "toggle") toggleTask(id);
    else if (action === "delete") deleteTask(id);
    else if (action === "signup") openSignup();
    else if (action === "signout") signOut();
  }

  function loadProfile() {
    try {
      const data = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (!data || typeof data.name !== "string" || typeof data.email !== "string") return null;
      const name = data.name.trim().slice(0, 80);
      const email = data.email.trim().slice(0, 120);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      const picture = typeof data.picture === "string" && data.picture.startsWith("data:image/")
        ? data.picture
        : "";
      return { name, email, picture };
    } catch {
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function renderAccount() {
    const root = document.getElementById("account");
    const profile = loadProfile();
    if (!profile) {
      root.replaceChildren(el("button", {
        type: "button",
        class: "btn primary",
        "data-action": "signup",
        text: "Sign up",
      }));
      return;
    }
    const avatar = profile.picture
      ? el("img", { class: "avatar", src: profile.picture, alt: "" })
      : el("span", {
        class: "avatar avatar-letter",
        text: profile.name.slice(0, 1).toUpperCase(),
        "aria-hidden": "true",
      });
    root.replaceChildren(
      el("div", { class: "who" }, [
        avatar,
        el("div", {}, [
          el("p", { class: "who-name", text: profile.name }),
          el("p", { class: "who-email", text: profile.email }),
        ]),
      ]),
      el("button", {
        type: "button",
        class: "btn who-out",
        "data-action": "signout",
        text: "Sign out",
      }),
    );
  }

  function openSignup() {
    const dialog = document.getElementById("signup");
    const error = document.getElementById("signup-error");
    error.hidden = true;
    error.textContent = "";
    if (!dialog.open) dialog.showModal();
  }

  function signOut() {
    localStorage.removeItem(PROFILE_KEY);
    renderAccount();
    announce("Signed out. Your tasks are still on this computer.");
  }

  function readPicture(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      if (!file.type || !file.type.startsWith("image/")) {
        reject(new Error("Choose a picture file."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That picture could not be read."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That picture could not be read."));
        img.onload = () => {
          const size = 96;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const scale = Math.max(size / img.width, size / img.height);
          const width = img.width * scale;
          const height = img.height * scale;
          ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function init() {
    state = loadState();
    if (enforceSingleRunner(state.days)) save();
    rememberGoalStart();
    settleGoalDays();
    const moved = rollUnfinished();
    knownToday = todayKey();
    state.selected = knownToday;
    document.body.addEventListener("click", onClick);
    document.getElementById("composer").addEventListener("submit", (event) => {
      event.preventDefault();
      addTask();
    });
    document.getElementById("goal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = document.getElementById("goal-error");
      const hours = Math.max(0, Math.min(24, Math.floor(Number(form.hours.value) || 0)));
      const minutes = Math.max(0, Math.min(59, Math.floor(Number(form.minutes.value) || 0)));
      const ms = ((hours * 60) + minutes) * 60 * 1000;
      if (ms <= 0) {
        error.textContent = "Enter at least 1 minute.";
        error.hidden = false;
        return;
      }
      error.hidden = true;
      saveGoal(ms);
      settleGoalDays();
      renderGoal();
      paintGoals(Date.now());
      announce(`Daily goal set to ${formatWords(ms)}.`);
    });
    document.getElementById("section-menu").addEventListener("change", (event) => {
      goToSection(event.target.value);
    });
    document.addEventListener("visibilitychange", () => tick());
    window.addEventListener("focus", () => tick());
    renderAll();
    renderAccount();
    if (moved) {
      announce(moved === 1
        ? "Moved 1 unfinished task to today."
        : `Moved ${moved} unfinished tasks to today.`);
    }
    document.getElementById("signup-cancel").addEventListener("click", () => {
      document.getElementById("signup").close();
    });
    document.getElementById("signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = document.getElementById("signup-error");
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      error.hidden = true;
      try {
        const picture = await readPicture(form.picture.files[0]);
        saveProfile({ name, email, picture });
        form.reset();
        document.getElementById("signup").close();
        renderAccount();
        announce(`Signed in as ${name}.`);
      } catch (err) {
        error.textContent = err && err.message ? err.message : "Sign up did not finish.";
        error.hidden = false;
      }
    });
    setInterval(tick, 250);
  }

  init();
})();
