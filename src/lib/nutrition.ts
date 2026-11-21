import { z } from "zod";
export const mealSlots = ["breakfast", "lunch", "dinner", "snack"] as const;
export const recipeSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  ingredients: z.array(z.string().trim().min(1).max(160)).min(1).max(60),
  instructions: z.string().trim().max(6000),
  minutes: z.number().int().min(1).max(480).nullable(),
  servings: z.number().int().min(1).max(20),
  sourceUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "Use an https recipe link.")
    .nullable(),
  slots: z.array(z.enum(mealSlots)).min(1).max(4),
  notes: z.string().max(1000),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type MealCandidate = Pick<
  Recipe,
  "id" | "title" | "ingredients" | "slots" | "minutes"
>;
export const foodEntrySchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    slot: z.enum(mealSlots),
    title: z.string().trim().min(1).max(200),
    serving: z.string().trim().max(120),
    calories: z.number().min(0).max(10000).nullable(),
    protein: z.number().min(0).max(500).nullable(),
    nutritionSource: z.string().trim().max(300),
    note: z.string().trim().max(1000),
  })
  .refine(
    (entry) =>
      (entry.calories === null && entry.protein === null) ||
      entry.nutritionSource.length > 0,
    "Say where the optional nutrition values came from.",
  );
export type FoodEntry = z.infer<typeof foodEntrySchema>;
export const mealPlanSchema = z
  .object({
    week: z.iso.date(),
    days: z
      .array(
        z.object({
          date: z.iso.date(),
          slots: z.object({
            breakfast: z.string().max(160),
            lunch: z.string().max(160),
            dinner: z.string().max(160),
            snack: z.string().max(160),
          }),
        }),
      )
      .length(7),
    recipeIds: z.array(z.uuid()).max(28),
  })
  .refine(
    (plan) =>
      weekDates(plan.week).every(
        (date, index) => plan.days[index].date === date,
      ) && plan.week === plan.days[0].date,
    "The plan must contain one consecutive Monday-to-Sunday week.",
  );
export type MealPlan = z.infer<typeof mealPlanSchema>;
export const nutritionSchema = z
  .object({
    recipes: z.array(recipeSchema).max(200),
    journal: z.array(foodEntrySchema).max(2000),
    plans: z.array(mealPlanSchema).max(26),
    hiddenIdeas: z.array(z.uuid()).max(200).default([]),
  })
  .refine(
    (state) =>
      new Set(state.recipes.map((r) => r.id)).size === state.recipes.length &&
      new Set(state.journal.map((r) => r.id)).size === state.journal.length &&
      new Set(state.plans.map((p) => p.week)).size === state.plans.length,
    "Saved record identities must be unique.",
  );
export type NutritionState = z.infer<typeof nutritionSchema>;
export const emptyNutrition = (): NutritionState => ({
  recipes: [],
  journal: [],
  plans: [],
  hiddenIdeas: [],
});
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekDates(date: string) {
  if (!z.iso.date().safeParse(date).success)
    throw new Error("Choose a real week date.");
  const start = new Date(date + "T12:00:00");
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    return localDate(day);
  });
}
export function emptyMealPlan(date: string): MealPlan {
  const dates = weekDates(date);
  return {
    week: dates[0],
    days: dates.map((date) => ({
      date,
      slots: { breakfast: "", lunch: "", dinner: "", snack: "" },
    })),
    recipeIds: [],
  };
}
function words(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Conservative ingredient matching, not certification that a recipe is allergen-free. */
export function recipeRestrictions(
  recipe: Pick<Recipe, "title" | "ingredients">,
  avoid: string[],
) {
  const text =
    " " + words(recipe.title + " " + recipe.ingredients.join(" ")) + " ";
  return avoid.filter((item) => {
    const value = words(item);
    return (
      value &&
      [value, value.endsWith("s") ? value.slice(0, -1) : value + "s"].some(
        (term) => text.includes(" " + term + " "),
      )
    );
  });
}
export interface MealFoodPreferences {
  likes?: string[];
  dislikes: string[];
  allergies: string[];
  ingredientExceptions?: string[];
}
export function mealRestrictions(
  recipe: Pick<Recipe, "title" | "ingredients">,
  food: MealFoodPreferences,
) {
  const exceptions = new Set(
    (food.ingredientExceptions ?? []).map((value) =>
      words(value).replace(/s$/, ""),
    ),
  );
  const ingredientAvoid = food.dislikes.filter(
    (value) => !exceptions.has(words(value).replace(/s$/, "")),
  );
  return [
    ...new Set([
      ...recipeRestrictions(
        { title: recipe.title, ingredients: [] },
        food.dislikes,
      ),
      ...recipeRestrictions(recipe, [...ingredientAvoid, ...food.allergies]),
    ]),
  ];
}
export function draftMealWeek(
  date: string,
  recipes: MealCandidate[],
  food: MealFoodPreferences,
  maxMinutes = 120,
) {
  const plan = emptyMealPlan(date),
    eligible = recipes
      .filter(
        (recipe) =>
          !mealRestrictions(recipe, food).length &&
          (recipe.minutes === null || recipe.minutes <= maxMinutes),
      )
      .sort(
        (a, b) =>
          recipeRestrictions(b, food.likes ?? []).length -
          recipeRestrictions(a, food.likes ?? []).length,
      ),
    selected = new Set<string>(),
    missing = new Set<string>();
  for (const [index, day] of plan.days.entries())
    for (const slot of mealSlots) {
      const choices = eligible.filter((recipe) => recipe.slots.includes(slot));
      if (!choices.length) {
        missing.add(slot);
        continue;
      }
      const chosen = choices[index % choices.length];
      day.slots[slot] = chosen.title;
      selected.add(chosen.id);
    }
  plan.recipeIds = [...selected];
  return {
    plan: mealPlanSchema.parse(plan),
    missing: [...missing],
    excluded: recipes.length - eligible.length,
  };
}
export function groceryList(plan: MealPlan, recipes: Recipe[]) {
  const used = new Set(
    plan.days.flatMap((day) => mealSlots.map((slot) => words(day.slots[slot]))),
  );
  const selected = recipes.filter((recipe) => used.has(words(recipe.title)));
  const rows = new Map<string, { ingredient: string; meals: string[] }>();
  for (const recipe of selected)
    for (const ingredient of recipe.ingredients) {
      const key = words(ingredient),
        row = rows.get(key) ?? { ingredient, meals: [] };
      if (!row.meals.includes(recipe.title)) row.meals.push(recipe.title);
      rows.set(key, row);
    }
  return [...rows.values()].sort((a, b) =>
    a.ingredient.localeCompare(b.ingredient),
  );
}
export function foodSummary(entries: FoodEntry[]) {
  return {
    count: entries.length,
    calories: entries.reduce((sum, e) => sum + (e.calories ?? 0), 0),
    protein: entries.reduce((sum, e) => sum + (e.protein ?? 0), 0),
    missingCalories: entries.filter((e) => e.calories === null).length,
    missingProtein: entries.filter((e) => e.protein === null).length,
  };
}
