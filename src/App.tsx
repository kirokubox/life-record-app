import { useEffect, useMemo, useRef, useState } from "react";
import { durationUntilBed, formatDuration, lastMealTime, sleepMetrics } from "./calculations";
import { addDays, formatDateLabel, formatDateShort, lastMonthRange, lastWeekRange, shiftMonth, shiftWeek, todayKey } from "./dateUtils";
import { exportComplete, exportJson, exportRangeMarkdown, exportRangeZip, importCompleteFile, importJsonFile } from "./backup";
import { readDiaryMigrationFile } from "./diaryMigration";
import { preparePhoto, toMeta } from "./photos";
import {
  createEmptyRecord, deletePhoto, getAllRecords, getPhoto, getSettings, photoStats, putPhoto, saveRecord, saveSettings,
} from "./storage";
import type { DiaryMigrationPreview } from "./diaryMigration";
import type { AppSettings, LifeRecord, Meal, MealType } from "./types";
import { MEAL_LABEL, canAddMeal, sortedMeals } from "./meals";
import type { ExportKind, ExportRange } from "./exporters";
import { RecentSleepCard } from "./RecentSleepCard";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { AppBar, DateSwitcher, IconButton } from "./ui";

type Tab = "day" | "review" | "settings";

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "day", label: "今日", icon: "pencil" },
  { key: "review", label: "振り返り", icon: "chart" },
  { key: "settings", label: "設定", icon: "settings" },
];

const MEAL_TYPES = Object.keys(MEAL_LABEL) as MealType[];

// 初回だけ出す説明を閉じたかどうか（画面の表示状態だけ。記録データとは別）
const INTRO_DISMISSED_KEY = "life-record-app:intro-dismissed";

