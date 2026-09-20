import { useEffect, useMemo, useRef, useState } from "react";
import {
  durationUntilBed, expenseError, expensePeriod, formatDuration, lastMealTime, periodExpense,
  recordExpenseSummary, sevenDaySleepAverage, sleepMetrics,
} from "./calculations";
import { addDays, formatDateJa, todayKey } from "./dateUtils";
import { exportComplete, exportJson, importCompleteFile, importJsonFile } from "./backup";
import { preparePhoto, toMeta } from "./photos";
import {
  createEmptyRecord, deletePhoto, getAllRecords, getPhoto, getSettings, photoStats, putPhoto, saveRecord, saveSettings,
} from "./storage";
import type { AppSettings, LifeRecord, Meal, MealType } from "./types";

const MEAL_LABEL: Record<MealType, string> = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食" };

function numberOrNull(value: string): number | null {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function money(value: number | null): string {
  return value === null ? "未入力" : `${value.toLocaleString("ja-JP")}円`;
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
  return url ? <img className="photo-thumb" src={url} alt={alt} /> : <div className="photo-placeholder">画像なし</div>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input type="time" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function App() {
  const [records, setRecords] = useState<LifeRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [date, setDate] = useState(todayKey());
  const [record, setRecord] = useState<LifeRecord>(() => createEmptyRecord(todayKey()));
  const [tab, setTab] = useState<"day" | "review" | "settings">("day");
  const [status, setStatus] = useState("読み込み中…");
  const [ready, setReady] = useState(false);
  const [storageLabel, setStorageLabel] = useState("");
  const jsonInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
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
    if (!ready) return;
    skipNextSave.current = true;
    setRecord(records.find((item) => item.date === date) ?? createEmptyRecord(date));
  }, [date]);

  useEffect(() => {
    if (!ready || expenseError(record)) return;
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
        setStatus("自動保存済み");
      } catch (error) {
        setStatus(`保存失敗: ${String(error)}`);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [record, ready]);

  const byDate = useMemo(() => new Map(records.map((item) => [item.date, item])), [records]);
  const previous = byDate.get(addDays(date, -1));
  const sleep = settings ? sleepMetrics(record, previous, settings.dayBoundaryTime) : null;
  const lastMeal = lastMealTime(record);
  const expenses = recordExpenseSummary(record);
  const error = expenseError(record);

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
    const meal: Meal = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, type, time: "", note: "" };
    patch({ meals: [...record.meals, meal] });
  }

  function patchMeal(id: string, value: Partial<Meal>) {
    patch({ meals: record.meals.map((meal) => meal.id === id ? { ...meal, ...value } : meal) });
  }

  async function attachMealPhoto(meal: Meal, file?: File) {
    if (!file) return;
    setStatus("写真を保存中…");
    const photo = await preparePhoto(file, date, "meal", meal.id);
    await putPhoto(photo);
    const metas = record.mealPhotos.filter((item) => item.id !== meal.photoId).concat(toMeta(photo));
    await commitRecord({ ...record, mealPhotos: metas, meals: record.meals.map((item) => item.id === meal.id ? { ...item, photoId: photo.id } : item) });
    if (meal.photoId) await deletePhoto(meal.photoId);
  }

  async function attachFacePhoto(file?: File) {
    if (!file) return;
    setStatus("顔写真を保存中…");
    const photo = await preparePhoto(file, date, "face");
    await putPhoto(photo);
    const oldId = record.facePhoto?.id;
    await commitRecord({ ...record, facePhoto: toMeta(photo) });
    if (oldId) await deletePhoto(oldId);
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
    setStatus("設定を保存しました");
  }

  async function refreshAfterImport(message: string) {
    const loaded = await getAllRecords();
    setRecords(loaded);
    setRecord(loaded.find((item) => item.date === date) ?? createEmptyRecord(date));
    setStatus(message);
  }

  const recent = records.slice(0, 14);
  const period = settings ? expensePeriod(todayKey(), settings.variableExpenseStartDay) : null;
  const spent = period ? periodExpense(records, period) : 0;
  const remaining = settings ? settings.variableExpenseBudget - spent : 0;

  if (!settings) return <main className="app-shell"><p>{status}</p></main>;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div><p className="eyebrow">毎日の事実を、あとから見返す</p><h1>生活記録</h1></div>
        <span className="save-status">{status}</span>
      </header>

      {tab === "day" && <main>
        <div className="date-nav">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="前の日">‹</button>
          <label><span>{formatDateJa(date)}</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="次の日">›</button>
        </div>

        <section className="card hero-card">
          <div className="section-title"><span className="section-icon sleep-icon">☾</span><div><h2>睡眠</h2><p>前日の就寝から今日の起床まで</p></div></div>
          <div className="field-grid"><TimeField label="起床" value={record.wakeTime} onChange={(wakeTime) => patch({ wakeTime })} /><TimeField label="就寝" value={record.bedTime} onChange={(bedTime) => patch({ bedTime })} /></div>
          <label className="field"><span>仮眠（分）</span><input inputMode="numeric" type="number" min="0" value={record.napMinutes ?? ""} onChange={(event) => patch({ napMinutes: numberOrNull(event.target.value) })} /></label>
          <div className="metric-row"><div><span>夜間睡眠</span><strong>{formatDuration(sleep?.nightMinutes ?? null)}</strong></div><div><span>仮眠込み</span><strong>{formatDuration(sleep?.totalMinutes ?? null)}</strong></div></div>
          {!previous?.bedTime && <p className="hint">前日の就寝時刻を入れると、今日の睡眠時間が自動計算されます。</p>}
        </section>

        <section className="card">
          <div className="section-title"><span className="section-icon meal-icon">⌁</span><div><h2>食事</h2><p>写真と短いメモだけ</p></div></div>
          <div className="quick-buttons">{(Object.keys(MEAL_LABEL) as MealType[]).map((type) => <button key={type} onClick={() => addMeal(type)}>＋ {MEAL_LABEL[type]}</button>)}</div>
          <div className="meal-list">
            {record.meals.map((meal) => <article className="meal-row" key={meal.id}>
              <div className="meal-photo"><PhotoThumb id={meal.photoId} alt={`${MEAL_LABEL[meal.type]}の写真`} /><label className="photo-action">写真<input type="file" accept="image/*" capture="environment" onChange={(event) => void attachMealPhoto(meal, event.target.files?.[0])} /></label></div>
              <div className="meal-fields"><strong>{MEAL_LABEL[meal.type]}</strong><input type="time" value={meal.time} onChange={(event) => patchMeal(meal.id, { time: event.target.value })} /><input type="text" placeholder="食べたもの" value={meal.note} onChange={(event) => patchMeal(meal.id, { note: event.target.value })} /></div>
              <button className="icon-button" onClick={() => void removeMeal(meal.id)} aria-label="食事を削除">×</button>
            </article>)}
            {record.meals.length === 0 && <p className="empty">上のボタンから食事を追加できます。</p>}
          </div>
        </section>

        <section className="card">
          <div className="section-title"><span className="section-icon event-icon">◷</span><div><h2>睡眠まわり</h2><p>入力済み時刻から間隔を計算</p></div></div>
          <div className="field-grid"><TimeField label="入浴" value={record.bathTime} onChange={(bathTime) => patch({ bathTime })} /><TimeField label="最終喫煙" value={record.lastSmokingTime} onChange={(lastSmokingTime) => patch({ lastSmokingTime })} /></div>
          <dl className="interval-list"><div><dt>最終食事 {lastMeal || "—"} → 就寝</dt><dd>{formatDuration(durationUntilBed(record, lastMeal))}</dd></div><div><dt>入浴 → 就寝</dt><dd>{formatDuration(durationUntilBed(record, record.bathTime))}</dd></div><div><dt>最終喫煙 → 就寝</dt><dd>{formatDuration(durationUntilBed(record, record.lastSmokingTime))}</dd></div></dl>
        </section>

        <section className="card face-card">
          <div className="section-title"><span className="section-icon face-icon">○</span><div><h2>顔</h2><p>評価せず、写真そのものを残す</p></div></div>
          <div className="face-layout"><PhotoThumb id={record.facePhoto?.id} alt="今日の顔写真" /><label className="primary-action">{record.facePhoto ? "撮り直す" : "顔写真を追加"}<input type="file" accept="image/*" capture="user" onChange={(event) => void attachFacePhoto(event.target.files?.[0])} /></label></div>
          {record.facePhoto && <p className="hint">登録 {new Date(record.facePhoto.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p>}
        </section>

        <section className="card">
          <div className="section-title"><span className="section-icon money-icon">¥</span><div><h2>お金</h2><p>日単位の変動費</p></div></div>
          <div className="money-grid">
            <label className="field"><span>変動費全額</span><input type="number" min="0" inputMode="numeric" value={record.variableExpenseTotal ?? ""} onChange={(event) => patch({ variableExpenseTotal: numberOrNull(event.target.value) })} /></label>
            <label className="field"><span>日常費</span><input type="number" min="0" inputMode="numeric" value={record.everydayExpense ?? ""} onChange={(event) => patch({ everydayExpense: numberOrNull(event.target.value) })} /></label>
            <label className="field computed"><span>満足費（自動）</span><strong>{money(expenses.satisfaction)}</strong></label>
            <label className="field"><span>反省費</span><input type="number" min="0" inputMode="numeric" value={record.regretExpense ?? ""} onChange={(event) => patch({ regretExpense: numberOrNull(event.target.value) })} /></label>
          </div>
          {error && <p className="error">{error}。修正するまで保存しません。</p>}
        </section>
      </main>}

      {tab === "review" && <main>
        <section className="review-hero"><p>直近7日平均</p><strong>{formatDuration(sevenDaySleepAverage(records, settings.dayBoundaryTime))}</strong><span>睡眠（仮眠込み）</span></section>
        <section className="card"><div className="section-title"><h2>今期の変動費</h2></div><div className="budget-bar"><div style={{ width: `${Math.min(100, settings.variableExpenseBudget ? spent / settings.variableExpenseBudget * 100 : 0)}%` }} /></div><div className="metric-row"><div><span>使用</span><strong>{money(spent)}</strong></div><div><span>{remaining >= 0 ? "残額" : "超過"}</span><strong>{money(Math.abs(remaining))}</strong></div></div>{period && <p className="hint">{period.start}〜{period.end}</p>}</section>
        <section className="card"><div className="section-title"><h2>最近の記録</h2></div><div className="timeline">{recent.map((item) => {
          const metric = sleepMetrics(item, byDate.get(addDays(item.date, -1)), settings.dayBoundaryTime);
          return <button className="timeline-day" key={item.date} onClick={() => { setDate(item.date); setTab("day"); }}><span>{formatDateJa(item.date)}</span><strong>{formatDuration(metric.totalMinutes)}</strong><small>{item.meals.length}食・{money(item.variableExpenseTotal)}</small></button>;
        })}</div></section>
        <section className="card"><div className="section-title"><h2>最近の食事写真</h2></div><div className="photo-grid">{recent.flatMap((item) => item.meals.filter((meal) => meal.photoId).map((meal) => <button key={meal.photoId} onClick={() => { setDate(item.date); setTab("day"); }}><PhotoThumb id={meal.photoId} alt={meal.note || MEAL_LABEL[meal.type]} /><span>{item.date.slice(5)} {MEAL_LABEL[meal.type]}</span></button>))}</div></section>
        <section className="card"><div className="section-title"><h2>顔写真の時系列</h2></div><div className="photo-grid face-history">{recent.filter((item) => item.facePhoto).map((item) => <button key={item.date} onClick={() => { setDate(item.date); setTab("day"); }}><PhotoThumb id={item.facePhoto?.id} alt={`${item.date}の顔写真`} /><span>{item.date.slice(5)}</span></button>)}</div></section>
      </main>}

      {tab === "settings" && <main>
        <section className="card"><div className="section-title"><h2>生活日の設定</h2></div><label className="field"><span>日付の境界</span><select value={settings.dayBoundaryTime} onChange={(event) => void updateSettings({ dayBoundaryTime: event.target.value })}>{["00:00", "03:00", "04:00", "05:00", "06:00"].map((value) => <option key={value}>{value}</option>)}</select></label></section>
        <section className="card"><div className="section-title"><h2>変動費の設定</h2></div><div className="field-grid"><label className="field"><span>今期予算</span><input type="number" min="0" value={settings.variableExpenseBudget} onChange={(event) => void updateSettings({ variableExpenseBudget: Number(event.target.value) })} /></label><label className="field"><span>締め期間の開始日</span><input type="number" min="1" max="31" value={settings.variableExpenseStartDay} onChange={(event) => void updateSettings({ variableExpenseStartDay: Number(event.target.value) })} /></label></div></section>
        <section className="card"><div className="section-title"><h2>バックアップと復元</h2><p>通常JSONに画像本体は含まれません</p></div><div className="stack-actions"><button onClick={() => void exportJson()}>通常データをJSON保存</button><button className="primary" onClick={() => void exportComplete()}>写真を含む完全ZIP保存</button><button onClick={() => jsonInput.current?.click()}>JSONから追加復元</button><button onClick={() => zipInput.current?.click()}>完全ZIPから追加復元</button><button onClick={() => void photoStats().then((value) => setStorageLabel(`${value.count}枚・${(value.bytes / 1024 / 1024).toFixed(1)}MB`))}>写真の保存容量を確認</button></div><p className="hint">{storageLabel || "既存の日付は上書きせず、新しい日だけ追加します。完全ZIPは写真だけ失った場合の復元にも使えます。"}</p>
          <input ref={jsonInput} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJsonFile(file).then((r) => refreshAfterImport(`${r.added}日追加・${r.skipped}日スキップ`)).catch((e) => setStatus(String(e))); }} />
          <input ref={zipInput} hidden type="file" accept="application/zip,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCompleteFile(file).then((r) => refreshAfterImport(`${r.added}日・写真${r.photos}枚を復元`)).catch((e) => setStatus(String(e))); }} />
        </section>
        <section className="privacy-note"><strong>端末内だけに保存</strong><p>ログイン・クラウド同期・Googleカレンダー連携はありません。ブラウザデータを消す前に完全ZIPを保存してください。</p></section>
      </main>}

      <nav className="bottom-nav"><button className={tab === "day" ? "active" : ""} onClick={() => setTab("day")}><span>＋</span>今日</button><button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><span>▥</span>振り返り</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span>設定</button></nav>
    </div>
  );
}
