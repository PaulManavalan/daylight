import type { Recipe } from "./nutrition";
import {
  recipeRestrictions,
  mealRestrictions,
  type MealPlan,
  type MealCandidate,
  draftMealWeek,
} from "./nutrition";

export interface MealIdea {
  recipe: Recipe;
  publisher: "MedlinePlus" | "Nutrition.gov";
  checkedOn: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  waitMinutes: number | null;
  timingNote: string;
}
type Slot = Recipe["slots"][number];
function idea(
  index: number,
  title: string,
  slug: string,
  publisher: MealIdea["publisher"],
  ingredients: string[],
  servings: number,
  slots: Slot[],
  prep: number | null,
  cook: number | null,
  wait: number | null = 0,
  note = "",
): MealIdea {
  const url =
    publisher === "MedlinePlus"
      ? `https://medlineplus.gov/recipes/${slug}/`
      : `https://www.nutrition.gov/recipes/${slug}`;
  const timingNote =
    note ||
    (wait
      ? `Requires ${wait / 60} hours of chilling in addition to active preparation.`
      : "");
  return {
    publisher,
    checkedOn: "2026-11-21",
    prepMinutes: prep,
    cookMinutes: cook,
    waitMinutes: wait,
    timingNote,
    recipe: {
      id: `7a0e8000-2746-4000-8000-${String(index).padStart(12, "0")}`,
      title,
      ingredients,
      servings,
      slots,
      minutes: prep === null || cook === null ? null : prep + cook,
      sourceUrl: url,
      instructions:
        "Open the linked source for ingredient quantities and the full preparation method. The source recipe yield is not a recommended personal portion.",
      notes: timingNote,
    },
  };
}
/** Curated source metadata, not live search, copied cooking instructions or nutritional prescriptions. */
export const mealIdeas: MealIdea[] = [
  idea(
    1,
    "Overnight Oatmeal",
    "overnight-oatmeal",
    "MedlinePlus",
    [
      "old-fashioned rolled oats",
      "low-fat yogurt",
      "milk (nonfat or reduced-fat)",
      "fresh or frozen berries",
      "apple; other fresh, frozen or canned fruit may be substituted",
    ],
    4,
    ["breakfast"],
    15,
    0,
    360,
    "Prepare ahead: the source lists 6 hours chilling, with 6–12 hours allowed in its directions.",
  ),
  idea(
    2,
    "Breakfast Smoothie",
    "breakfast-smoothie",
    "Nutrition.gov",
    [
      "milk (low-fat or fat-free)",
      "banana",
      "frozen fruit such as blueberries",
      "peanut butter OR sunflower seed butter",
      "spinach",
    ],
    2,
    ["breakfast", "snack"],
    null,
    null,
    null,
    "The source does not state a numeric preparation time.",
  ),
  idea(
    3,
    "Blueberry Tofu Smoothie",
    "blueberry-tofu-smoothie",
    "MedlinePlus",
    [
      "frozen blueberries",
      "banana",
      "vanilla soy milk (almond milk is an optional substitute)",
      "silken tofu",
      "orange juice",
      "lime juice",
    ],
    4,
    ["breakfast", "snack"],
    5,
    0,
  ),
  idea(
    4,
    "Apple Sandwiches",
    "apple-sandwiches",
    "MedlinePlus",
    ["apple", "peanut butter", "raisins"],
    2,
    ["snack"],
    10,
    0,
  ),
  idea(
    5,
    "Black Bean Quesadilla",
    "black-bean-quesadilla",
    "Nutrition.gov",
    [
      "chunky salsa OR pico de gallo",
      "black beans",
      "reduced-fat Colby and Monterey Jack cheese",
      "fresh cilantro",
      "flour tortillas",
      "olive oil",
    ],
    4,
    ["lunch", "dinner"],
    null,
    null,
    null,
    "The source tags this recipe “30 Minutes or Less” but does not give an exact preparation time.",
  ),
  idea(
    6,
    "Rice Bowl Southwestern Style",
    "rice-bowl-southwestern-style",
    "MedlinePlus",
    [
      "vegetable oil",
      "chopped vegetables such as bell peppers, onion, corn, tomato or zucchini",
      "cooked meat OR beans OR tofu",
      "cooked brown rice (other grains may be substituted)",
      "salsa OR shredded cheese OR low-fat sour cream",
      "optional chili powder, red pepper flakes or taco sauce",
    ],
    2,
    ["lunch", "dinner"],
    15,
    10,
  ),
  idea(
    7,
    "Beef and Broccoli",
    "beef-and-broccoli",
    "MedlinePlus",
    [
      "lean ground beef (baked tofu is an optional substitute)",
      "ground ginger",
      "garlic powder",
      "brown sugar",
      "low-sodium soy sauce",
      "cornstarch",
      "sesame oil",
      "red pepper flakes",
      "water",
      "fresh or frozen broccoli",
      "cooked bulgur",
    ],
    7,
    ["dinner"],
    15,
    30,
  ),
  idea(
    8,
    "Salmon Pasta Skillet",
    "salmon-pasta-skillet",
    "MedlinePlus",
    [
      "whole-grain pasta",
      "margarine OR butter",
      "onion",
      "canned salmon OR cooked fresh salmon (tuna or mackerel may be substituted)",
      "tomatoes",
      "lemon juice",
      "fresh OR dried parsley",
      "salt",
    ],
    6,
    ["lunch", "dinner"],
    10,
    20,
  ),
  idea(
    9,
    "Skillet Braised Chicken",
    "skillet-braised-chicken",
    "MedlinePlus",
    [
      "chicken breast",
      "oil",
      "seasoning such as salt, pepper, seasoning salt, onion powder or garlic powder",
    ],
    2,
    ["dinner"],
    5,
    20,
    0,
    "The source includes a 10-minute rest within its stated 25-minute total. This is a main dish; choose sides your family enjoys.",
  ),
  idea(
    10,
    "Chicken and Black Bean Salsa Burritos",
    "chicken-and-black-bean-salsa-burritos",
    "MedlinePlus",
    [
      "black beans (canned or home-cooked)",
      "green onions",
      "lemon juice",
      "ground cumin",
      "salt",
      "boneless skinless chicken breasts",
      "chili powder",
      "pepper",
      "shredded cheddar, pepper jack OR Mexican blend cheese",
      "flour tortillas",
    ],
    8,
    ["lunch", "dinner"],
    20,
    30,
  ),
];
export interface MealPreferences {
  likes: string[];
  dislikes: string[];
  allergies: string[];
  ingredientExceptions?: string[];
  favoriteMeals?: { id: string; title: string; slot: Slot }[];
}
export function eligibleMealIdeas(
  food: MealPreferences,
  hidden: string[] = [],
  query = "",
  slot: Slot | "all" = "all",
  maxMinutes = 120,
) {
  const search = query.trim().toLowerCase();
  return mealIdeas
    .filter(
      (idea) =>
        !hidden.includes(idea.recipe.id) &&
        !mealRestrictions(idea.recipe, food).length &&
        (slot === "all" || idea.recipe.slots.includes(slot)) &&
        (idea.recipe.minutes === null || idea.recipe.minutes <= maxMinutes) &&
        (!search ||
          (idea.recipe.title + " " + idea.recipe.ingredients.join(" "))
            .toLowerCase()
            .includes(search)),
    )
    .sort(
      (a, b) =>
        recipeRestrictions(b.recipe, food.likes).length -
        recipeRestrictions(a.recipe, food.likes).length,
    );
}
export function combinedMealChoices(
  saved: Recipe[],
  food: MealPreferences,
  hidden: string[] = [],
  maxMinutes = 120,
): MealCandidate[] {
  const hiddenTitles = new Set(
    mealIdeas
      .filter((idea) => hidden.includes(idea.recipe.id))
      .map((idea) => idea.recipe.title.toLowerCase()),
  );
  saved = saved.filter(
    (recipe) =>
      !hidden.includes(recipe.id) &&
      !hiddenTitles.has(recipe.title.toLowerCase()),
  );
  const keys = new Set(
    saved.map((recipe) => recipe.title.trim().toLowerCase()),
  );
  const favorites = (food.favoriteMeals ?? [])
    .filter((meal) => !keys.has(meal.title.toLowerCase()))
    .map((meal) => ({
      id: meal.id,
      title: meal.title,
      ingredients: [],
      slots: [meal.slot],
      minutes: null,
    }));
  for (const favorite of favorites) keys.add(favorite.title.toLowerCase());
  return [
    ...saved,
    ...favorites,
    ...eligibleMealIdeas(food, hidden, "", "all", maxMinutes)
      .map((idea) => idea.recipe)
      .filter((recipe) => !keys.has(recipe.title.toLowerCase())),
  ];
}
export function suggestMealWeek(
  date: string,
  saved: Recipe[],
  food: MealPreferences,
  hidden: string[] = [],
  maxMinutes = 120,
) {
  const choices = combinedMealChoices(saved, food, hidden, maxMinutes),
    result = draftMealWeek(date, choices, food, maxMinutes);
  const actualRecipes = new Set(
    [...saved, ...mealIdeas.map((idea) => idea.recipe)].map(
      (recipe) => recipe.id,
    ),
  );
  result.plan.recipeIds = result.plan.recipeIds.filter((id) =>
    actualRecipes.has(id),
  );
  return { ...result, choices };
}
export function swapPlannedMeal(
  plan: MealPlan,
  date: string,
  slot: Slot,
  choices: MealCandidate[],
  food: MealPreferences,
) {
  const day = plan.days.find((day) => day.date === date);
  if (!day) throw new Error("Choose a day in the current meal plan.");
  const eligible = choices.filter(
    (recipe) =>
      recipe.slots.includes(slot) && !mealRestrictions(recipe, food).length,
  );
  if (eligible.length < 2) return null;
  const current = eligible.findIndex(
      (recipe) => recipe.title.toLowerCase() === day.slots[slot].toLowerCase(),
    ),
    recipe = eligible[(current + 1) % eligible.length];
  return {
    ...plan,
    days: plan.days.map((day) =>
      day.date === date
        ? { ...day, slots: { ...day.slots, [slot]: recipe.title } }
        : day,
    ),
  };
}
