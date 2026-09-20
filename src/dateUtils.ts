export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateText: string, amount: number): string {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function formatDateJa(dateText: string): string {
  const date = new Date(`${dateText}T12:00:00`);
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

export interface DateRange {
  start: string;
  end: string;
}

// 直近の「終わった週」（月曜〜日曜）。週次の振り返りで使う
export function lastWeekRange(today: string): DateRange {
  const weekdayIndex = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const start = addDays(today, -weekdayIndex - 7);
  return { start, end: addDays(start, 6) };
}

export function lastNDaysRange(today: string, days: number): DateRange {
  return { start: addDays(today, -(Math.max(1, days) - 1)), end: today };
}

// エクスポートUIで使う名前。期間の意味が読み取りやすいように別名を公開する。
export const weekRange = lastWeekRange;
export const lastNDays = lastNDaysRange;

export function formatShortDate(dateText: string): string {
  const [, month, day] = dateText.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function weekdayJa(dateText: string): string {
  return ["日", "月", "火", "水", "木", "金", "土"][new Date(`${dateText}T12:00:00`).getDay()];
}

// 「09-20(日)」。表で桁を揃えたいので年は落とす
export function formatTableDate(dateText: string): string {
  return `${dateText.slice(5)}(${weekdayJa(dateText)})`;
}
