import test from "node:test";
import assert from "node:assert/strict";
import { buildExpenseSeries, buildSleepChartPoints } from "../src/chartData.js";
import type { LifeRecord } from "../src/types.js";

function record(date: string): LifeRecord {
  return { id: date, date, wakeTime: "07:00", bedTime: "23:00", napMinutes: null, meals: [], bathTime: "", lastSmokingTime: "", mealPhotos: [], variableExpenseTotal: null, everydayExpense: null, regretExpense: null, createdAt: "", updatedAt: "" };
}

test("睡眠グラフは1日だけでもx座標用データを作れる", () => {
  const item = record("2026-09-20");
  item.napMinutes = 30;
  const points = buildSleepChartPoints([item], "05:00");
  assert.equal(points.length, 1);
  assert.equal(points[0].napHours, 0.5);
  assert.equal(points[0].totalHours, null);
});

test("変動費グラフは記録のない日を0で埋める", () => {
  const points = buildExpenseSeries([record("2026-09-25")], { start: "2026-09-25", end: "2026-09-27" }, "2026-09-27");
  assert.deepEqual(points.map((point) => point.date), ["2026-09-25", "2026-09-26", "2026-09-27"]);
  assert.deepEqual(points.map((point) => point.everyday), [0, 0, 0]);
  assert.equal(points.every((point) => point.total === null), true);
});
