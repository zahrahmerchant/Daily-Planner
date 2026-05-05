import { formatLongDate, timeToMinutes, todayKey } from "./date.js";
import { describeQuickTask, inferCategory, parseQuickTask } from "./parser.js";
import {
  addGroceryItem,
  addLibraryTask,
  addQuickTask,
  addWaterEntry,
  deleteLibraryTask,
  getCategories,
  getDailyLimit,
  getDailyProgress,
  getDailyTasks,
  getGroceryList,
  getHighlightedTasks,
  getLowEnergyTask,
  getWorkSettings,
  getTaskLibrary,
  getTomorrowKey,
  getWaterGoalForState,
  getWaterProgress,
  getWaterReminderText,
  getWeeklySuggestions,
  getReminderSettings,
  getReminderState,
  isShoppingMode,
  isTaskSelected,
  loadState,
  savePlanToDaily,
  toggleGroceryItem,
  toggleShoppingMode,
  toggleTaskSelection,
  updateDailyTask,
  updateLibraryTask,
  updateReminderSettings,
  updateReminderState,
  updateWaterGoal,
  updateWorkSettings,
} from "./storage.js";

const state = loadState();
const today = todayKey();
const tomorrow = getTomorrowKey(today);
let activeScreen = "today";
let currentTaskId = null;
let deferredPrompt = null;
let reminderTimerId = null;
let didReloadForNewWorker = false;
let scheduleMessage = "";

const elements = {
  views: {
    today: document.querySelector("#todayView"),
    plan: document.querySelector("#planView"),
    library: document.querySelector("#libraryView"),
    life: document.querySelector("#lifeView"),
  },
  navButtons: [...document.querySelectorAll(".nav-button")],
  todayLabel: document.querySelector("#todayLabel"),
  progressSummary: document.querySelector("#progressSummary"),
  progressBar: document.querySelector("#progressBar"),
  todayHint: document.querySelector("#todayHint"),
  workStartInput: document.querySelector("#workStartInput"),
  workEndInput: document.querySelector("#workEndInput"),
  saveWorkHoursButton: document.querySelector("#saveWorkHoursButton"),
  scheduleHint: document.querySelector("#scheduleHint"),
  scheduleBanner: document.querySelector("#scheduleBanner"),
  timelineView: document.querySelector("#timelineView"),
  startHereList: document.querySelector("#startHereList"),
  nextList: document.querySelector("#nextList"),
  todayPlanButton: document.querySelector("#todayPlanButton"),
  lowEnergyButton: document.querySelector("#lowEnergyButton"),
  tomorrowLabel: document.querySelector("#tomorrowLabel"),
  selectionCount: document.querySelector("#selectionCount"),
  planGrid: document.querySelector("#planGrid"),
  saveTomorrowButton: document.querySelector("#saveTomorrowButton"),
  libraryBlocks: document.querySelector("#libraryBlocks"),
  openQuickAddButton: document.querySelector("#openQuickAddButton"),
  waterProgressLabel: document.querySelector("#waterProgressLabel"),
  waterProgressBar: document.querySelector("#waterProgressBar"),
  waterGoalInput: document.querySelector("#waterGoalInput"),
  saveWaterGoalButton: document.querySelector("#saveWaterGoalButton"),
  waterHint: document.querySelector("#waterHint"),
  reminderBanner: document.querySelector("#reminderBanner"),
  waterHistory: document.querySelector("#waterHistory"),
  enableNotificationsButton: document.querySelector("#enableNotificationsButton"),
  notificationStatus: document.querySelector("#notificationStatus"),
  waterReminderInterval: document.querySelector("#waterReminderInterval"),
  planReminderHour: document.querySelector("#planReminderHour"),
  toggleShoppingModeButton: document.querySelector("#toggleShoppingModeButton"),
  groceryList: document.querySelector("#groceryList"),
  addGroceryButton: document.querySelector("#addGroceryButton"),
  installButton: document.querySelector("#installButton"),
  quickAddDialog: document.querySelector("#quickAddDialog"),
  quickTaskInput: document.querySelector("#quickTaskInput"),
  quickCategory: document.querySelector("#quickCategory"),
  quickNote: document.querySelector("#quickNote"),
  quickParsePreview: document.querySelector("#quickParsePreview"),
  quickAddSubmit: document.querySelector("#quickAddSubmit"),
  taskDialog: document.querySelector("#taskDialog"),
  taskDetailCategory: document.querySelector("#taskDetailCategory"),
  taskDetailTitle: document.querySelector("#taskDetailTitle"),
  taskDetailMeta: document.querySelector("#taskDetailMeta"),
  taskDetailSteps: document.querySelector("#taskDetailSteps"),
  taskDetailLibraryNotes: document.querySelector("#taskDetailLibraryNotes"),
  taskInstanceNotes: document.querySelector("#taskInstanceNotes"),
  lowEnergyDialog: document.querySelector("#lowEnergyDialog"),
  lowEnergyContent: document.querySelector("#lowEnergyContent"),
  customWaterDialog: document.querySelector("#customWaterDialog"),
  customWaterInput: document.querySelector("#customWaterInput"),
  saveCustomWaterButton: document.querySelector("#saveCustomWaterButton"),
  groceryDialog: document.querySelector("#groceryDialog"),
  groceryNameInput: document.querySelector("#groceryNameInput"),
  groceryCategoryInput: document.querySelector("#groceryCategoryInput"),
  saveGroceryButton: document.querySelector("#saveGroceryButton"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function switchScreen(name) {
  activeScreen = name;
  Object.entries(elements.views).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
  elements.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === name);
  });
}

