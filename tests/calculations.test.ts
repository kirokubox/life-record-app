import assert from "node:assert/strict";
import test from "node:test";
import { durationUntilBed, expensePeriod, lastMealTime, satisfactionExpense, sleepMetrics } from "../src/calculations.js";
import type { LifeRecord } from "../src/types.js";

function record(date: string, patch: Partial<LifeRecord> = {}): LifeRecord {
  return { id: date, date, wakeTime: "", bedTime: "", napMinutes: null, meals: [], bathTime: "", lastSmokingTime: "", mealPhotos: [], variableExpenseTotal: null, everydayExpense: null, regretExpense: null, createdAt: "", updatedAt: "", ...patch };
}

test("前日23:30就寝から06:30起床は7時間", () => assert.equal(sleepMetrics(record("2026-09-20", { wakeTime: "06:30" }), record("2026-09-19", { wakeTime: "06:00", bedTime: "23:30" }), "05:00").nightMinutes, 420));
test("日付をまたぐ01:12就寝を生活日の翌日として扱う", () => assert.equal(sleepMetrics(record("2026-09-20", { wakeTime: "06:30" }), record("2026-09-19", { wakeTime: "06:00", bedTime: "01:12" }), "05:00").nightMinutes, 318));
test("仮眠を睡眠合計へ加える", () => assert.equal(sleepMetrics(record("2026-09-20", { wakeTime: "06:30", napMinutes: 42 }), record("2026-09-19", { wakeTime: "06:00", bedTime: "01:12" }), "05:00").totalMinutes, 360));
test("食事・入浴・喫煙から就寝までを日跨ぎ計算", () => { const value = record("2026-09-20", { bedTime: "00:40" }); assert.equal(durationUntilBed(value, "22:10"), 150); assert.equal(durationUntilBed(value, "23:20"), 80); assert.equal(durationUntilBed(value, "00:05"), 35); });
test("最後の食事時刻を得る", () => assert.equal(lastMealTime(record("2026-09-20", { meals: [{ id: "1", type: "dinner", time: "21:30", note: "" }, { id: "2", type: "snack", time: "22:15", note: "" }] })), "22:15"));
test("就寝が深夜なら日付をまたいだ食事を最終として扱う", () => assert.equal(lastMealTime(record("2026-09-20", { bedTime: "01:00", meals: [{ id: "1", type: "dinner", time: "22:30", note: "" }, { id: "2", type: "snack", time: "00:20", note: "" }] })), "00:20"));
test("満足費を全額から自動計算", () => assert.equal(satisfactionExpense(record("2026-09-20", { variableExpenseTotal: 7414, everydayExpense: 1125, regretExpense: 181 })), 6108));
test("25日開始の期間", () => assert.deepEqual(expensePeriod("2026-09-20", 25), { start: "2026-08-25", end: "2026-09-24" }));
