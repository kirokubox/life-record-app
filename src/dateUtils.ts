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

// 指定日を含む週（月曜〜日曜）
export function weekContaining(dateText: string): DateRange {
  const weekdayIndex = (new Date(`${dateText}T12:00:00`).getDay() + 6) % 7;
  const start = addDays(dateText, -weekdayIndex);
  return { start, end: addDays(start, 6) };
}

// 週の範囲を前後へ動かす（amount 週ぶん）
export function shiftWeek(range: DateRange, amount: number): DateRange {
  return weekContaining(addDays(range.start, amount * 7));
}

// 指定日を含む暦月（1日〜末日）
export function monthContaining(dateText: string): DateRange {
  const [y, m] = dateText.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

// 暦月を前後へ動かす（amount ヶ月ぶん）
export function shiftMonth(range: DateRange, amount: number): DateRange {
  const [y, m] = range.start.split("-").map(Number);
  const date = new Date(y, m - 1 + amount, 1, 12);
  return monthContaining(toDateKey(date));
}

// 直近の「終わった月」（先月）
export function lastMonthRange(today: string): DateRange {
  return shiftMonth(monthContaining(today), -1);
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
