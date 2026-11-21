import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftMealWeek,
  emptyMealPlan,
  foodEntrySchema,
  foodSummary,
  groceryList,
  recipeRestrictions,
  type Recipe,
} from "../src/lib/nutrition";
import {
  personalWorkspaceSchema,
  defaultPersonalWorkspace,
} from "../src/lib/personal-workspace";
const recipe = (
  title: string,
  ingredients: string[],
  slot: "breakfast" | "lunch" | "dinner" | "snack" = "dinner",
): Recipe => ({
  id: crypto.randomUUID(),
  title,
  ingredients,
  slots: [slot],
  minutes: 20,
  servings: 4,
  instructions: "Family recipe",
  sourceUrl: null,
  notes: "",
});
test("weekly drafts use saved recipes, filter listed dislikes and prioritize matching likes without inventing meals", () => {
  const recipes = [
      recipe("Honey chicken", ["chicken", "honey"]),
      recipe("Rice bowl", ["rice", "beans"]),
      recipe("Egg dish", ["eggs"]),
      recipe("Pasta", ["pasta", "tomato"]),
    ],
    result = draftMealWeek("2026-11-21", recipes, {
      likes: ["pasta"],
      dislikes: ["honey", "eggs"],
      allergies: [],
    });
  assert.equal(result.excluded, 2);
  assert.equal(result.plan.week, "2026-11-16");
  assert.equal(result.plan.days[0].slots.dinner, "Pasta");
  assert.ok(
    result.plan.days.every((d) =>
      ["Pasta", "Rice bowl"].includes(d.slots.dinner),
    ),
  );
  assert.ok(result.plan.days.every((d) => d.slots.breakfast === ""));
  assert.deepEqual(result.missing, ["breakfast", "lunch", "snack"]);
});
test("ingredient matching distinguishes eggs from eggplant, handles plural words and reports explicit restrictions", () => {
  assert.deepEqual(
    recipeRestrictions(recipe("Vegetables", ["eggplant"]), ["eggs"]),
    [],
  );
  assert.deepEqual(
    recipeRestrictions(recipe("Snack", ["peanuts"]), ["peanut"]),
    ["peanut"],
  );
  assert.deepEqual(
    recipeRestrictions(recipe("Omelet", ["egg whites"]), ["eggs"]),
    ["eggs"],
  );
});
test("groceries reflect edited meal names and only include saved recipes currently used", () => {
  const rice = recipe("Rice bowl", ["rice", "beans"]),
    pasta = recipe("Pasta", ["pasta", "tomato"]),
    plan = emptyMealPlan("2026-11-21");
  plan.days[0].slots.dinner = rice.title;
  assert.deepEqual(
    groceryList(plan, [rice, pasta]).map((r) => r.ingredient),
    ["beans", "rice"],
  );
  plan.days[0].slots.dinner = "Family meal";
  assert.deepEqual(groceryList(plan, [rice, pasta]), []);
});
test("nutrition is optional and partial self-reported values require provenance, never a daily target", () => {
  const raw = {
    id: crypto.randomUUID(),
    date: "2026-11-21",
    slot: "lunch",
    title: "Family lunch",
    serving: "one bowl",
    calories: null,
    protein: null,
    nutritionSource: "",
    note: "",
  };
  const unknown = foodEntrySchema.parse(raw);
  assert.equal(
    foodEntrySchema.safeParse({ ...raw, calories: 400 }).success,
    false,
  );
  const known = foodEntrySchema.parse({
    ...raw,
    id: crypto.randomUUID(),
    calories: 400,
    protein: 20,
    nutritionSource: "Package label",
  });
  const summary = foodSummary([unknown, known]);
  assert.deepEqual(summary, {
    count: 2,
    calories: 400,
    protein: 20,
    missingCalories: 1,
    missingProtein: 1,
  });
  assert.equal("target" in summary, false);
});
test("older personal workspaces gain an empty nutrition section without losing preferences or calendars", () => {
  const original = defaultPersonalWorkspace();
  const { nutrition, ...old } = original;
  const loaded = personalWorkspaceSchema.parse({
    ...old,
    food: { ...old.food, dislikes: ["Example dislike"] },
  });
  assert.deepEqual(loaded.nutrition, {
    recipes: [],
    journal: [],
    plans: [],
    hiddenIdeas: [],
  });
  assert.deepEqual(loaded.food.dislikes, ["Example dislike"]);
  assert.deepEqual(loaded.calendars, old.calendars);
});
