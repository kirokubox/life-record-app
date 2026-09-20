import assert from "node:assert/strict";
import test from "node:test";
import { buildDiaryMigration } from "../src/diaryMigration.js";
import type { LifeRecord } from "../src/types.js";

const NOW = "2026-09-20T12:00:00.000Z";

function existing(date: string, patch: Partial<LifeRecord> = {}): LifeRecord {
  return {
    id: date, date, wakeTime: "", bedTime: "", napMinutes: null, legacySleepHours: null,
    meals: [], bathTime: "", lastSmokingTime: "", mealPhotos: [], variableExpenseTotal: null,
    everydayExpense: null, regretExpense: null, createdAt: NOW, updatedAt: NOW, ...patch,
  };
}

test("季節日記の睡眠と家計3分類を生活記録へ変換する", () => {
  const result = buildDiaryMigration({
    appName: "Yuki Diary App",
    entries: [{
      date: "2026-09-18", wakeUpTime: "07:10", bedTime: "01:20", sleepHours: 6.5,
      napHours: 0.5, napMinutes: 42, everydayExpense: 1200, satisfactionExpense: 800, regretExpense: 300,
      body: "移行しない本文", photos: [{ id: "photo" }],
    }],
  }, [], NOW);
  assert.equal(result.newRecords, 1);
  assert.deepEqual(result.importedFields, { wakeTime: 1, bedTime: 1, napMinutes: 1, legacySleepHours: 1, expenses: 1 });
  assert.deepEqual(result.recordsToSave[0], existing("2026-09-18", {
    wakeTime: "07:10", bedTime: "01:20", napMinutes: 42, legacySleepHours: 6.5,
    variableExpenseTotal: 2300, everydayExpense: 1200, regretExpense: 300,
  }));
});

test("napMinutesが無い旧データはnapHoursから分へ変換し、空の記録日は作らない", () => {
  const result = buildDiaryMigration({
    appName: "Yuki Diary App",
    entries: [
      { date: "2026-09-17", napHours: 1.25 },
      { date: "2026-09-16", body: "本文だけ" },
    ],
  }, [], NOW);
  assert.equal(result.relevantEntries, 1);
  assert.equal(result.recordsToSave[0].napMinutes, 75);
});

test("既存日は空欄だけ補完し、異なる睡眠値と家計一式は上書きしない", () => {
  const current = existing("2026-09-18", { wakeTime: "08:00", variableExpenseTotal: 500, everydayExpense: 500 });
  const result = buildDiaryMigration({
    appName: "Yuki Diary App",
    entries: [{
      date: "2026-09-18", wakeUpTime: "07:00", bedTime: "00:30",
      everydayExpense: 1000, satisfactionExpense: 200, regretExpense: 0,
    }],
  }, [current], NOW);
  assert.equal(result.mergedRecords, 1);
  assert.equal(result.conflictDays, 1);
  assert.equal(result.recordsToSave[0].wakeTime, "08:00");
  assert.equal(result.recordsToSave[0].bedTime, "00:30");
  assert.equal(result.recordsToSave[0].variableExpenseTotal, 500);
});

test("季節日記以外のJSONは拒否する", () => {
  assert.throws(() => buildDiaryMigration({ appName: "Other", entries: [] }, [], NOW), /季節日記/);
});
