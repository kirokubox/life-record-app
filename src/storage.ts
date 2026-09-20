import { defaultSettings } from "./calculations";
import type { AppSettings, LifeRecord, StoredPhoto } from "./types";

const DB_NAME = "life-record-app";
const DB_VERSION = 1;
const RECORDS = "records";
const PHOTOS = "photos";
const SETTINGS = "settings";
const SETTINGS_KEY = "app";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("別タブを閉じてから、アプリを開き直してください。"));
  });
  return dbPromise;
}

async function request<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = action(tx.objectStore(storeName));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
    tx.onerror = () => reject(tx.error);
  });
}

export function createEmptyRecord(date: string): LifeRecord {
  const now = new Date().toISOString();
  return {
    id: date, date, wakeTime: "", bedTime: "", napMinutes: null, meals: [], bathTime: "", lastSmokingTime: "",
    mealPhotos: [], variableExpenseTotal: null, everydayExpense: null, regretExpense: null, createdAt: now, updatedAt: now,
  };
}

function normalizeRecord(value: Partial<LifeRecord> & { date: string }): LifeRecord {
  const empty = createEmptyRecord(value.date);
  return {
    ...empty, ...value, id: value.date,
    meals: Array.isArray(value.meals) ? value.meals : [],
    mealPhotos: Array.isArray(value.mealPhotos) ? value.mealPhotos : [],
  };
}

export async function getAllRecords(): Promise<LifeRecord[]> {
  const values = await request<LifeRecord[]>(RECORDS, "readonly", (store) => store.getAll());
  return values.map(normalizeRecord).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getRecord(date: string): Promise<LifeRecord | undefined> {
  const value = await request<LifeRecord | undefined>(RECORDS, "readonly", (store) => store.get(date));
  return value ? normalizeRecord(value) : undefined;
}

export async function saveRecord(record: LifeRecord): Promise<void> {
  await request<IDBValidKey>(RECORDS, "readwrite", (store) => store.put(normalizeRecord(record)));
}

export async function putPhoto(photo: StoredPhoto): Promise<void> {
  await request<IDBValidKey>(PHOTOS, "readwrite", (store) => store.put(photo));
}

export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return request<StoredPhoto | undefined>(PHOTOS, "readonly", (store) => store.get(id));
}

export async function getAllPhotos(): Promise<StoredPhoto[]> {
  return request<StoredPhoto[]>(PHOTOS, "readonly", (store) => store.getAll());
}

export async function deletePhoto(id: string): Promise<void> {
  await request<undefined>(PHOTOS, "readwrite", (store) => store.delete(id));
}

export async function getSettings(): Promise<AppSettings> {
  const value = await request<Partial<AppSettings> | undefined>(SETTINGS, "readonly", (store) => store.get(SETTINGS_KEY));
  return { ...defaultSettings(), ...(value ?? {}) };
}

export async function saveSettings(value: AppSettings): Promise<void> {
  await request<IDBValidKey>(SETTINGS, "readwrite", (store) => store.put(value, SETTINGS_KEY));
}

export async function photoStats(): Promise<{ count: number; bytes: number }> {
  const photos = await getAllPhotos();
  return { count: photos.length, bytes: photos.reduce((sum, photo) => sum + photo.byteSize, 0) };
}
