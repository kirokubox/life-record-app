import { parseTimeMinutes } from "./calculations.js";
import type { LifeRecord } from "./types.js";

type DiaryEntryLike = {
  date?: unknown;
  wakeUpTime?: unknown;
  bedTime?: unknown;
  sleepHours?: unknown;
  napHours?: unknown;
  napMinutes?: unknown;
  everydayExpense?: unknown;
  satisfactionExpense?: unknown;
  regretExpense?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type DiaryMigrationPreview = {
  sourceEntries: number;
  relevantEntries: number;
  newRecords: number;
  mergedRecords: number;
  unchangedRecords: number;
  invalidEntries: number;
  conflictDays: number;
  importedFields: {
    wakeTime: number;
    bedTime: number;
    napMinutes: number;
    legacySleepHours: number;
    expenses: number;
  };
  recordsToSave: LifeRecord[];
  warnings: string[];
};

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function time(value: unknown): string | null {
  return parseTimeMinutes(value) === null ? null : value as string;
}

function nonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function integerMoney(value: unknown): number | null {
  const number = nonNegative(value);
  return number === null ? null : Math.round(number);
}

function napMinutes(entry: DiaryEntryLike): number | null {
  const minutes = nonNegative(entry.napMinutes);
  if (minutes !== null) return Math.round(minutes);
  const hours = nonNegative(entry.napHours);
  return hours === null ? null : Math.round(hours * 60);
}

function emptyRecord(date: string, now: string, entry: DiaryEntryLike): LifeRecord {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : now;
  const updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : now;
  return {
    id: date,
    date,
    wakeTime: "",
    bedTime: "",
    napMinutes: null,
    legacySleepHours: null,
    meals: [],
    bathTime: "",
    lastSmokingTime: "",
    mealPhotos: [],
    variableExpenseTotal: null,
    everydayExpense: null,
    regretExpense: null,
    createdAt,
    updatedAt,
  };
}

function sameMoney(current: LifeRecord, total: number, everyday: number | null, regret: number | null) {
  return current.variableExpenseTotal === total
    && current.everydayExpense === everyday
    && current.regretExpense === regret;
}

export function buildDiaryMigration(
  value: unknown,
  existingRecords: LifeRecord[],
  now = new Date().toISOString(),
): DiaryMigrationPreview {
  const data = value as { appName?: unknown; entries?: unknown };
  if (!data || typeof data !== "object" || data.appName !== "Yuki Diary App" || !Array.isArray(data.entries)) {
    throw new Error("季節日記のバックアップJSONではありません");
  }

  const preview: DiaryMigrationPreview = {
    sourceEntries: data.entries.length,
    relevantEntries: 0,
    newRecords: 0,
    mergedRecords: 0,
    unchangedRecords: 0,
    invalidEntries: 0,
    conflictDays: 0,
    importedFields: { wakeTime: 0, bedTime: 0, napMinutes: 0, legacySleepHours: 0, expenses: 0 },
    recordsToSave: [],
    warnings: [],
  };
  const existing = new Map(existingRecords.map((record) => [record.date, record]));
  const seenDates = new Set<string>();
  const conflicts = new Set<string>();

  for (const raw of data.entries) {
    if (!raw || typeof raw !== "object") { preview.invalidEntries += 1; continue; }
    const entry = raw as DiaryEntryLike;
    if (!validDate(entry.date) || seenDates.has(entry.date)) { preview.invalidEntries += 1; continue; }
    seenDates.add(entry.date);

    const wake = time(entry.wakeUpTime);
    const bed = time(entry.bedTime);
    const nap = napMinutes(entry);
    const legacy = nonNegative(entry.sleepHours);
    const everyday = integerMoney(entry.everydayExpense);
    const satisfaction = integerMoney(entry.satisfactionExpense);
    const regret = integerMoney(entry.regretExpense);
    const hasExpenses = everyday !== null || satisfaction !== null || regret !== null;
    if (wake === null && bed === null && nap === null && legacy === null && !hasExpenses) continue;
    preview.relevantEntries += 1;

    const original = existing.get(entry.date);
    const next = original ? { ...original } : emptyRecord(entry.date, now, entry);
    let changed = false;

    const mergeText = (key: "wakeTime" | "bedTime", incoming: string | null) => {
      if (incoming === null) return;
      if (!next[key]) { next[key] = incoming; preview.importedFields[key] += 1; changed = true; }
      else if (next[key] !== incoming) conflicts.add(entry.date as string);
    };
    const mergeNumber = (key: "napMinutes" | "legacySleepHours", incoming: number | null) => {
      if (incoming === null) return;
      if (next[key] === null || next[key] === undefined) { next[key] = incoming; preview.importedFields[key] += 1; changed = true; }
      else if (next[key] !== incoming) conflicts.add(entry.date as string);
    };
    mergeText("wakeTime", wake);
    mergeText("bedTime", bed);
    mergeNumber("napMinutes", nap);
    mergeNumber("legacySleepHours", legacy);

    if (hasExpenses) {
      const total = (everyday ?? 0) + (satisfaction ?? 0) + (regret ?? 0);
      const targetEmpty = next.variableExpenseTotal === null && next.everydayExpense === null && next.regretExpense === null;
      if (targetEmpty) {
        next.variableExpenseTotal = total;
        next.everydayExpense = everyday;
        next.regretExpense = regret;
        preview.importedFields.expenses += 1;
        changed = true;
      } else if (!sameMoney(next, total, everyday, regret)) {
        conflicts.add(entry.date);
      }
    }

    if (changed) {
      next.updatedAt = now;
      preview.recordsToSave.push(next);
      if (original) preview.mergedRecords += 1;
      else preview.newRecords += 1;
    } else {
      preview.unchangedRecords += 1;
    }
  }

  preview.conflictDays = conflicts.size;
  if (preview.invalidEntries) preview.warnings.push(`日付不正または重複の${preview.invalidEntries}件は移行しません。`);
  if (preview.conflictDays) preview.warnings.push(`既存値と異なる${preview.conflictDays}日分は上書きせず、生活記録側を残します。`);
  preview.warnings.push("日記本文・写真・気分・タグ・らくがきは移行対象外です。");
  return preview;
}

export async function readDiaryMigrationFile(file: File, existingRecords: LifeRecord[]) {
  return buildDiaryMigration(JSON.parse(await file.text()) as unknown, existingRecords);
}
