import { addDays } from "./dateUtils.js";
import type { AppSettings, LifeRecord } from "./types.js";

const TIME_PATTERN = /^(\d{2}):([0-5]\d)$/;

export function parseTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(TIME_PATTERN);
  if (!match || Number(match[1]) > 23) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateAt(dateText: string, minutes: number): Date {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMinutes(minutes);
  return date;
}

export function resolveBedDateTime(record: LifeRecord, boundary: string): Date | null {
  const bed = parseTimeMinutes(record.bedTime);
  if (bed === null) return null;
  const wake = parseTimeMinutes(record.wakeTime);
  const boundaryMinutes = parseTimeMinutes(boundary) ?? 300;
  const nextDay = wake !== null ? bed <= wake : bed < boundaryMinutes;
  return dateAt(nextDay ? addDays(record.date, 1) : record.date, bed);
}

export function sleepMetrics(record: LifeRecord, previous: LifeRecord | undefined, boundary: string) {
  const wake = parseTimeMinutes(record.wakeTime);
  const previousBed = previous ? resolveBedDateTime(previous, boundary) : null;
  let nightMinutes: number | null = null;
  let source: "times" | "legacy" | "none" = "none";
  if (wake !== null && previousBed) {
    const measured = Math.round((dateAt(record.date, wake).getTime() - previousBed.getTime()) / 60000);
    if (measured > 0 && measured < 1440) {
      nightMinutes = measured;
      source = "times";
    }
  }
  if (nightMinutes === null && typeof record.legacySleepHours === "number" && record.legacySleepHours > 0) {
    nightMinutes = Math.round(record.legacySleepHours * 60);
    source = "legacy";
  }
  const napMinutes = record.napMinutes;
  return { nightMinutes, napMinutes, totalMinutes: nightMinutes === null ? null : nightMinutes + (napMinutes ?? 0), source };
}

export function durationUntilBed(record: LifeRecord, time: string): number | null {
  const event = parseTimeMinutes(time);
  const bed = parseTimeMinutes(record.bedTime);
  if (event === null || bed === null) return null;
  let diff = bed - event;
  if (diff < 0) diff += 1440;
  return diff < 18 * 60 ? diff : null;
}

export function lastMealTime(record: LifeRecord): string {
  const timed = record.meals.filter((meal) => parseTimeMinutes(meal.time) !== null);
  if (parseTimeMinutes(record.bedTime) !== null) {
    const nearest = timed
      .map((meal) => ({ meal, duration: durationUntilBed(record, meal.time) }))
      .filter((item): item is { meal: typeof item.meal; duration: number } => item.duration !== null)
      .sort((a, b) => a.duration - b.duration)[0];
    if (nearest) return nearest.meal.time;
  }
  return timed.reduce((latest, meal) => {
    const value = parseTimeMinutes(meal.time);
    if (value === null) return latest;
    const current = parseTimeMinutes(latest);
    return current === null || value > current ? meal.time : latest;
  }, "");
}

export function satisfactionExpense(record: LifeRecord): number | null {
  if (record.variableExpenseTotal === null) return null;
  return record.variableExpenseTotal - (record.everydayExpense ?? 0) - (record.regretExpense ?? 0);
}

export function expenseError(record: LifeRecord): string {
  const satisfaction = satisfactionExpense(record);
  return satisfaction !== null && satisfaction < 0 ? "日常費と反省費の合計が変動費全額を超えています" : "";
}

export function expensePeriod(today: string, startDay: number) {
  const [year, month] = today.split("-").map(Number);
  const safeDay = Math.max(1, Math.min(31, Math.round(startDay)));
  const makeStart = (y: number, monthIndex: number) => {
    const max = new Date(y, monthIndex + 1, 0).getDate();
    const date = new Date(y, monthIndex, Math.min(safeDay, max));
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
  };
  const thisStart = makeStart(year, month - 1);
  const start = today >= thisStart ? thisStart : makeStart(year, month - 2);
  const [sy, sm] = start.split("-").map(Number);
  return { start, end: addDays(makeStart(sy, sm), -1) };
}

export function periodExpense(records: LifeRecord[], period: { start: string; end: string }): number {
  return records.filter((r) => r.date >= period.start && r.date <= period.end).reduce((sum, r) => sum + (r.variableExpenseTotal ?? 0), 0);
}

export function sevenDaySleepAverage(records: LifeRecord[], boundary: string): number | null {
  const map = new Map(records.map((record) => [record.date, record]));
  const values = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
    .map((record) => sleepMetrics(record, map.get(addDays(record.date, -1)), boundary).totalMinutes)
    .filter((value): value is number => value !== null);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "未計算";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}時間${String(m).padStart(2, "0")}分` : `${m}分`;
}

export function recordExpenseSummary(record: LifeRecord) {
  return {
    total: record.variableExpenseTotal,
    everyday: record.everydayExpense,
    satisfaction: satisfactionExpense(record),
    regret: record.regretExpense,
  };
}

export function defaultSettings(): AppSettings {
  return { dayBoundaryTime: "05:00", variableExpenseBudget: 110000, variableExpenseStartDay: 25, version: "1.0.0" };
}
