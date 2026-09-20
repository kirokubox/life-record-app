import { durationUntilBed, expensePeriod, formatDuration, lastMealTime, parseTimeMinutes, periodExpense, satisfactionExpense, sleepMetrics } from "./calculations.js";
import { formatClock } from "./chartData.js";
import { addDays, formatTableDate } from "./dateUtils.js";
import { MEAL_LABEL, sortedMeals } from "./meals.js";
import type { AppSettings, LifeRecord } from "./types.js";

export interface ExportRange {
  start: string;
  end: string;
}

export interface RangePhotoRef {
  id: string;
  date: string;
  mimeType: string;
  path: string;
  label: string;
}

export interface MarkdownOptions {
  includePhotoPaths: boolean;
  exportedAt?: string;
}

export function photoExtension(mime: string): string {
  return mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
}

export function rangeDayCount(range: ExportRange): number {
  if (range.start > range.end) return 0;
  let count = 0;
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) count += 1;
  return count;
}

export function recordsInRange(records: LifeRecord[], range: ExportRange): LifeRecord[] {
  return records.filter((record) => record.date >= range.start && record.date <= range.end).sort((a, b) => a.date.localeCompare(b.date));
}

// Markdownの写真パスとZIPの中身は必ずここから作る。別々に採番するとパスがずれて読めなくなる
export function collectRangePhotos(records: LifeRecord[], range: ExportRange): RangePhotoRef[] {
  const refs: RangePhotoRef[] = [];
  for (const record of recordsInRange(records, range)) {
    let index = 0;
    const push = (id: string, mimeType: string, label: string) => {
      index += 1;
      refs.push({
        id,
        date: record.date,
        mimeType,
        path: `photos/${record.date}/${String(index).padStart(3, "0")}_${id}.${photoExtension(mimeType)}`,
        label,
      });
    };
    for (const meal of sortedMeals(record.meals)) {
      if (!meal.photoId) continue;
      const meta = record.mealPhotos.find((photo) => photo.id === meal.photoId);
      if (!meta) continue;
      push(meta.id, meta.mimeType, [MEAL_LABEL[meal.type], meal.time, meal.note].filter(Boolean).join(" "));
    }
    if (record.facePhoto) push(record.facePhoto.id, record.facePhoto.mimeType, "顔写真");
  }
  return refs;
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

// 就寝は日をまたぐので、正午より前は翌日側とみなしてから平均する
function bedMinutesForAverage(value: string): number | null {
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return null;
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function money(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("ja-JP");
}

function duration(value: number | null): string {
  return value === null ? "-" : formatDuration(value);
}

function clock(value: number | null): string {
  return value === null ? "-" : formatClock(value);
}

function row(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

export function buildRangeMarkdown(records: LifeRecord[], settings: AppSettings, range: ExportRange, options: MarkdownOptions): string {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const days = recordsInRange(records, range).map((record) => ({
    record,
    sleep: sleepMetrics(record, byDate.get(addDays(record.date, -1)), settings.dayBoundaryTime),
    satisfaction: satisfactionExpense(record),
  }));
  const photoPaths = new Map(collectRangePhotos(records, range).map((ref) => [ref.id, ref.path]));

  const totalDays = rangeDayCount(range);
  const totalSleep = average(days.map((day) => day.sleep.totalMinutes).filter((value): value is number => value !== null));
  const nightSleep = average(days.map((day) => day.sleep.nightMinutes).filter((value): value is number => value !== null));
  const nap = average(days.map((day) => day.record.napMinutes).filter((value): value is number => value !== null));
  const wake = average(days.map((day) => parseTimeMinutes(day.record.wakeTime)).filter((value): value is number => value !== null));
  const bed = average(days.map((day) => bedMinutesForAverage(day.record.bedTime)).filter((value): value is number => value !== null));

  const spentDays = days.filter((day) => day.record.variableExpenseTotal !== null);
  const spent = spentDays.reduce((sum, day) => sum + (day.record.variableExpenseTotal ?? 0), 0);
  const everyday = spentDays.reduce((sum, day) => sum + (day.record.everydayExpense ?? 0), 0);
  const satisfaction = spentDays.reduce((sum, day) => sum + (day.satisfaction ?? 0), 0);
  const regret = spentDays.reduce((sum, day) => sum + (day.record.regretExpense ?? 0), 0);

  const mealCount = days.reduce((sum, day) => sum + day.record.meals.length, 0);
  const mealPhotoCount = days.reduce((sum, day) => sum + day.record.meals.filter((meal) => meal.photoId).length, 0);

  const period = expensePeriod(range.end, settings.variableExpenseStartDay);
  const periodSpent = periodExpense(records, period);
  const periodRemaining = settings.variableExpenseBudget - periodSpent;

  const lines: string[] = [];
  lines.push(`# 生活記録エクスポート（${range.start}〜${range.end}）`);
  lines.push("");
  if (options.exportedAt) lines.push(`書き出し日時：${options.exportedAt}`);
  lines.push(options.includePhotoPaths ? "写真はこのZIPの photos/ にあります。" : "この書き出しに画像本体は含まれません。");
  lines.push("");

  lines.push("## 期間サマリ");
  lines.push("");
  lines.push(`- 記録のある日：${days.length}日 / ${totalDays}日`);
  lines.push(`- 睡眠（仮眠込み）の平均：${duration(totalSleep)}`);
  lines.push(`- 夜間睡眠の平均：${duration(nightSleep)}　仮眠の平均：${duration(nap)}`);
  lines.push(`- 起床の平均：${clock(wake)}　就寝の平均：${clock(bed)}`);
  lines.push(`- 変動費の合計：${money(spent)}円（日常 ${money(everyday)}円・満足 ${money(satisfaction)}円・反省 ${money(regret)}円）`);
  lines.push(`- 入力のあった日の1日平均：${money(spentDays.length ? Math.round(spent / spentDays.length) : null)}円（${spentDays.length}日ぶん）`);
  lines.push(`- 食事の記録：${mealCount}件（写真あり ${mealPhotoCount}件）`);
  lines.push(
    `- 今期（${period.start}〜${period.end}）：使用 ${money(periodSpent)}円 / 予算 ${money(settings.variableExpenseBudget)}円 → ${periodRemaining >= 0 ? `残り ${money(periodRemaining)}円` : `超過 ${money(Math.abs(periodRemaining))}円`}`,
  );
  lines.push("");

  lines.push("## 日別");
  lines.push("");
  lines.push(row(["日付", "起床", "就寝", "夜間睡眠", "仮眠", "睡眠合計", "変動費", "日常", "満足", "反省", "食事"]));
  lines.push(row(["---", "---", "---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"]));
  for (const day of days) {
    lines.push(row([
      formatTableDate(day.record.date),
      day.record.wakeTime || "-",
      day.record.bedTime || "-",
      duration(day.sleep.nightMinutes),
      duration(day.record.napMinutes),
      duration(day.sleep.totalMinutes),
      money(day.record.variableExpenseTotal),
      money(day.record.everydayExpense),
      money(day.satisfaction),
      money(day.record.regretExpense),
      `${day.record.meals.length}`,
    ]));
  }
  if (days.length === 0) lines.push(row(["（記録なし）", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  lines.push("");

  lines.push("## 睡眠まわり");
  lines.push("");
  lines.push(row(["日付", "最終食事→就寝", "入浴→就寝", "最終喫煙→就寝"]));
  lines.push(row(["---", "---:", "---:", "---:"]));
  for (const day of days) {
    lines.push(row([
      formatTableDate(day.record.date),
      duration(durationUntilBed(day.record, lastMealTime(day.record))),
      duration(durationUntilBed(day.record, day.record.bathTime)),
      duration(durationUntilBed(day.record, day.record.lastSmokingTime)),
    ]));
  }
  lines.push("");

  lines.push("## 食事の明細");
  lines.push("");
  for (const day of days) {
    if (day.record.meals.length === 0) continue;
    lines.push(`### ${formatTableDate(day.record.date)}`);
    lines.push("");
    for (const meal of sortedMeals(day.record.meals)) {
      const photoPath = meal.photoId ? photoPaths.get(meal.photoId) : undefined;
      const photo = !photoPath ? "" : options.includePhotoPaths ? `（${photoPath}）` : "（写真あり）";
      lines.push(`- ${[MEAL_LABEL[meal.type], meal.time, meal.note || "（メモなし）"].filter(Boolean).join(" ")}${photo}`);
    }
    lines.push("");
  }
  if (days.every((day) => day.record.meals.length === 0)) {
    lines.push("この期間に食事の記録はありません。");
    lines.push("");
  }

  return lines.join("\n");
}
