import test from "node:test";
import assert from "node:assert/strict";
import { buildRangeMarkdown, collectRangePhotos, rangeDayCount } from "../src/exporters.js";
import { defaultSettings } from "../src/calculations.js";
import type { LifeRecord } from "../src/types.js";

function record(date: string): LifeRecord {
  return { id: date, date, wakeTime: "", bedTime: "", napMinutes: null, meals: [], bathTime: "", lastSmokingTime: "", mealPhotos: [], variableExpenseTotal: null, everydayExpense: null, regretExpense: null, createdAt: "", updatedAt: "" };
}

test("期間0件でもAI分析用Markdownを出せる", () => {
  const text = buildRangeMarkdown([], defaultSettings(), { start: "2026-09-01", end: "2026-09-07" }, { includePhotoPaths: false });
  assert.match(text, /画像本体は含まれません/);
  assert.match(text, /（記録なし）/);
  assert.equal(rangeDayCount({ start: "2026-09-07", end: "2026-09-01" }), 0);
});

test("食事写真のパスは日付ごとに連番になる", () => {
  const item = record("2026-09-20");
  item.meals = [{ id: "meal-1", type: "breakfast", time: "08:00", note: "パン", photoId: "photo-1" }];
  item.mealPhotos = [{ id: "photo-1", kind: "meal", mealId: "meal-1", width: 1, height: 1, byteSize: 1, mimeType: "image/jpeg", createdAt: "2026-09-20T08:00:00Z" }];
  const refs = collectRangePhotos([item], { start: "2026-09-20", end: "2026-09-20" });
  assert.equal(refs[0].path, "photos/2026-09-20/001_photo-1.jpg");
  assert.match(buildRangeMarkdown([item], defaultSettings(), { start: "2026-09-20", end: "2026-09-20" }, { includePhotoPaths: true }), /photos\/2026-09-20\/001_photo-1\.jpg/);
});
