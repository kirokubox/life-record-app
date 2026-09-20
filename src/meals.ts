import type { Meal, MealType } from "./types.js";

export const MEAL_LABEL: Record<MealType, string> = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食" };
export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// 1日に複数回あり得るのは間食だけ。朝食・昼食・夕食は1日1件に絞る
export function allowsMultiple(type: MealType): boolean {
  return type === "snack";
}

export function canAddMeal(meals: Meal[], type: MealType): boolean {
  return allowsMultiple(type) || !meals.some((meal) => meal.type === type);
}

// 表示順だけを朝→昼→夕→間食に整える。保存されている meals の並びは変えない
export function sortedMeals(meals: Meal[]): Meal[] {
  return meals
    .map((meal, index) => ({ meal, index }))
    .sort((a, b) => {
      const byType = MEAL_ORDER.indexOf(a.meal.type) - MEAL_ORDER.indexOf(b.meal.type);
      return byType !== 0 ? byType : a.index - b.index;
    })
    .map((item) => item.meal);
}
