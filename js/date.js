const DAY_MS = 24 * 60 * 60 * 1000;

export function todayKey() {
  return toDateKey(new Date());
}

export function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function fromDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

export function addDays(dateKey, days) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function formatLongDate(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function weekRange(dateKey) {
  const base = fromDateKey(dateKey);
  const dayIndex = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - dayIndex);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base.getTime() + index * DAY_MS);
    return toDateKey(date);
  });
}

export function shortWeekday(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short" });
}

export function compareTime(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function timeToMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
