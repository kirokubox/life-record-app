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
