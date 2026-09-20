import { parseTimeMinutes, satisfactionExpense, sleepMetrics } from "./calculations.js";
import { addDays, formatShortDate } from "./dateUtils.js";
import type { LifeRecord } from "./types.js";

export const SLEEP_CHART_DAYS = 14;

export interface SleepChartPoint {
  date: string;
  label: string;
  sleepHours: number | null;
  napHours: number;
  totalHours: number | null;
  wakeTime: number | null;
  bedTime: string | null;
}

export interface ExpenseChartPoint {
  date: string;
  everyday: number;
  satisfaction: number;
  regret: number;
  total: number | null;
}

// 記録のある日だけを新しい順に14日ぶん。未記録日で間を空けない（季節日記と同じ見せ方）
export function buildSleepChartPoints(records: LifeRecord[], boundary: string, days = SLEEP_CHART_DAYS): SleepChartPoint[] {
  const byDate = new Map(records.map((record) => [record.date, record]));
  return [...records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map((record) => {
      const previous = byDate.get(addDays(record.date, -1));
      const metrics = sleepMetrics(record, previous, boundary);
      const wake = parseTimeMinutes(record.wakeTime);
      return {
        date: record.date,
        label: formatShortDate(record.date),
        sleepHours: metrics.nightMinutes === null ? null : metrics.nightMinutes / 60,
        napHours: (metrics.napMinutes ?? 0) / 60,
        totalHours: metrics.totalMinutes === null ? null : metrics.totalMinutes / 60,
        wakeTime: wake === null ? null : wake / 60,
        bedTime: previous?.bedTime || null,
      };
    });
}

// こちらは日付で埋める。使わなかった日が空き枠として見えることに意味があるため
export function buildExpenseSeries(records: LifeRecord[], period: { start: string; end: string }, today: string): ExpenseChartPoint[] {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const last = today < period.end ? today : period.end;
  const points: ExpenseChartPoint[] = [];
  for (let date = period.start; date <= last; date = addDays(date, 1)) {
    const record = byDate.get(date);
    const total = record?.variableExpenseTotal ?? null;
    const entered = record !== undefined && total !== null;
    points.push({
      date,
      everyday: entered ? record.everydayExpense ?? 0 : 0,
      satisfaction: entered ? Math.max(0, satisfactionExpense(record) ?? 0) : 0,
      regret: entered ? record.regretExpense ?? 0 : 0,
      total,
    });
  }
  return points;
}

export function formatClock(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatWakeTick(hours: number): string {
  return formatClock(hours * 60);
}

export function formatChartTime(hours: number | null): string {
  return hours === null ? "-" : formatWakeTick(hours);
}

export function formatMoneyCompact(value: number | null): string {
  return value === null ? "-" : `${value.toLocaleString("ja-JP")}円`;
}
