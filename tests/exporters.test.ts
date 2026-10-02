import test from "node:test";
import assert from "node:assert/strict";
import { buildRangeMarkdown, collectRangePhotos, exportFileBase, rangeDayCount } from "../src/exporters.js";
import { lastMonthRange, lastWeekRange, monthContaining, shiftMonth, shiftWeek, weekContaining } from "../src/dateUtils.js";
import { defaultSettings } from "../src/calculations.js";
import type { LifeRecord } from "../src/types.js";

const AT = "2026/10/03 09:00";

function record(date: string): LifeRecord {
  return { id: date, date, wakeTime: "", bedTime: "", napMinutes: null, meals: [], bathTime: "", lastSmokingTime: "", mealPhotos: [], variableExpenseTotal: null, everydayExpense: null, regretExpense: null, createdAt: "", updatedAt: "" };
}

test("期間0件でもAI分析用Markdownを出せる", () => {
  const text = buildRangeMarkdown([], defaultSettings(), { start: "2026-09-01", end: "2026-09-07" }, { includePhotoPaths: false, exportedAt: AT });
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
  assert.match(buildRangeMarkdown([item], defaultSettings(), { start: "2026-09-20", end: "2026-09-20" }, { includePhotoPaths: true, exportedAt: AT }), /photos\/2026-09-20\/001_photo-1\.jpg/);
});

test("変動費はMarkdownに出ず、入浴・最終喫煙の時刻と対象期間・書き出し日時が出る", () => {
  const item = record("2026-09-20");
  item.bedTime = "23:00";
  item.bathTime = "21:30";
  item.lastSmokingTime = "22:15";
  item.variableExpenseTotal = 1234;
  item.everydayExpense = 800;
  item.regretExpense = 100;
  const range = { start: "2026-09-20", end: "2026-09-26" };
  const text = buildRangeMarkdown([item], defaultSettings(), range, { includePhotoPaths: false, exportedAt: AT });
  assert.ok(text.includes("| --- | --- | --- | ---: | ---: | ---: | ---: | --- |\n"));
  assert.match(text, /対象期間：2026-09-20〜2026-09-26/);
  assert.match(text, /書き出し日時：2026\/10\/03 09:00/);
  assert.match(text, /\| 入浴 \| 入浴→就寝 \| 最終喫煙 \| 最終喫煙→就寝 \|/);
  assert.match(text, /\| 21:30 \| .* \| 22:15 \|/);
  assert.doesNotMatch(text, /変動費|日常|満足|反省|今期|1,234|1234/);
});

test("週は月曜始まり、月は暦月の末日まで", () => {
  assert.deepEqual(weekContaining("2026-09-27"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(weekContaining("2026-09-21"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(lastWeekRange("2026-10-03"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(shiftWeek({ start: "2026-09-21", end: "2026-09-27" }, -1), { start: "2026-09-14", end: "2026-09-20" });
  assert.deepEqual(shiftWeek({ start: "2026-12-28", end: "2027-01-03" }, 1), { start: "2027-01-04", end: "2027-01-10" });
  assert.deepEqual(monthContaining("2026-09-15"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(monthContaining("2024-02-10"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(lastMonthRange("2026-01-05"), { start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(shiftMonth({ start: "2026-12-01", end: "2026-12-31" }, 1), { start: "2027-01-01", end: "2027-01-31" });
  assert.deepEqual(shiftMonth({ start: "2026-03-01", end: "2026-03-31" }, -1), { start: "2026-02-01", end: "2026-02-28" });
});

test("ファイル名は種別と期間で決まる", () => {
  assert.equal(exportFileBase("week", { start: "2026-09-22", end: "2026-09-28" }), "life-record-week-2026-09-22_2026-09-28");
  assert.equal(exportFileBase("month", { start: "2026-09-01", end: "2026-09-30" }), "life-record-month-2026-09");
  assert.equal(exportFileBase("range", { start: "2026-09-01", end: "2026-09-10" }), "life-record-range-2026-09-01_2026-09-10");
});

test("顔写真は日別表にあり／パスで出て、パスはZIP内パスと一致する", () => {
  const item = record("2026-09-20");
  item.facePhoto = { id: "face-1", kind: "face", width: 1, height: 1, byteSize: 1, mimeType: "image/jpeg", createdAt: "2026-09-20T08:00:00Z" };
  const range = { start: "2026-09-20", end: "2026-09-20" };
  const md = buildRangeMarkdown([item], defaultSettings(), range, { includePhotoPaths: false, exportedAt: AT });
  assert.match(md, /\| 顔写真 \|/);
  assert.match(md, /\| 0 \| あり \|/);
  const path = collectRangePhotos([item], range)[0].path;
  assert.ok(buildRangeMarkdown([item], defaultSettings(), range, { includePhotoPaths: true, exportedAt: AT }).includes(`| 0 | あり（${path}） |`));
  assert.ok(!buildRangeMarkdown([record("2026-09-21")], defaultSettings(), { start: "2026-09-21", end: "2026-09-21" }, { includePhotoPaths: true, exportedAt: AT }).includes("| 0 | あり"));
});