function readIntroDismissed(): boolean {
  try {
    return localStorage.getItem(INTRO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberOrNull(value: string): number | null {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function rangeLabel(range: ExportRange): string {
  return `${formatDateShort(range.start)}〜${formatDateShort(range.end)}`;
}

function PhotoThumb({ id, alt }: { id?: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!id) { setUrl(""); return; }
    getPhoto(id).then((photo) => {
      if (!active || !photo) return;
      objectUrl = URL.createObjectURL(photo.blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? <img className="photo-thumb" src={url} alt={alt} /> : <div className="photo-placeholder">写真なし</div>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input type="time" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function App() {
  const [records, setRecords] = useState<LifeRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [date, setDate] = useState(todayKey());
  const [record, setRecord] = useState<LifeRecord>(() => createEmptyRecord(todayKey()));
  const [tab, setTab] = useState<Tab>("day");
  const [status, setStatus] = useState("読み込み中…");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [introDismissed, setIntroDismissed] = useState(readIntroDismissed);
  const [ready, setReady] = useState(false);
  const [storageLabel, setStorageLabel] = useState("");
  const [diaryMigration, setDiaryMigration] = useState<{ fileName: string; preview: DiaryMigrationPreview } | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>(() => lastWeekRange(todayKey()));
  const [exportPreset, setExportPreset] = useState<ExportKind>("week");
  const jsonInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const diaryInput = useRef<HTMLInputElement>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    Promise.all([getAllRecords(), getSettings()]).then(([loadedRecords, loadedSettings]) => {
      setRecords(loadedRecords);
      setSettings(loadedSettings);
      skipNextSave.current = true;
      setRecord(loadedRecords.find((item) => item.date === date) ?? createEmptyRecord(date));
      setStatus("保存済み");
      setReady(true);
    }).catch((error) => setStatus(`読み込み失敗: ${String(error)}`));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.error ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(text: string, error = false) {
    setToast({ text, error });
  }

  function dismissIntro() {
    setIntroDismissed(true);
    try {
      localStorage.setItem(INTRO_DISMISSED_KEY, "1");
    } catch {
      // 保存できない環境では、この起動のあいだだけ閉じる
    }
  }

  useEffect(() => {
    if (!ready) return;
    skipNextSave.current = true;
    setRecord(records.find((item) => item.date === date) ?? createEmptyRecord(date));
  }, [date]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setStatus("入力中…");
    const timer = window.setTimeout(async () => {
      const next = { ...record, updatedAt: new Date().toISOString() };
      try {
        await saveRecord(next);
        setRecords((current) => [next, ...current.filter((item) => item.date !== next.date)].sort((a, b) => b.date.localeCompare(a.date)));
        setStatus("保存済み");
      } catch (error) {
        setStatus("保存失敗");
        notify(`保存できませんでした：${errorText(error)}`, true);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [record, ready]);

  const byDate = useMemo(() => new Map(records.map((item) => [item.date, item])), [records]);
  const previous = byDate.get(addDays(date, -1));
  const sleep = settings ? sleepMetrics(record, previous, settings.dayBoundaryTime) : null;
  const lastMeal = lastMealTime(record);

  function patch(patchValue: Partial<LifeRecord>) {
    setRecord((current) => ({ ...current, ...patchValue }));
  }

  async function commitRecord(next: LifeRecord) {
    const saved = { ...next, updatedAt: new Date().toISOString() };
    await saveRecord(saved);
    skipNextSave.current = true;
    setRecord(saved);
    setRecords((current) => [saved, ...current.filter((item) => item.date !== saved.date)].sort((a, b) => b.date.localeCompare(a.date)));
  }

  function addMeal(type: MealType) {
    if (!canAddMeal(record.meals, type)) return;
    const meal: Meal = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, type, time: "", note: "" };
    patch({ meals: [...record.meals, meal] });
  }

  function patchMeal(id: string, value: Partial<Meal>) {
    patch({ meals: record.meals.map((meal) => meal.id === id ? { ...meal, ...value } : meal) });
  }

  async function attachMealPhoto(meal: Meal, file?: File) {
    if (!file) return;
    setStatus("写真を保存中…");
    try {
      const photo = await preparePhoto(file, date, "meal", meal.id);
      await putPhoto(photo);
      const metas = record.mealPhotos.filter((item) => item.id !== meal.photoId).concat(toMeta(photo));
      await commitRecord({ ...record, mealPhotos: metas, meals: record.meals.map((item) => item.id === meal.id ? { ...item, photoId: photo.id } : item) });
      if (meal.photoId) await deletePhoto(meal.photoId);
      setStatus("保存済み");
    } catch (error) {
      setStatus("保存失敗");
      notify(errorText(error), true);
    }
  }

  async function attachFacePhoto(file?: File) {
    if (!file) return;
    setStatus("写真を保存中…");
    try {
      const photo = await preparePhoto(file, date, "face");
      await putPhoto(photo);
      const oldId = record.facePhoto?.id;
      await commitRecord({ ...record, facePhoto: toMeta(photo) });
      if (oldId) await deletePhoto(oldId);
      setStatus("保存済み");
    } catch (error) {
      setStatus("保存失敗");
      notify(errorText(error), true);
    }
  }

  async function removeMeal(id: string) {
    const meal = record.meals.find((item) => item.id === id);
    await commitRecord({ ...record, meals: record.meals.filter((item) => item.id !== id), mealPhotos: record.mealPhotos.filter((item) => item.id !== meal?.photoId) });
    if (meal?.photoId) await deletePhoto(meal.photoId);
  }

  async function updateSettings(value: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...value };
    setSettings(next);
    await saveSettings(next);
    notify("設定を保存しました");
  }

  async function refreshAfterImport(message: string) {
    const loaded = await getAllRecords();
    setRecords(loaded);
    skipNextSave.current = true;
    setRecord(loaded.find((item) => item.date === date) ?? createEmptyRecord(date));
    notify(message);
  }

  async function previewDiaryMigration(file?: File) {
    if (!file) return;
    setMigrationBusy(true);
    try {
      const preview = await readDiaryMigrationFile(file, await getAllRecords());
      setDiaryMigration({ fileName: file.name, preview });
      notify("季節日記から移す内容を確認してください");
    } catch (error) {
      setDiaryMigration(null);
      notify(error instanceof Error ? error.message : "季節日記のバックアップを読み込めませんでした", true);
    } finally {
      setMigrationBusy(false);
      if (diaryInput.current) diaryInput.current.value = "";
    }
  }

  async function applyDiaryMigration() {
    if (!diaryMigration || diaryMigration.preview.recordsToSave.length === 0) return;
    setMigrationBusy(true);
    try {
      for (const item of diaryMigration.preview.recordsToSave) await saveRecord(item);
      const { newRecords, mergedRecords, conflictDays } = diaryMigration.preview;
      setDiaryMigration(null);
      await refreshAfterImport(`季節日記から新規${newRecords}日・既存${mergedRecords}日を移しました${conflictDays ? `（食い違う${conflictDays}日は今の値のまま）` : ""}`);
    } catch (error) {
      notify(`移せませんでした：${errorText(error)}`, true);
    } finally {
      setMigrationBusy(false);
    }
  }

  const recent = records.slice(0, 14);
  const recentMealPhotos = recent.flatMap((item) => item.meals.filter((meal) => meal.photoId).map((meal) => ({ item, meal })));
  const recentFaces = recent.filter((item) => item.facePhoto);
  const exportInvalid = exportRange.start > exportRange.end;
  const exportRecordCount = records.filter((item) => item.date >= exportRange.start && item.date <= exportRange.end).length;
  const exportPhotoCount = records.filter((item) => item.date >= exportRange.start && item.date <= exportRange.end).reduce((sum, item) => sum + item.meals.filter((meal) => meal.photoId).length + (item.facePhoto ? 1 : 0), 0);

  if (!settings) return <main className="app-shell"><p className="loading">{status}</p></main>;

  const openDate = (target: string) => { setDate(target); setTab("day"); };

  return (
    <div className="app-shell">
      <main>
        {tab === "day" && <div className="screen">
          <AppBar>
            <DateSwitcher date={date} onMove={setDate} />
            <span className="spacer" />
            <span className={status === "保存済み" ? "save-badge saved" : "save-badge"} role="status">{status}</span>
          </AppBar>

          <div className="screen-body">
            {!introDismissed && <section className="intro">
              <div className="intro-text">
                <strong>毎日の事実を残して、あとから見返す</strong>
                <p>睡眠は、前日の就寝から今日の起床までを自動で計算します。食事は写真と短いメモだけ。顔は評価せず、写真そのものを残します。入力した内容はそのまま自動で保存されます。</p>
              </div>
              <IconButton icon="x" label="説明を閉じる" onClick={dismissIntro} />
            </section>}

            <section className="card pad">
              <h2 className="card-title"><Icon name="moon" size={18} />睡眠</h2>
              <div className="field-grid"><TimeField label="起床" value={record.wakeTime} onChange={(wakeTime) => patch({ wakeTime })} /><TimeField label="就寝" value={record.bedTime} onChange={(bedTime) => patch({ bedTime })} /></div>
              <label className="field"><span>仮眠（分）</span><input inputMode="numeric" type="number" min="0" value={record.napMinutes ?? ""} onChange={(event) => patch({ napMinutes: numberOrNull(event.target.value) })} /></label>
              <dl className="kv-list"><div><dt>夜間睡眠</dt><dd>{formatDuration(sleep?.nightMinutes ?? null)}</dd></div><div><dt>仮眠込み</dt><dd>{formatDuration(sleep?.totalMinutes ?? null)}</dd></div></dl>
              {!previous?.bedTime && <p className="hint">前日の就寝時刻を入れると、今日の睡眠時間が自動で計算されます。</p>}
            </section>

            <section className="card pad">
              <h2 className="card-title"><Icon name="utensils" size={18} />食事</h2>
              <div className="quick-buttons">{MEAL_TYPES.map((type) => {
                const added = !canAddMeal(record.meals, type);
                return <button className="btn small" type="button" key={type} disabled={added} onClick={() => addMeal(type)}><Icon name={added ? "check" : "plus"} size={16} />{MEAL_LABEL[type]}{added && <span className="sr-only">（追加済み）</span>}</button>;
              })}</div>
              {record.meals.length === 0 ? <p className="empty">上のボタンから食事を追加できます。</p> : <div className="meal-list">
                {sortedMeals(record.meals).map((meal) => <article className="meal-row" key={meal.id}>
                  <label className="meal-photo">
                    <PhotoThumb id={meal.photoId} alt={`${MEAL_LABEL[meal.type]}の写真`} />
                    <span className="photo-chip"><Icon name="camera" size={14} /></span>
                    <input type="file" accept="image/*" aria-label={`${MEAL_LABEL[meal.type]}の写真を選ぶ`} onChange={(event) => void attachMealPhoto(meal, event.target.files?.[0])} />
                  </label>
                  <div className="meal-fields">
                    <strong>{MEAL_LABEL[meal.type]}</strong>
                    <input type="time" aria-label={`${MEAL_LABEL[meal.type]}の時刻`} value={meal.time} onChange={(event) => patchMeal(meal.id, { time: event.target.value })} />
                    <IconButton icon="trash" label={`${MEAL_LABEL[meal.type]}を削除`} onClick={() => void removeMeal(meal.id)} />
                    <input type="text" placeholder="食べたもの" aria-label={`${MEAL_LABEL[meal.type]}で食べたもの`} value={meal.note} onChange={(event) => patchMeal(meal.id, { note: event.target.value })} />
                  </div>
                </article>)}
              </div>}
            </section>

            <section className="card pad">
              <h2 className="card-title"><Icon name="clock" size={18} />睡眠まわり</h2>
              <div className="field-grid"><TimeField label="入浴" value={record.bathTime} onChange={(bathTime) => patch({ bathTime })} /><TimeField label="最終喫煙" value={record.lastSmokingTime} onChange={(lastSmokingTime) => patch({ lastSmokingTime })} /></div>
              <dl className="kv-list"><div><dt>最終食事 {lastMeal || "—"} → 就寝</dt><dd>{formatDuration(durationUntilBed(record, lastMeal))}</dd></div><div><dt>入浴 → 就寝</dt><dd>{formatDuration(durationUntilBed(record, record.bathTime))}</dd></div><div><dt>最終喫煙 → 就寝</dt><dd>{formatDuration(durationUntilBed(record, record.lastSmokingTime))}</dd></div></dl>
            </section>

            <section className="card pad">
              <h2 className="card-title"><Icon name="smile" size={18} />顔</h2>
              <div className="face-layout">
                <PhotoThumb id={record.facePhoto?.id} alt="今日の顔写真" />
                <div className="face-actions">
                  <label className={record.facePhoto ? "btn" : "btn primary"}><Icon name="camera" size={18} />{record.facePhoto ? "写真を変える" : "顔写真を追加"}<input type="file" accept="image/*" onChange={(event) => void attachFacePhoto(event.target.files?.[0])} /></label>
                  {record.facePhoto && <p className="hint">登録 {new Date(record.facePhoto.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p>}
                </div>
              </div>
            </section>
          </div>
        </div>}

        {tab === "review" && <div className="screen">
          <AppBar><h1 className="app-bar-title">振り返り</h1></AppBar>
          <div className="screen-body">
            <RecentSleepCard records={records} boundary={settings.dayBoundaryTime} onOpenDate={openDate} />

            <section className="list-section">
              <h2 className="section-title">最近の記録</h2>
              {recent.length === 0 ? <p className="empty">まだ記録がありません。</p> : <div className="card list-rows">{recent.map((item) => {
                const metric = sleepMetrics(item, byDate.get(addDays(item.date, -1)), settings.dayBoundaryTime);
                return <button className="row-btn" type="button" key={item.date} onClick={() => openDate(item.date)}>
                  <span className="row-main"><span className="row-title">{formatDateLabel(item.date)}</span><span className="row-sub">{item.meals.length}食</span></span>
                  <span className="row-value">{formatDuration(metric.totalMinutes)}</span>
                  <Icon name="chevron-right" size={18} />
                </button>;
              })}</div>}
            </section>

            <section className="list-section">
              <h2 className="section-title">最近の食事写真</h2>
              {recentMealPhotos.length === 0 ? <p className="empty">食事の写真はまだありません。</p> : <div className="photo-grid">{recentMealPhotos.map(({ item, meal }) => <button type="button" key={meal.photoId} onClick={() => openDate(item.date)}><PhotoThumb id={meal.photoId} alt={meal.note || MEAL_LABEL[meal.type]} /><span>{formatDateShort(item.date)} {MEAL_LABEL[meal.type]}</span></button>)}</div>}
            </section>

            <section className="list-section">
              <h2 className="section-title">顔写真の時系列</h2>
              {recentFaces.length === 0 ? <p className="empty">顔写真はまだありません。</p> : <div className="photo-grid face-history">{recentFaces.map((item) => <button type="button" key={item.date} onClick={() => openDate(item.date)}><PhotoThumb id={item.facePhoto?.id} alt={`${formatDateLabel(item.date)}の顔写真`} /><span>{formatDateShort(item.date)}</span></button>)}</div>}
            </section>
          </div>
        </div>}

        {tab === "settings" && <div className="screen">
          <AppBar><h1 className="app-bar-title">設定</h1></AppBar>
          <div className="screen-body">
            <section className="list-section">
              <h2 className="section-title">AIに渡す書き出し</h2>
              <div className="card pad">
                <div className="segmented" role="group" aria-label="書き出す期間">
                  <button type="button" aria-pressed={exportPreset === "week"} className={exportPreset === "week" ? "on" : ""} onClick={() => { setExportRange(lastWeekRange(todayKey())); setExportPreset("week"); }}>週</button>
                  <button type="button" aria-pressed={exportPreset === "month"} className={exportPreset === "month" ? "on" : ""} onClick={() => { setExportRange(lastMonthRange(todayKey())); setExportPreset("month"); }}>月</button>
                  <button type="button" aria-pressed={exportPreset === "range"} className={exportPreset === "range" ? "on" : ""} onClick={() => setExportPreset("range")}>任意</button>
                </div>
                {exportPreset !== "range" && <div className="range-nav">
                  <IconButton icon="chevron-left" label={exportPreset === "week" ? "前の週" : "前の月"} onClick={() => setExportRange((range) => exportPreset === "week" ? shiftWeek(range, -1) : shiftMonth(range, -1))} />
                  <strong>{rangeLabel(exportRange)}</strong>
                  <IconButton icon="chevron-right" label={exportPreset === "week" ? "次の週" : "次の月"} onClick={() => setExportRange((range) => exportPreset === "week" ? shiftWeek(range, 1) : shiftMonth(range, 1))} />
                </div>}
                {exportPreset === "range" && <div className="field-grid"><label className="field"><span>開始日</span><input type="date" value={exportRange.start} onChange={(event) => setExportRange((range) => ({ ...range, start: event.target.value }))} /></label><label className="field"><span>終了日</span><input type="date" value={exportRange.end} onChange={(event) => setExportRange((range) => ({ ...range, end: event.target.value }))} /></label></div>}
                <p className="hint center">{exportInvalid ? "開始日が終了日より後になっています" : `記録 ${exportRecordCount}日分・写真 ${exportPhotoCount}枚`}</p>
                <div className="stack-actions">
                  <button className="btn wide" type="button" disabled={exportInvalid || exportRecordCount === 0} onClick={() => void exportRangeMarkdown(exportRange, exportPreset)}><Icon name="text" size={18} />テキストで書き出す</button>
                  <button className="btn primary wide" type="button" disabled={exportInvalid || exportRecordCount === 0} onClick={() => void exportRangeZip(exportRange, exportPreset)}><Icon name="image" size={18} />写真つきで書き出す</button>
                </div>
              </div>
            </section>

            <section className="list-section">
              <h2 className="section-title">季節日記から移す</h2>
              <div className="card list-rows">
                <button className="row-btn" type="button" disabled={migrationBusy} onClick={() => diaryInput.current?.click()}>
                  <Icon name="upload" />
                  <span className="row-main"><span className="row-title">{migrationBusy ? "確認中…" : "季節日記のバックアップを選ぶ"}</span><span className="row-sub">季節日記の「バックアップを保存」で作ったファイルから、睡眠と家計の記録だけを取り込みます。日記本文・写真・気分・タグ・らくがきは移しません</span></span>
                </button>
              </div>
              <input ref={diaryInput} hidden type="file" accept="application/json,.json" onChange={(event) => void previewDiaryMigration(event.target.files?.[0])} />
              {diaryMigration && <div className="card pad migration-preview" aria-live="polite">
                <h3>{diaryMigration.fileName}</h3>
                <dl className="kv-list">
                  <div><dt>元の日記</dt><dd>{diaryMigration.preview.sourceEntries}日</dd></div>
                  <div><dt>対象あり</dt><dd>{diaryMigration.preview.relevantEntries}日</dd></div>
                  <div><dt>新規追加</dt><dd>{diaryMigration.preview.newRecords}日</dd></div>
                  <div><dt>既存へ補完</dt><dd>{diaryMigration.preview.mergedRecords}日</dd></div>
                  <div><dt>変更なし</dt><dd>{diaryMigration.preview.unchangedRecords}日</dd></div>
                  <div><dt>食い違い（今の値のまま）</dt><dd>{diaryMigration.preview.conflictDays}日</dd></div>
                </dl>
                <p className="hint">起床 {diaryMigration.preview.importedFields.wakeTime}件・就寝 {diaryMigration.preview.importedFields.bedTime}件・仮眠 {diaryMigration.preview.importedFields.napMinutes}件・旧睡眠時間 {diaryMigration.preview.importedFields.legacySleepHours}件・家計 {diaryMigration.preview.importedFields.expenses}件</p>
                {diaryMigration.preview.warnings.map((warning) => <p className="migration-warning" key={warning}>{warning}</p>)}
                <div className="preview-actions"><button className="btn" type="button" onClick={() => setDiaryMigration(null)}>やめる</button><button className="btn primary" type="button" disabled={migrationBusy || diaryMigration.preview.recordsToSave.length === 0} onClick={() => void applyDiaryMigration()}>この内容で移す</button></div>
              </div>}
            </section>

            <section className="list-section">
              <h2 className="section-title">バックアップ</h2>
              <div className="card list-rows">
                <button className="row-btn" type="button" onClick={() => void exportJson()}>
                  <Icon name="download" />
                  <span className="row-main"><span className="row-title">バックアップを保存</span><span className="row-sub">時刻やメモなどの文字を保存します。写真は入りません</span></span>
                </button>
                <button className="row-btn" type="button" onClick={() => void exportComplete()}>
                  <Icon name="download" />
                  <span className="row-main"><span className="row-title">写真つきバックアップを保存</span><span className="row-sub">食事と顔の写真も一緒に保存します</span></span>
                </button>
                <button className="row-btn" type="button" onClick={() => jsonInput.current?.click()}>
                  <Icon name="upload" />
                  <span className="row-main"><span className="row-title">バックアップから追加</span><span className="row-sub">すでにある日は上書きせず、無い日だけ追加します</span></span>
                </button>
                <button className="row-btn" type="button" onClick={() => zipInput.current?.click()}>
                  <Icon name="upload" />
                  <span className="row-main"><span className="row-title">写真つきバックアップから追加</span><span className="row-sub">無い日だけ追加します。写真だけ失ったときの復元にも使えます</span></span>
                </button>
                <button className="row-btn" type="button" onClick={() => void photoStats().then((value) => setStorageLabel(`${value.count}枚・${(value.bytes / 1024 / 1024).toFixed(1)}MB`))}>
                  <Icon name="image" />
                  <span className="row-main"><span className="row-title">写真の保存容量を確認</span>{storageLabel && <span className="row-sub">{storageLabel}</span>}</span>
                </button>
              </div>
              <input ref={jsonInput} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJsonFile(file).then((r) => refreshAfterImport(`${r.added}日を追加しました（すでにある${r.skipped}日はそのまま）`)).catch((e) => notify(errorText(e), true)); }} />
              <input ref={zipInput} hidden type="file" accept="application/zip,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCompleteFile(file).then((r) => refreshAfterImport(`${r.added}日・写真${r.photos}枚を追加しました`)).catch((e) => notify(errorText(e), true)); }} />
            </section>

            <section className="list-section">
              <h2 className="section-title">このアプリについて</h2>
              <details className="card details">
                <summary>記録の保存場所<Icon name="chevron-down" size={18} /></summary>
                <div className="details-body">
                  <p>記録と写真は、この端末のこのブラウザの中だけに保存されます。ログイン・クラウド同期・Googleカレンダー連携はありません。</p>
                  <p>ブラウザのデータを消す前に、「写真つきバックアップを保存」でファイルに残してください。</p>
                </div>
              </details>
            </section>
          </div>
        </div>}
      </main>

      {toast && <div className={toast.error ? "toast error" : "toast"} role="status">
        <span className="toast-text">{toast.text}</span>
        <button type="button" className="toast-btn" aria-label="閉じる" onClick={() => setToast(null)}><Icon name="x" size={18} /></button>
      </div>}

      <nav className="bottom-tabs" aria-label="画面切り替え">
        {TABS.map((item) => <button type="button" key={item.key} aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? "tab active" : "tab"} onClick={() => setTab(item.key)}>
          <span className="tab-icon"><Icon name={item.icon} size={22} /></span>
          <span>{item.label}</span>
        </button>)}
      </nav>
    </div>
  );
}
