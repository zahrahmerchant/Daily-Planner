import { addDays, todayKey, weekRange } from "./date.js";

const STORAGE_KEY = "life-planner-state-v2";
const DAILY_LIMIT = 5;
const DEFAULT_WATER_GOAL_ML = 3000;

const CATEGORY_NAMES = [
  "Home Maintenance",
  "Laundry & Clothes",
  "Cooking & Kitchen",
  "Personal Care",
  "Errands & Admin",
  "Wedding Prep",
];

function uid() {
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function makeTask(category, name, frequency, estimatedTime, suggestedDays = [], steps = [], notes = "") {
  return {
    id: uid(),
    name,
    category,
    frequency,
    suggestedDays,
    estimatedTime,
    steps,
    notes,
  };
}

function defaultCategories() {
  return {
    "Home Maintenance": [
      makeTask("Home Maintenance", "Tidy room", "daily", 10, ["Mon", "Tue", "Wed", "Thu", "Fri"]),
      makeTask("Home Maintenance", "Clean bathroom", "weekly", 25, ["Sat"]),
      makeTask("Home Maintenance", "Change bedsheets", "weekly", 20, ["Sun"]),
    ],
    "Laundry & Clothes": [
      makeTask("Laundry & Clothes", "Wash clothes", "weekly", 30, ["Tue", "Thu", "Sat"], ["Collect", "Load", "Wash"]),
      makeTask("Laundry & Clothes", "Fold clothes", "daily", 8),
      makeTask("Laundry & Clothes", "Put clothes away", "optional", 10),
    ],
    "Cooking & Kitchen": [
      makeTask("Cooking & Kitchen", "Plan meals", "weekly", 15, ["Sun"]),
      makeTask("Cooking & Kitchen", "Prep ingredients", "optional", 20),
      makeTask("Cooking & Kitchen", "Wipe counters", "daily", 8),
    ],
    "Personal Care": [
      makeTask("Personal Care", "Skincare routine", "daily", 10),
      makeTask("Personal Care", "Lay out outfit", "optional", 8),
      makeTask("Personal Care", "Trim nails", "weekly", 15, ["Sun"]),
    ],
    "Errands & Admin": [
      makeTask("Errands & Admin", "Reply to messages", "daily", 10),
      makeTask("Errands & Admin", "Pay bills", "weekly", 20, ["Mon"]),
      makeTask("Errands & Admin", "Restock essentials", "optional", 20),
    ],
    "Wedding Prep": [
      makeTask("Wedding Prep", "Confirm vendor detail", "weekly", 20, ["Wed"]),
      makeTask("Wedding Prep", "Review guest list", "optional", 20),
      makeTask("Wedding Prep", "Save one idea", "optional", 10),
    ],
  };
}

function createDefaultState() {
  return {
    version: 2,
    categories: defaultCategories(),
    daily_tasks: {},
    planning: {},
    water_log: {},
    water_goal_ml: DEFAULT_WATER_GOAL_ML,
    work_settings: {
      start: "09:00",
      end: "17:00",
    },
    reminder_settings: {
      waterIntervalMinutes: 60,
      planningReminderHour: 20,
    },
    reminder_state: {
      lastWaterNotificationAt: null,
      lastPlanningNotificationDate: null,
    },
    grocery_list: [
      { id: uid(), name: "Milk", checked: false, category: "Dairy" },
      { id: uid(), name: "Tomatoes", checked: false, category: "Vegetables" },
    ],
    shopping_mode: false,
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === "object" ? raw : createDefaultState();
  state.categories ||= defaultCategories();
  state.daily_tasks ||= {};
  state.planning ||= {};
  state.water_log ||= {};
  state.water_goal_ml ||= DEFAULT_WATER_GOAL_ML;
  state.work_settings ||= {
    start: "09:00",
    end: "17:00",
  };
  state.reminder_settings ||= {
    waterIntervalMinutes: 60,
    planningReminderHour: 20,
  };
  state.reminder_state ||= {
    lastWaterNotificationAt: null,
    lastPlanningNotificationDate: null,
  };
  state.grocery_list ||= [];
  state.shopping_mode ||= false;
  for (const category of CATEGORY_NAMES) {
    state.categories[category] ||= [];
  }
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getCategories() {
  return [...CATEGORY_NAMES];
}

export function getDailyLimit() {
  return DAILY_LIMIT;
}

export function getWaterGoalMl(state) {
  return state?.water_goal_ml || DEFAULT_WATER_GOAL_ML;
}

export function getTaskLibrary(state) {
  return state.categories;
}

export function getTomorrowKey(dateKey = todayKey()) {
  return addDays(dateKey, 1);
}

function createDailyInstance(task) {
  return {
    id: uid(),
    taskId: task.id,
    name: task.name,
    category: task.category,
    completed: false,
    notes: "",
    steps: [...task.steps],
    libraryNotes: task.notes,
    frequency: task.frequency,
    estimated_time: task.estimatedTime,
    scheduled_time: null,
  };
}

export function ensurePlan(state, dateKey) {
  state.planning[dateKey] ||= [];
  return state.planning[dateKey];
}

export function ensureDailyTasks(state, dateKey) {
  state.daily_tasks[dateKey] ||= [];
  return state.daily_tasks[dateKey];
}

export function getPlanSelection(state, dateKey) {
  return ensurePlan(state, dateKey);
}

export function isTaskSelected(state, dateKey, taskId) {
  return ensurePlan(state, dateKey).includes(taskId);
}

export function toggleTaskSelection(state, dateKey, taskId) {
  const selection = ensurePlan(state, dateKey);
  const selected = new Set(selection);
  if (selected.has(taskId)) {
    selected.delete(taskId);
  } else if (selected.size < DAILY_LIMIT) {
    selected.add(taskId);
  }
  state.planning[dateKey] = [...selected];
  saveState(state);
}

function findTaskById(state, taskId) {
  return getCategories()
    .flatMap((category) => state.categories[category])
    .find((task) => task.id === taskId);
}

export function savePlanToDaily(state, dateKey) {
  const selected = ensurePlan(state, dateKey);
  state.daily_tasks[dateKey] = selected
    .map((taskId) => findTaskById(state, taskId))
    .filter(Boolean)
    .map(createDailyInstance);
  saveState(state);
}

function effortRank(task) {
  const minutes = Number(task.estimated_time);
  if (minutes <= 10) return 0;
  if (minutes <= 20) return 1;
  return 2;
}

export function getDailyTasks(state, dateKey) {
  return [...ensureDailyTasks(state, dateKey)].sort((a, b) => {
    const diff = effortRank(a) - effortRank(b);
    if (diff) return diff;
    return a.estimated_time - b.estimated_time || a.name.localeCompare(b.name);
  });
}

export function updateDailyTask(state, dateKey, taskId, patch) {
  const task = ensureDailyTasks(state, dateKey).find((item) => item.id === taskId);
  if (!task) return;
  Object.assign(task, patch);
  saveState(state);
}

export function getWorkSettings(state) {
  return state.work_settings;
}

export function updateWorkSettings(state, patch) {
  Object.assign(state.work_settings, patch);
  saveState(state);
}

export function getDailyProgress(state, dateKey) {
  const tasks = ensureDailyTasks(state, dateKey);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function getLowEnergyTask(state, dateKey) {
  return getDailyTasks(state, dateKey).find((task) => !task.completed) || null;
}

export function addLibraryTask(state, category, task) {
  state.categories[category].push(
    makeTask(
      category,
      task.name || "New task",
      task.frequency || "optional",
      Number(task.estimatedTime) || 10,
      task.suggestedDays || [],
      task.steps || [],
      task.notes || ""
    )
  );
  saveState(state);
}

export function updateLibraryTask(state, category, taskId, patch) {
  const task = state.categories[category].find((item) => item.id === taskId);
  if (!task) return;
  Object.assign(task, patch);
  saveState(state);
}

export function deleteLibraryTask(state, category, taskId) {
  state.categories[category] = state.categories[category].filter((task) => task.id !== taskId);
  saveState(state);
}

export function addQuickTask(state, dateKey, taskInput) {
  const selection = ensurePlan(state, dateKey);
  if (selection.length >= DAILY_LIMIT) return false;
  const task = makeTask(taskInput.category, taskInput.name, "optional", taskInput.estimatedTime || 10, [], [], taskInput.notes || "");
  state.categories[taskInput.category].push(task);
  selection.push(task.id);
  saveState(state);
  return true;
}

export function getHighlightedTasks(state, dateKey) {
  const weekday = new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  return new Set(
    getCategories()
      .flatMap((category) => state.categories[category])
      .filter((task) => task.suggestedDays.includes(weekday) || task.name === "Wash clothes" || task.name === "Change bedsheets" || task.name === "Clean bathroom")
      .map((task) => task.id)
  );
}

export function getWaterLog(state, dateKey) {
  state.water_log[dateKey] ||= [];
  return state.water_log[dateKey];
}

export function addWaterEntry(state, dateKey, amount) {
  getWaterLog(state, dateKey).push({
    id: uid(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    amount: Number(amount),
  });
  saveState(state);
}

export function getWaterProgress(state, dateKey) {
  const total = getWaterLog(state, dateKey).reduce((sum, entry) => sum + entry.amount, 0);
  const lastEntry = getWaterLog(state, dateKey).at(-1) || null;
  const goal = state.water_goal_ml || DEFAULT_WATER_GOAL_ML;
  return {
    total,
    lastEntry,
    percent: Math.min(100, Math.round((total / goal) * 100)),
  };
}

export function getWaterGoalForState(state) {
  return getWaterGoalMl(state);
}

export function updateWaterGoal(state, goalMl) {
  state.water_goal_ml = Math.max(250, Number(goalMl) || DEFAULT_WATER_GOAL_ML);
  saveState(state);
}

export function getWaterReminderText(state, dateKey) {
  const log = getWaterLog(state, dateKey);
  if (!log.length) return "No water logged yet today.";
  const lastEntry = log.at(-1);
  return `Last drink at ${lastEntry.time}. Add more if it has been a while.`;
}

export function getReminderSettings(state) {
  return state.reminder_settings;
}

export function updateReminderSettings(state, patch) {
  Object.assign(state.reminder_settings, patch);
  saveState(state);
}

export function getReminderState(state) {
  return state.reminder_state;
}

export function updateReminderState(state, patch) {
  Object.assign(state.reminder_state, patch);
  saveState(state);
}

export function getGroceryList(state) {
  return state.grocery_list;
}

export function addGroceryItem(state, name, category) {
  state.grocery_list.push({
    id: uid(),
    name,
    category: category || "General",
    checked: false,
  });
  saveState(state);
}

export function toggleGroceryItem(state, itemId) {
  const item = state.grocery_list.find((entry) => entry.id === itemId);
  if (!item) return;
  item.checked = !item.checked;
  saveState(state);
}

export function toggleShoppingMode(state) {
  state.shopping_mode = !state.shopping_mode;
  saveState(state);
}

export function isShoppingMode(state) {
  return Boolean(state.shopping_mode);
}

export function getWeeklySuggestions(state, anchorDate) {
  const dates = weekRange(anchorDate);
  const taskNames = dates.flatMap((dateKey) => ensureDailyTasks(state, dateKey).map((task) => task.name));
  const suggestions = [];
  const laundryCount = taskNames.filter((name) => name === "Wash clothes").length;
  const bedsheetCount = taskNames.filter((name) => name === "Change bedsheets").length;
  const deepCleanCount = taskNames.filter((name) => name === "Clean bathroom").length;
  if (laundryCount < 2) suggestions.push("Laundry needs 2 or 3 slots this week.");
  if (bedsheetCount < 1) suggestions.push("Bedsheet change is still missing this week.");
  if (deepCleanCount < 1) suggestions.push("One deep clean task would help this week.");
  return suggestions;
}
