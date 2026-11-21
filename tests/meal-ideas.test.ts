import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mealIdeas,
  suggestMealWeek,
  swapPlannedMeal,
  eligibleMealIdeas,
} from "../src/lib/meal-ideas";
import {
  mealRestrictions,
  mealSlots,
  recipeSchema,
} from "../src/lib/nutrition";
const food = {
  likes: [],
  dislikes: [],
  allergies: [],
  ingredientExceptions: [],
};
test("a week can be suggested without creating a recipe library first", () => {
  const result = suggestMealWeek("2026-11-21", [], food);
  assert.equal(result.plan.days.length, 7);
  for (const day of result.plan.days)
    for (const slot of mealSlots) assert.ok(day.slots[slot]);
  assert.equal(result.missing.length, 0);
  for (const idea of mealIdeas) {
    assert.equal(recipeSchema.safeParse(idea.recipe).success, true);
    assert.match(
      idea.recipe.sourceUrl!,
      /^https:\/\/(medlineplus\.gov|www\.nutrition\.gov)\//,
    );
    assert.equal("calories" in idea.recipe, false);
  }
});
test("family favorites can appear without fabricated ingredients or recipe references", () => {
  const id = crypto.randomUUID(),
    result = suggestMealWeek("2026-11-21", [], {
      ...food,
      favoriteMeals: [{ id, title: "Family breakfast", slot: "breakfast" }],
    });
  assert.equal(result.plan.days[0].slots.breakfast, "Family breakfast");
  assert.ok(!result.plan.recipeIds.includes(id));
  assert.deepEqual(
    result.choices.find((choice) => choice.id === id)?.ingredients,
    [],
  );
});
test("ingredient exceptions do not override disliked dish names or medical restrictions", () => {
  const preferences = {
    ...food,
    dislikes: ["eggs", "honey"],
    ingredientExceptions: ["eggs"],
  };
  assert.deepEqual(
    mealRestrictions(
      { title: "Pancakes", ingredients: ["flour", "eggs"] },
      preferences,
    ),
    [],
  );
  assert.deepEqual(
    mealRestrictions(
      { title: "Scrambled eggs", ingredients: ["eggs"] },
      preferences,
    ),
    ["eggs"],
  );
  assert.deepEqual(
    mealRestrictions(
      { title: "Pancakes", ingredients: ["eggs"] },
      { ...preferences, allergies: ["eggs"] },
    ),
    ["eggs"],
  );
  assert.deepEqual(
    mealRestrictions({ title: "Sauce", ingredients: ["honey"] }, preferences),
    ["honey"],
  );
});
test("swapping changes only the selected menu slot and hidden ideas stay out of future drafts", () => {
  const initial = suggestMealWeek("2026-11-21", [], food),
    date = initial.plan.days[0].date,
    next = swapPlannedMeal(
      initial.plan,
      date,
      "dinner",
      initial.choices,
      food,
    )!;
  assert.notEqual(next.days[0].slots.dinner, initial.plan.days[0].slots.dinner);
  assert.equal(
    next.days[0].slots.breakfast,
    initial.plan.days[0].slots.breakfast,
  );
  assert.deepEqual(next.days.slice(1), initial.plan.days.slice(1));
  const hidden = mealIdeas[0],
    result = suggestMealWeek("2026-11-21", [hidden.recipe], food, [
      hidden.recipe.id,
    ]);
  assert.ok(
    !result.plan.days.some((day) =>
      Object.values(day.slots).includes(hidden.recipe.title),
    ),
  );
});
test("unknown recipe times stay unknown and overnight preparation is disclosed", () => {
  const unknown = mealIdeas.find(
      (idea) => idea.recipe.title === "Breakfast Smoothie",
    )!,
    overnight = mealIdeas.find(
      (idea) => idea.recipe.title === "Overnight Oatmeal",
    )!;
  assert.equal(unknown.recipe.minutes, null);
  assert.equal(overnight.waitMinutes, 360);
  assert.match(overnight.recipe.notes, /6.hours/);
  assert.ok(
    eligibleMealIdeas(food, [], "", "all", 15).every(
      (idea) => idea.recipe.minutes === null || idea.recipe.minutes <= 15,
    ),
  );
});