function createTodayTask(task) {
  return `
    <article class="task-card">
      <div class="task-row">
        <input class="daily-complete" data-task-id="${task.id}" type="checkbox" ${task.completed ? "checked" : ""} />
        <div class="task-copy">
          <strong class="task-title ${task.completed ? "completed" : ""}">${escapeHtml(task.name)}</strong>
          <div class="task-meta">
            <span>${escapeHtml(task.category)}</span>
            <span>${task.estimated_time} min</span>
            <span>${task.scheduled_time || "Unscheduled"}</span>
          </div>
          ${task.notes ? `<p class="task-note">Note: ${escapeHtml(task.notes)}</p>` : ""}
          <div class="task-inline-actions">
            <label class="inline-time-field">
              <span class="field-label">Time</span>
              <input class="schedule-time" data-task-id="${task.id}" type="time" value="${task.scheduled_time || ""}" />
            </label>
            <button class="ghost-link open-detail" data-task-id="${task.id}" type="button">Notes</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function getSchedulingConflict(taskId, scheduledTime) {
  if (!scheduledTime) return "";
  const task = getDailyTasks(state, today).find((item) => item.id === taskId);
  if (!task) return "";
  const start = timeToMinutes(scheduledTime);
  const end = start + Number(task.estimated_time || 0);
  const work = getWorkSettings(state);
  const workStart = timeToMinutes(work.start);
  const workEnd = timeToMinutes(work.end);

  if (overlaps(start, end, workStart, workEnd)) {
    return "That time overlaps your work hours.";
  }

  const others = getDailyTasks(state, today).filter((item) => item.id !== taskId && item.scheduled_time);
  for (const other of others) {
    const otherStart = timeToMinutes(other.scheduled_time);
    const otherEnd = otherStart + Number(other.estimated_time || 0);
    if (overlaps(start, end, otherStart, otherEnd)) {
      return `That time overlaps ${other.name}.`;
    }
  }

  return "";
}

function renderTimeline(tasks) {
  const work = getWorkSettings(state);
  const workStart = timeToMinutes(work.start);
  const workEnd = timeToMinutes(work.end);
  const startHour = 6;
  const endHour = 22;

  elements.workStartInput.value = work.start;
  elements.workEndInput.value = work.end;
  elements.scheduleHint.textContent = `Work is blocked from ${work.start} to ${work.end}.`;
  elements.scheduleBanner.hidden = !scheduleMessage;
  elements.scheduleBanner.textContent = scheduleMessage;

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return `<div class="timeline-hour"><span>${String(hour).padStart(2, "0")}:00</span></div>`;
  }).join("");

  const workBlock = `<div class="timeline-block work-block" style="top:${((workStart - startHour * 60) / 60) * 56}px;height:${((workEnd - workStart) / 60) * 56}px">
    <strong>Work</strong>
    <span>${work.start} - ${work.end}</span>
  </div>`;

  const taskBlocks = tasks
    .filter((task) => task.scheduled_time)
    .map((task) => {
      const start = timeToMinutes(task.scheduled_time);
      const top = ((start - startHour * 60) / 60) * 56;
      const height = Math.max((Number(task.estimated_time || 0) / 60) * 56, 34);
      return `<div class="timeline-block task-block" style="top:${top}px;height:${height}px">
        <strong>${escapeHtml(task.name)}</strong>
        <span>${task.scheduled_time}</span>
      </div>`;
    })
    .join("");

  elements.timelineView.innerHTML = `<div class="timeline-rail">${hours}${workBlock}${taskBlocks}</div>`;
}

function renderToday() {
  const tasks = getDailyTasks(state, today);
  const progress = getDailyProgress(state, today);
  elements.todayLabel.textContent = formatLongDate(today);
  elements.progressSummary.textContent = `${progress.completed} / ${progress.total} done`;
  elements.progressBar.style.width = `${progress.percent}%`;
  elements.todayHint.textContent = progress.total
    ? "Easy first, then medium, then heavy."
    : "No tasks loaded for today yet. Use Plan tonight.";

  elements.startHereList.innerHTML = tasks.slice(0, 2).length
    ? tasks.slice(0, 2).map(createTodayTask).join("")
    : '<div class="empty-state">Nothing here yet.</div>';
  elements.nextList.innerHTML = tasks.slice(2).length
    ? tasks.slice(2).map(createTodayTask).join("")
    : '<div class="empty-state">No medium or heavy tasks queued.</div>';
  renderTimeline(tasks);
}

function renderPlan() {
  const limit = getDailyLimit();
  const selectedCount = getCategories().flatMap((category) => getTaskLibrary(state)[category]).filter((task) => isTaskSelected(state, tomorrow, task.id)).length;
  const highlighted = getHighlightedTasks(state, tomorrow);
  elements.tomorrowLabel.textContent = formatLongDate(tomorrow);
  elements.selectionCount.textContent = `${selectedCount} / ${limit}`;
  elements.planGrid.innerHTML = getCategories()
    .map((category) => {
      const tasks = getTaskLibrary(state)[category];
      return `
        <article class="plan-card">
          <div class="card-head">
            <div>
              <p class="section-label">Category</p>
              <h3>${escapeHtml(shortCategory(category))}</h3>
            </div>
          </div>
          <div class="mini-checklist">
            ${tasks
              .map((task) => {
                const selected = isTaskSelected(state, tomorrow, task.id);
                const disabled = !selected && selectedCount >= limit;
                return `
                  <label class="mini-task ${highlighted.has(task.id) ? "is-highlighted" : ""} ${disabled ? "is-disabled" : ""}">
                    <input class="plan-toggle" data-task-id="${task.id}" type="checkbox" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""} />
                    <span>${escapeHtml(task.name)}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderLibrary() {
  elements.libraryBlocks.innerHTML = getCategories()
    .map((category, index) => {
      const tasks = getTaskLibrary(state)[category];
      return `
        <details class="library-block" ${index === 0 ? "open" : ""}>
          <summary>${escapeHtml(category)}</summary>
          <div class="category-body">
            ${tasks
              .map(
                (task) => `
                  <article class="library-task-card">
                    <div class="library-row">
                      <label>
                        <span class="field-label">Task</span>
                        <input class="library-name" data-category="${escapeHtml(category)}" data-task-id="${task.id}" type="text" value="${escapeHtml(task.name)}" />
                      </label>
                      <button class="secondary-button library-delete" data-category="${escapeHtml(category)}" data-task-id="${task.id}" type="button">Delete</button>
                    </div>
                    <div class="library-row">
                      <label>
                        <span class="field-label">Frequency</span>
                        <select class="library-frequency" data-category="${escapeHtml(category)}" data-task-id="${task.id}">
                          ${["daily", "weekly", "optional"].map((freq) => `<option value="${freq}" ${task.frequency === freq ? "selected" : ""}>${freq}</option>`).join("")}
                        </select>
                      </label>
                      <label>
                        <span class="field-label">Estimated Time</span>
                        <input class="library-time" data-category="${escapeHtml(category)}" data-task-id="${task.id}" type="text" value="${task.estimatedTime}" />
                      </label>
                    </div>
                    <label>
                      <span class="field-label">Steps</span>
                      <textarea class="library-steps" data-category="${escapeHtml(category)}" data-task-id="${task.id}" rows="3">${escapeHtml(task.steps.join("\n"))}</textarea>
                    </label>
                    <label>
                      <span class="field-label">Notes</span>
                      <textarea class="library-notes" data-category="${escapeHtml(category)}" data-task-id="${task.id}" rows="3">${escapeHtml(task.notes)}</textarea>
                    </label>
                  </article>
                `
              )
              .join("")}
            <button class="secondary-button library-add" data-category="${escapeHtml(category)}" type="button">+ Add Task</button>
          </div>
        </details>
      `;
    })
    .join("");
}

function renderLife() {
  const water = getWaterProgress(state, today);
  const reminderSettings = getReminderSettings(state);
  const goalMl = getWaterGoalForState(state);
  const goalLiters = goalMl / 1000;
  elements.waterProgressLabel.textContent = `${(water.total / 1000).toFixed(1)} / ${goalLiters.toFixed(goalLiters % 1 === 0 ? 0 : 1)}L`;
  elements.waterGoalInput.value = goalLiters.toString();
  elements.waterProgressBar.style.width = `${water.percent}%`;
  elements.waterHint.textContent = getWaterReminderText(state, today);
  elements.waterReminderInterval.value = String(reminderSettings.waterIntervalMinutes);
  elements.planReminderHour.value = String(reminderSettings.planningReminderHour);
  elements.notificationStatus.textContent = getNotificationStatusText();
  elements.waterHistory.innerHTML = (water.total
    ? state.water_log[today].slice().reverse().map((entry) => `<article class="task-card compact-card"><strong>${entry.time}</strong><span>${entry.amount} ml</span></article>`).join("")
    : '<div class="empty-state">No water logged yet today.</div>');

  const groceries = getGroceryList(state);
  if (isShoppingMode(state)) {
    elements.toggleShoppingModeButton.textContent = "Exit Shopping Mode";
    elements.groceryList.innerHTML = groceries.length
      ? groceries.map((item) => `
          <label class="shopping-row">
            <input class="grocery-toggle" data-item-id="${item.id}" type="checkbox" ${item.checked ? "checked" : ""} />
            <span>${escapeHtml(item.name)}</span>
          </label>
        `).join("")
      : '<div class="empty-state">No grocery items yet.</div>';
  } else {
    elements.toggleShoppingModeButton.textContent = "Start Shopping Mode";
    const groups = new Map();
    groceries.forEach((item) => {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    });
    elements.groceryList.innerHTML = groups.size
      ? [...groups.entries()].map(([category, items]) => `
          <article class="grocery-group">
            <h3>${escapeHtml(category)}</h3>
            <div class="mini-checklist">
              ${items.map((item) => `
                <label class="mini-task">
                  <input class="grocery-toggle" data-item-id="${item.id}" type="checkbox" ${item.checked ? "checked" : ""} />
                  <span>${escapeHtml(item.name)}</span>
                </label>
              `).join("")}
            </div>
          </article>
        `).join("")
      : '<div class="empty-state">No grocery items yet.</div>';
  }
}

function getNotificationStatusText() {
  if (!("Notification" in window)) {
    return "This browser does not support system notifications. In-app reminders still work.";
  }
  if (Notification.permission === "granted") {
    return "Notifications are enabled for local reminders.";
  }
  if (Notification.permission === "denied") {
    return "Notifications are blocked. You can still use in-app reminders.";
  }
  return "Notifications are available but not enabled yet.";
}

function showReminderBanner(message) {
  elements.reminderBanner.hidden = false;
  elements.reminderBanner.textContent = message;
}

function clearReminderBanner() {
  elements.reminderBanner.hidden = true;
  elements.reminderBanner.textContent = "";
}

async function sendLocalNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    await registration.showNotification(title, {
      body,
      icon: "./assets/icon-192.svg",
      badge: "./assets/icon-192.svg",
      tag: title,
    });
    return;
  }
  new Notification(title, { body });
}

function parseTimeLabelToDate(timeLabel) {
  const now = new Date();
  const [time, period] = timeLabel.split(" ");
  if (!time) return null;
  const [rawHour, rawMinute] = time.split(":").map(Number);
  let hour = rawHour;
  const minute = rawMinute || 0;
  if (period?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (period?.toLowerCase() === "am" && hour === 12) hour = 0;
  const parsed = new Date(now);
  parsed.setHours(hour, minute, 0, 0);
  return parsed;
}

function checkReminders() {
  const settings = getReminderSettings(state);
  const reminderState = getReminderState(state);
  const waterLog = state.water_log[today] || [];
  const now = new Date();
  clearReminderBanner();

  if (settings.waterIntervalMinutes > 0) {
    const lastEntry = waterLog.at(-1);
    const lastDrinkAt = lastEntry ? parseTimeLabelToDate(lastEntry.time) : null;
    const minutesSinceDrink = lastDrinkAt ? Math.floor((now - lastDrinkAt) / 60000) : null;
    const minutesSinceLastNotification = reminderState.lastWaterNotificationAt
      ? Math.floor((Date.now() - reminderState.lastWaterNotificationAt) / 60000)
      : Number.POSITIVE_INFINITY;

    if ((!lastDrinkAt || minutesSinceDrink >= settings.waterIntervalMinutes) && minutesSinceLastNotification >= 45) {
      showReminderBanner("Water reminder: it may be time for another drink.");
      sendLocalNotification("Life Planner", "Water reminder: add a glass if it has been a while.");
      updateReminderState(state, { lastWaterNotificationAt: Date.now() });
    }
  }

  if (settings.planningReminderHour > 0) {
    const tomorrowTasks = state.daily_tasks[tomorrow] || [];
    const reachedReminderTime = now.getHours() >= settings.planningReminderHour;
    if (reachedReminderTime && !tomorrowTasks.length && reminderState.lastPlanningNotificationDate !== today) {
      showReminderBanner("Planning reminder: pick tomorrow's tasks tonight.");
      sendLocalNotification("Life Planner", "Planning reminder: choose tomorrow's 5 tasks tonight.");
      updateReminderState(state, { lastPlanningNotificationDate: today });
    }
  }
}

function startReminderLoop() {
  if (reminderTimerId) window.clearInterval(reminderTimerId);
  checkReminders();
  reminderTimerId = window.setInterval(checkReminders, 60000);
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    renderLife();
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await sendLocalNotification("Life Planner", "Notifications are enabled for local reminders.");
  }
  renderLife();
}

function renderQuickAddCategoryOptions() {
  elements.quickCategory.innerHTML = getCategories()
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(shortCategory(category))}</option>`)
    .join("");
}

function renderTaskDialog(taskId) {
  const task = getDailyTasks(state, today).find((item) => item.id === taskId);
  if (!task) return;
  currentTaskId = taskId;
  elements.taskDetailCategory.textContent = task.category;
  elements.taskDetailTitle.textContent = task.name;
  elements.taskDetailMeta.innerHTML = `<span>${task.frequency}</span><span>${task.estimated_time} min</span>`;
  elements.taskDetailSteps.innerHTML = task.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  elements.taskDetailLibraryNotes.textContent = task.libraryNotes || "No notes saved.";
  elements.taskInstanceNotes.value = task.notes || "";
  elements.taskDialog.showModal();
}

function renderLowEnergyDialog() {
  const task = getLowEnergyTask(state, today);
  elements.lowEnergyContent.innerHTML = task
    ? `
        <article class="low-energy-pick">
          <strong>${escapeHtml(task.name)}</strong>
          <div class="task-meta">
            <span>${task.estimated_time} min</span>
            <span>${escapeHtml(task.category)}</span>
          </div>
          <button class="primary-button low-energy-start" data-task-id="${task.id}" type="button">Start</button>
        </article>
      `
    : '<div class="empty-state">Nothing left. Rest is allowed.</div>';
}

function renderAll() {
  switchScreen(activeScreen);
  renderToday();
  renderPlan();
  renderLibrary();
  renderLife();
  renderQuickAddCategoryOptions();
}

function shortCategory(name) {
  return name
    .replace("Home Maintenance", "Home")
    .replace("Laundry & Clothes", "Laundry")
    .replace("Cooking & Kitchen", "Cooking")
    .replace("Personal Care", "Personal")
    .replace("Errands & Admin", "Errands")
    .replace("Wedding Prep", "Wedding");
}

function parseLines(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function wireEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchScreen(button.dataset.screen);
    });
  });

  elements.todayPlanButton.addEventListener("click", () => {
    activeScreen = "plan";
    renderAll();
  });

  elements.lowEnergyButton.addEventListener("click", () => {
    renderLowEnergyDialog();
    elements.lowEnergyDialog.showModal();
  });

  document.querySelector("#todayView").addEventListener("change", (event) => {
    const checkbox = event.target.closest(".daily-complete");
    const scheduleInput = event.target.closest(".schedule-time");
    if (checkbox) {
      updateDailyTask(state, today, checkbox.dataset.taskId, { completed: checkbox.checked });
      renderToday();
      return;
    }
    if (scheduleInput) {
      const conflict = getSchedulingConflict(scheduleInput.dataset.taskId, scheduleInput.value);
      if (conflict) {
        scheduleMessage = conflict;
        renderToday();
        return;
      }
      scheduleMessage = "";
      updateDailyTask(state, today, scheduleInput.dataset.taskId, { scheduled_time: scheduleInput.value || null });
      renderToday();
    }
  });

  document.querySelector("#todayView").addEventListener("click", (event) => {
    const detail = event.target.closest(".open-detail");
    if (detail) renderTaskDialog(detail.dataset.taskId);
  });

  elements.planGrid.addEventListener("change", (event) => {
    const toggle = event.target.closest(".plan-toggle");
    if (!toggle) return;
    toggleTaskSelection(state, tomorrow, toggle.dataset.taskId);
    renderPlan();
  });

  elements.saveTomorrowButton.addEventListener("click", () => {
    savePlanToDaily(state, tomorrow);
    scheduleMessage = "";
    activeScreen = "today";
    renderAll();
  });

  elements.libraryBlocks.addEventListener("click", (event) => {
    const add = event.target.closest(".library-add");
    const del = event.target.closest(".library-delete");
    if (add) {
      addLibraryTask(state, add.dataset.category, { name: "New task", frequency: "optional", estimatedTime: 10, steps: [], notes: "" });
      renderLibrary();
    }
    if (del) {
      deleteLibraryTask(state, del.dataset.category, del.dataset.taskId);
      renderLibrary();
    }
  });

  elements.libraryBlocks.addEventListener("input", (event) => {
    const target = event.target;
    const taskId = target.dataset.taskId;
    const category = target.dataset.category;
    if (!taskId || !category) return;
    if (target.classList.contains("library-name")) updateLibraryTask(state, category, taskId, { name: target.value });
    if (target.classList.contains("library-frequency")) updateLibraryTask(state, category, taskId, { frequency: target.value });
    if (target.classList.contains("library-time")) updateLibraryTask(state, category, taskId, { estimatedTime: Number(target.value) || 10 });
    if (target.classList.contains("library-steps")) updateLibraryTask(state, category, taskId, { steps: parseLines(target.value) });
    if (target.classList.contains("library-notes")) updateLibraryTask(state, category, taskId, { notes: target.value });
  });

  elements.openQuickAddButton.addEventListener("click", () => elements.quickAddDialog.showModal());
  elements.quickTaskInput.addEventListener("input", () => {
    const parsed = parseQuickTask(elements.quickTaskInput.value);
    elements.quickParsePreview.textContent = parsed ? describeQuickTask(parsed) : "";
    if (parsed) elements.quickCategory.value = inferCategory(parsed.name);
  });
  elements.quickAddSubmit.addEventListener("click", () => {
    const parsed = parseQuickTask(elements.quickTaskInput.value);
    if (!parsed) return;
    const ok = addQuickTask(state, tomorrow, {
      name: parsed.name,
      estimatedTime: parsed.estimatedMinutes,
      category: elements.quickCategory.value,
      notes: elements.quickNote.value.trim(),
    });
    if (!ok) {
      elements.quickParsePreview.textContent = "Task cap reached for tomorrow.";
      return;
    }
    elements.quickTaskInput.value = "";
    elements.quickNote.value = "";
    elements.quickParsePreview.textContent = "";
    elements.quickAddDialog.close();
    renderPlan();
    renderLibrary();
  });

  elements.taskInstanceNotes.addEventListener("input", () => {
    if (!currentTaskId) return;
    updateDailyTask(state, today, currentTaskId, { notes: elements.taskInstanceNotes.value });
    renderToday();
  });

  elements.lowEnergyContent.addEventListener("click", (event) => {
    const start = event.target.closest(".low-energy-start");
    if (!start) return;
    elements.lowEnergyDialog.close();
    renderTaskDialog(start.dataset.taskId);
  });

  document.querySelectorAll(".water-add").forEach((button) => {
    button.addEventListener("click", () => {
      addWaterEntry(state, today, Number(button.dataset.amount));
      updateReminderState(state, { lastWaterNotificationAt: null });
      renderLife();
    });
  });
  document.querySelector("#openCustomWaterButton").addEventListener("click", () => elements.customWaterDialog.showModal());
  elements.saveCustomWaterButton.addEventListener("click", () => {
    const value = Number(elements.customWaterInput.value);
    if (!value) return;
    addWaterEntry(state, today, value);
    updateReminderState(state, { lastWaterNotificationAt: null });
    elements.customWaterInput.value = "";
    elements.customWaterDialog.close();
    renderLife();
  });

  elements.saveWaterGoalButton.addEventListener("click", () => {
    const liters = Number(elements.waterGoalInput.value);
    if (!liters) return;
    updateWaterGoal(state, Math.round(liters * 1000));
    renderLife();
  });

  elements.saveWorkHoursButton.addEventListener("click", () => {
    const start = elements.workStartInput.value;
    const end = elements.workEndInput.value;
    if (!start || !end || timeToMinutes(start) >= timeToMinutes(end)) {
      scheduleMessage = "Work hours need a valid start and end.";
      renderToday();
      return;
    }
    updateWorkSettings(state, { start, end });
    getDailyTasks(state, today).forEach((task) => {
      if (task.scheduled_time && getSchedulingConflict(task.id, task.scheduled_time)) {
        updateDailyTask(state, today, task.id, { scheduled_time: null });
      }
    });
    scheduleMessage = "";
    renderToday();
  });

  elements.enableNotificationsButton.addEventListener("click", enableNotifications);
  elements.waterReminderInterval.addEventListener("change", () => {
    updateReminderSettings(state, { waterIntervalMinutes: Number(elements.waterReminderInterval.value) });
    renderLife();
    startReminderLoop();
  });
  elements.planReminderHour.addEventListener("change", () => {
    updateReminderSettings(state, { planningReminderHour: Number(elements.planReminderHour.value) });
    renderLife();
    startReminderLoop();
  });

  elements.addGroceryButton.addEventListener("click", () => elements.groceryDialog.showModal());
  elements.saveGroceryButton.addEventListener("click", () => {
    const name = elements.groceryNameInput.value.trim();
    if (!name) return;
    addGroceryItem(state, name, elements.groceryCategoryInput.value.trim() || "General");
    elements.groceryNameInput.value = "";
    elements.groceryCategoryInput.value = "";
    elements.groceryDialog.close();
    renderLife();
  });

  elements.groceryList.addEventListener("change", (event) => {
    const toggle = event.target.closest(".grocery-toggle");
    if (!toggle) return;
    toggleGroceryItem(state, toggle.dataset.itemId);
    renderLife();
  });

  elements.toggleShoppingModeButton.addEventListener("click", () => {
    toggleShoppingMode(state);
    renderLife();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.update();
    });
  }

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (didReloadForNewWorker) return;
    didReloadForNewWorker = true;
    window.location.reload();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    elements.installButton.hidden = true;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkReminders();
    }
  });
}

renderAll();
wireEvents();
startReminderLoop();
