export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type PhotoKind = "meal" | "face";

export interface PhotoMeta {
  id: string;
  kind: PhotoKind;
  mealId?: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  createdAt: string;
}

export interface StoredPhoto extends PhotoMeta {
  date: string;
  blob: Blob;
}

export interface Meal {
  id: string;
  type: MealType;
  time: string;
  note: string;
  photoId?: string;
}

export interface LifeRecord {
  id: string;
  date: string;
  wakeTime: string;
  bedTime: string;
  napMinutes: number | null;
  legacySleepHours?: number | null;
  meals: Meal[];
  bathTime: string;
  lastSmokingTime: string;
  facePhoto?: PhotoMeta;
  mealPhotos: PhotoMeta[];
  variableExpenseTotal: number | null;
  everydayExpense: number | null;
  regretExpense: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  dayBoundaryTime: string;
  variableExpenseBudget: number;
  variableExpenseStartDay: number;
  version: string;
}

export interface LifeRecordExport {
  appName: "Life Record App";
  version: string;
  exportedAt: string;
  records: LifeRecord[];
  settings: AppSettings;
}
