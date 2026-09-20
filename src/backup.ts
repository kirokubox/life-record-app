import { getAllPhotos, getAllRecords, getPhoto, getSettings, putPhoto, saveRecord, saveSettings } from "./storage";
import { buildRangeMarkdown, collectRangePhotos, photoExtension, recordsInRange, type ExportRange } from "./exporters";
import type { LifeRecordExport, StoredPhoto } from "./types";
import { createZipBlob, readZipEntries } from "./zip";

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function payload(): Promise<LifeRecordExport> {
  return { appName: "Life Record App", version: "1.0.0", exportedAt: new Date().toISOString(), records: await getAllRecords(), settings: await getSettings() };
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function exportJson() {
  download(new Blob([JSON.stringify(await payload(), null, 2)], { type: "application/json" }), `life-record-backup-${stamp()}.json`);
}

export async function exportComplete() {
  const data = await payload();
  const photos = await getAllPhotos();
  const manifest = photos.map(({ blob: _blob, ...photo }, index) => ({
    ...photo,
    path: `photos/${photo.date}/${String(index + 1).padStart(3, "0")}_${photo.id}.${photoExtension(photo.mimeType)}`,
  }));
  const files = [
    { path: "life-record-backup.json", blob: new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }) },
    { path: "photos.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) },
    { path: "README.txt", blob: new Blob(["生活記録の完全バックアップです。顔写真・食事写真を含むため、GitHubやSNSへ公開しないでください。"], { type: "text/plain" }) },
    ...photos.map((photo, index) => ({ path: manifest[index].path, blob: photo.blob })),
  ];
  download(await createZipBlob(files, new Date()), `life-record-photo-backup-${stamp()}.zip`);
}

function validate(value: unknown): LifeRecordExport {
  const data = value as Partial<LifeRecordExport>;
  if (data.appName !== "Life Record App" || !Array.isArray(data.records) || !data.settings) throw new Error("生活記録のバックアップではありません");
  return data as LifeRecordExport;
}

async function merge(data: LifeRecordExport): Promise<{ added: number; skipped: number }> {
  const existing = new Set((await getAllRecords()).map((record) => record.date));
  let added = 0;
  let skipped = 0;
  for (const record of data.records) {
    if (!record?.date || existing.has(record.date)) { skipped += 1; continue; }
    await saveRecord(record);
    existing.add(record.date);
    added += 1;
  }
  await saveSettings({ ...(await getSettings()), ...data.settings });
  return { added, skipped };
}

export async function importJsonFile(file: File) {
  return merge(validate(JSON.parse(await file.text())));
}

export async function importCompleteFile(file: File) {
  const entries = await readZipEntries(file);
  const byName = new Map(entries.map((entry) => [entry.path, entry]));
  const backup = byName.get("life-record-backup.json");
  const manifestEntry = byName.get("photos.json");
  if (!backup || !manifestEntry) throw new Error("完全バックアップに必要なファイルがありません");
  const data = validate(JSON.parse(await backup.blob.text()));
  const result = await merge(data);
  const manifest = JSON.parse(await manifestEntry.blob.text()) as Array<Omit<StoredPhoto, "blob"> & { path: string }>;
  const currentRecords = await getAllRecords();
  const referenced = new Set(currentRecords.flatMap((record) =>
    [record.facePhoto?.id, ...record.mealPhotos.map((photo) => photo.id)].filter((id): id is string => Boolean(id)),
  ));
  let photos = 0;
  for (const item of manifest) {
    if (!referenced.has(item.id)) continue;
    if (await getPhoto(item.id)) continue;
    const entry = byName.get(item.path);
    if (!entry) continue;
    const { path: _path, ...meta } = item;
    await putPhoto({ ...meta, blob: entry.blob.slice(0, entry.blob.size, item.mimeType) });
    photos += 1;
  }
  return { ...result, photos };
}

function rangeFileName(range: ExportRange, extension: string): string {
  return `life-record-${range.start}_${range.end}.${extension}`;
}

function exportedAtLabel(): string {
  return new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// 週次でAIに読ませる用。画像は含めず、テキストだけを渡したいとき
export async function exportRangeMarkdown(range: ExportRange) {
  const [records, settings] = await Promise.all([getAllRecords(), getSettings()]);
  const text = buildRangeMarkdown(records, settings, range, { includePhotoPaths: false, exportedAt: exportedAtLabel() });
  download(new Blob([text], { type: "text/markdown;charset=utf-8" }), rangeFileName(range, "md"));
  return { days: recordsInRange(records, range).length, photos: 0 };
}

// 同じMarkdownに、その期間の写真を添えたZIP。Markdown内のパスとZIPの中身は collectRangePhotos で揃える
export async function exportRangeZip(range: ExportRange) {
  const [records, settings] = await Promise.all([getAllRecords(), getSettings()]);
  const text = buildRangeMarkdown(records, settings, range, { includePhotoPaths: true, exportedAt: exportedAtLabel() });
  const files = [
    { path: rangeFileName(range, "md"), blob: new Blob([text], { type: "text/markdown;charset=utf-8" }) },
    { path: "README.txt", blob: new Blob(["生活記録の期間書き出しです。顔写真・食事写真を含むため、GitHubやSNSへ公開しないでください。"], { type: "text/plain;charset=utf-8" }) },
  ];
  let photos = 0;
  for (const ref of collectRangePhotos(records, range)) {
    const photo = await getPhoto(ref.id);
    if (!photo) continue;
    files.push({ path: ref.path, blob: photo.blob });
    photos += 1;
  }
  download(await createZipBlob(files, new Date()), rangeFileName(range, "zip"));
  return { days: recordsInRange(records, range).length, photos };
}
