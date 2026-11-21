"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersonalWorkspace } from "./use-personal-workspace";
import {
  draftMealWeek,
  emptyMealPlan,
  foodEntrySchema,
  foodSummary,
  groceryList,
  localDate,
  mealPlanSchema,
  mealSlots,
  recipeRestrictions,
  recipeSchema,
  weekDates,
  type FoodEntry,
  type MealPlan,
  type NutritionState,
  type Recipe,
} from "@/lib/nutrition";
import styles from "./notion-daily-planner.module.css";
type Slot = (typeof mealSlots)[number];
const label = (slot: Slot) => slot[0].toUpperCase() + slot.slice(1);
const number = (value: string) => (value.trim() ? Number(value) : null);
export default function MealWorkspace() {
  const workspace = usePersonalWorkspace(),
    [day, setDay] = useState(""),
    [week, setWeek] = useState(""),
    [plan, setPlan] = useState<MealPlan | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [showNutrition, setShowNutrition] = useState(false);
  const [activeMealDay, setActiveMealDay] = useState(0);
  const [food, setFood] = useState({
      title: "",
      slot: "breakfast" as Slot,
      serving: "",
      calories: "",
      protein: "",
      nutritionSource: "",
      note: "",
    }),
    [editing, setEditing] = useState<string | null>(null);
  const [recipe, setRecipe] = useState({
    title: "",
    ingredients: "",
    instructions: "",
    minutes: "",
    servings: "4",
    sourceUrl: "",
    slots: ["dinner"] as Slot[],
    notes: "",
  });
  const [recipeEditing, setRecipeEditing] = useState<string | null>(null),
    recipeForm = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const today = localDate(new Date());
    setDay(today);
    setWeek(today);
    setActiveMealDay((new Date().getDay() + 6) % 7);
  }, []);
  const state = workspace.state,
    nutrition = state?.nutrition,
    weekKey = week ? weekDates(week)[0] : "";
  useEffect(() => {
    if (weekKey && nutrition)
      setPlan(
        structuredClone(
          nutrition.plans.find((p) => p.week === weekKey) ??
            emptyMealPlan(weekKey),
        ),
      );
  }, [weekKey]);
  useEffect(() => {
    if (weekKey && nutrition && !plan)
      setPlan(
        structuredClone(
          nutrition.plans.find((p) => p.week === weekKey) ??
            emptyMealPlan(weekKey),
        ),
      );
  }, [weekKey, nutrition, plan]);
  const entries = useMemo(
      () => nutrition?.journal.filter((e) => e.date === day) ?? [],
      [nutrition, day],
    ),
    summary = foodSummary(entries),
    groceries = plan && nutrition ? groceryList(plan, nutrition.recipes) : [];
  function save(next: NutritionState, success: string) {
    if (!state) return false;
    try {
      if (workspace.error) throw new Error(workspace.error);
      workspace.save({ ...state, nutrition: next });
      setMessage(success);
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This change could not be saved.",
      );
      return false;
    }
  }
  function addFood() {
    if (!nutrition) return;
    const raw = {
      id: editing ?? crypto.randomUUID(),
      date: day,
      slot: food.slot,
      title: food.title,
      serving: food.serving,
      calories: number(food.calories),
      protein: number(food.protein),
      nutritionSource: food.nutritionSource,
      note: food.note,
    };
    const parsed = foodEntrySchema.safeParse(raw);
    if (!parsed.success) {
      setError(
        "Enter a meal or snack name. If you include nutrition values, use nonnegative numbers and say where they came from.",
      );
      return;
    }
    if (
      save(
        {
          ...nutrition,
          journal: [
            ...nutrition.journal.filter((e) => e.id !== editing),
            parsed.data,
          ],
        },
        editing ? "Food entry updated." : "Food entry saved.",
      )
    ) {
      setEditing(null);
      setFood({
        title: "",
        slot: food.slot,
        serving: "",
        calories: "",
        protein: "",
        nutritionSource: "",
        note: "",
      });
    }
  }
  function editFood(entry: FoodEntry) {
    setDay(entry.date);
    setEditing(entry.id);
    setFood({
      title: entry.title,
      slot: entry.slot,
      serving: entry.serving,
      calories: entry.calories?.toString() ?? "",
      protein: entry.protein?.toString() ?? "",
      nutritionSource: entry.nutritionSource,
      note: entry.note,
    });
    setMessage(
      "Editing " +
        entry.title +
        ". Your previous entry stays saved until you submit.",
    );
  }
  function addRecipe() {
    if (!nutrition) return;
    const parsed = recipeSchema.safeParse({
      id: recipeEditing ?? crypto.randomUUID(),
      ...recipe,
      ingredients: recipe.ingredients
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      minutes: number(recipe.minutes),
      servings: Number(recipe.servings),
      sourceUrl: recipe.sourceUrl.trim() || null,
    });
    if (!parsed.success) {
      setError(
        "Check the recipe: give it a title, ingredients on separate lines, at least one meal type, positive servings and an optional https source link.",
      );
      return;
    }
    if (
      nutrition.recipes.some(
        (r) =>
          r.id !== recipeEditing &&
          r.title.trim().toLowerCase().replace(/\s+/g, " ") ===
            parsed.data.title.toLowerCase().replace(/\s+/g, " "),
      )
    ) {
      setError(
        "A saved recipe already has this name. Choose a distinct name so the grocery list can identify it.",
      );
      return;
    }
    if (
      save(
        {
          ...nutrition,
          recipes: [
            ...nutrition.recipes.filter((r) => r.id !== recipeEditing),
            parsed.data,
          ],
        },
        recipeEditing
          ? "Recipe updated. If you renamed it, review the meal names and grocery list in saved plans."
          : "Recipe saved.",
      )
    ) {
      setRecipeEditing(null);
      setRecipe({
        title: "",
        ingredients: "",
        instructions: "",
        minutes: "",
        servings: "4",
        sourceUrl: "",
        slots: ["dinner"],
        notes: "",
      });
    }
  }
  function editRecipe(saved: Recipe) {
    setRecipeEditing(saved.id);
    setRecipe({
      title: saved.title,
      ingredients: saved.ingredients.join("\n"),
      instructions: saved.instructions,
      minutes: saved.minutes?.toString() ?? "",
      servings: saved.servings.toString(),
      sourceUrl: saved.sourceUrl ?? "",
      slots: [...saved.slots],
      notes: saved.notes,
    });
    if (recipeForm.current) {
      recipeForm.current.open = true;
      recipeForm.current.scrollIntoView({ block: "nearest" });
    }
    setMessage(
      "Editing " +
        saved.title +
        ". The saved recipe stays unchanged until you submit.",
    );
  }
  function draftWeek() {
    if (!nutrition || !state || !week) return;
    const next = draftMealWeek(week, nutrition.recipes, state.food);
    setPlan(next.plan);
    setMessage(
      `Drafted from your saved recipes. ${next.excluded} recipes excluded by listed ingredients or the suggested two-hour preparation limit. ${next.missing.length ? "Add saved recipes for " + next.missing.join(", ") + ", or type your family’s meals into the empty slots." : "Review and swap any meal before saving."}`,
    );
    setError("");
  }
  function saveWeek() {
    if (!nutrition || !plan) return;
    const parsed = mealPlanSchema.safeParse(plan);
    if (!parsed.success) {
      setError(
        "Review all seven dates and keep meal names under 160 characters.",
      );
      return;
    }
    save(
      {
        ...nutrition,
        plans: [
          ...nutrition.plans.filter((p) => p.week !== plan.week),
          parsed.data,
        ],
      },
      "Weekly meal plan saved. Meals are not marked eaten or added to your calendar.",
    );
  }
  function updateMeal(index: number, slot: Slot, title: string) {
    if (plan)
      setPlan({
        ...plan,
        days: plan.days.map((day, i) =>
          i === index
            ? { ...day, slots: { ...day.slots, [slot]: title } }
            : day,
        ),
      });
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/day" className={styles.logo}>
          daylight
        </Link>
        <nav className={styles.nav}>
          <Link href="/day/preferences">Food preferences</Link>
          <Link href="/day">← Your day</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>FAMILY MEALS & EVERYDAY ENERGY</p>
        <h1>
          Make room
          <br />
          <em>for good food.</em>
        </h1>
        <p>
          Plan meals your family can make, keep the recipes you like, and
          journal without scores or restrictive targets. Saved only in this
          browser.
        </p>
      </section>
      {(error || workspace.error) && (
        <p role="alert" className={styles.error}>
          {error || workspace.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!state || !day ? (
        <p>Loading your meals…</p>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <h2>Your week</h2>
              <span>Editable family meal plan</span>
            </div>
            <p className={styles.muted}>
              Dislikes: {state.food.dislikes.join(", ") || "not yet saved"}.{" "}
              {state.food.allergyStatus === "unknown"
                ? "Allergies/restrictions have not been confirmed."
                : state.food.allergyStatus === "none"
                  ? "You reported no allergies/restrictions."
                  : "Listed restrictions: " +
                    state.food.allergies.join(", ")}{" "}
              Check ingredients and labels with your family; matching listed
              ingredients is not an allergen-safety certification.
            </p>
            <label>
              Week containing
              <input
                type="date"
                value={week}
                onChange={(e) => {
                  if (e.target.value) {
                    setWeek(e.target.value);
                    setPlan(null);
                  }
                }}
              />
            </label>
            <button disabled={!nutrition?.recipes.length} onClick={draftWeek}>
              Draft from saved recipes
            </button>
            <p className={styles.muted}>
              This uses a simple rotation of your own recipes, filtered by
              listed ingredients and dislikes. It is not AI recipe discovery.
              Blank slots stay blank when nothing fits.
            </p>
            {plan && (
              <>
                <div
                  className={styles.mealDayTabs}
                  aria-label="Choose meal planning day"
                >
                  {plan.days.map((entry, index) => (
                    <button
                      key={entry.date}
                      aria-pressed={activeMealDay === index}
                      onClick={() => setActiveMealDay(index)}
                    >
                      {new Date(entry.date + "T12:00:00").toLocaleDateString(
                        [],
                        { weekday: "short" },
                      )}
                    </button>
                  ))}
                </div>
                <div className={styles.mealGrid}>
                  {plan.days.map((day, index) => (
                    <fieldset
                      key={day.date}
                      data-active={activeMealDay === index}
                    >
                      <legend>
                        {new Date(day.date + "T12:00:00").toLocaleDateString(
                          [],
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </legend>
                      {mealSlots.map((slot) => (
                        <label key={slot}>
                          {label(slot)}
                          <input
                            aria-label={day.date + " " + slot}
                            maxLength={160}
                            list="saved-recipe-names"
                            value={day.slots[slot]}
                            onChange={(e) =>
                              updateMeal(index, slot, e.target.value)
                            }
                          />
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </>
            )}
            <datalist id="saved-recipe-names">
              {nutrition?.recipes.map((r) => (
                <option key={r.id} value={r.title} />
              ))}
            </datalist>
            <button disabled={!plan} onClick={saveWeek}>
              Save weekly plan
            </button>
            <details>
              <summary>Grocery ingredient checklist</summary>
              <p className={styles.muted}>
                From meals matching saved recipe names. Check amounts and
                portions for the whole week; quantities are not multiplied or
                combined. Typed family meals without recipes need their
                ingredients added separately.
              </p>
              {groceries.length ? (
                <ul>
                  {groceries.map((row) => (
                    <li key={row.ingredient}>
                      {row.ingredient} <small>({row.meals.join(", ")})</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Choose saved recipes in your week to build this checklist.
                </p>
              )}
            </details>
          </section>
          <div className={`${styles.layout} ${styles.mealSections}`}>
            <section className={styles.panel}>
              <h2>Food journal</h2>
              <label>
                Journal date
                <input
                  type="date"
                  required
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDay(e.target.value);
                      setEditing(null);
                    }
                  }}
                />
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addFood();
                }}
              >
                <label>
                  Meal or snack
                  <input
                    required
                    maxLength={200}
                    value={food.title}
                    onChange={(e) =>
                      setFood({ ...food, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Meal type
                  <select
                    value={food.slot}
                    onChange={(e) =>
                      setFood({ ...food, slot: e.target.value as Slot })
                    }
                  >
                    {mealSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {label(slot)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Portion or serving (optional)
                  <input
                    maxLength={120}
                    value={food.serving}
                    onChange={(e) =>
                      setFood({ ...food, serving: e.target.value })
                    }
                  />
                </label>
                <details>
                  <summary>
                    Optional nutrition from a label or trusted source
                  </summary>
                  <div className={styles.formGrid}>
                    <label>
                      Calories for this entry
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        step="any"
                        value={food.calories}
                        onChange={(e) =>
                          setFood({ ...food, calories: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Protein, grams for this entry
                      <input
                        type="number"
                        min={0}
                        max={500}
                        step="any"
                        value={food.protein}
                        onChange={(e) =>
                          setFood({ ...food, protein: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Nutrition source
                    <input
                      maxLength={300}
                      value={food.nutritionSource}
                      onChange={(e) =>
                        setFood({ ...food, nutritionSource: e.target.value })
                      }
                      placeholder="Package label, recipe page, or your estimate"
                    />
                  </label>
                  <p className={styles.muted}>
                    Use values for the portion you actually logged. Unknown
                    values stay unknown.
                  </p>
                </details>
                <label>
                  Notes (optional)
                  <input
                    maxLength={1000}
                    value={food.note}
                    onChange={(e) => setFood({ ...food, note: e.target.value })}
                  />
                </label>
                <button>{editing ? "Save food changes" : "Log food"}</button>
                {editing && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setEditing(null);
                      setFood({
                        ...food,
                        title: "",
                        serving: "",
                        calories: "",
                        protein: "",
                        nutritionSource: "",
                        note: "",
                      });
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </form>
              <div className={styles.topicChoices}>
                <label>
                  <input
                    type="checkbox"
                    checked={showNutrition}
                    onChange={(e) => setShowNutrition(e.target.checked)}
                  />
                  Show nutrition information I entered
                </label>
              </div>
              {showNutrition && (
                <p>
                  {summary.calories.toLocaleString()} recorded calories ·{" "}
                  {summary.protein.toLocaleString()} g recorded protein.{" "}
                  {summary.missingCalories} entries have unknown calories and{" "}
                  {summary.missingProtein} have unknown protein. These are
                  partial self-reported values, not a daily target or
                  assessment.
                </p>
              )}
              {!entries.length ? (
                <p className={styles.muted}>
                  No food entries for this date yet.
                </p>
              ) : (
                <ul className={styles.foodEntries}>
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <p className={styles.muted}>
                        {label(entry.slot)}
                        {entry.serving ? " · " + entry.serving : ""}
                        {entry.note ? " · " + entry.note : ""}
                      </p>
                      {showNutrition && (
                        <p className={styles.muted}>
                          {entry.calories ?? "Unknown"} calories ·{" "}
                          {entry.protein ?? "Unknown"} g protein ·{" "}
                          {entry.nutritionSource ||
                            "No nutrition source provided"}
                        </p>
                      )}
                      <button
                        className={styles.secondary}
                        onClick={() => editFood(entry)}
                      >
                        Edit {entry.title}
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={() => {
                          if (confirm("Delete this food journal entry?"))
                            save(
                              {
                                ...state.nutrition,
                                journal: state.nutrition.journal.filter(
                                  (e) => e.id !== entry.id,
                                ),
                              },
                              "Food entry deleted.",
                            );
                        }}
                      >
                        Delete {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={styles.panel}>
              <h2>Your recipe collection</h2>
              <p>
                Save family recipes or recipes you find online. Ingredients are
                stored as you enter them; this app does not fetch or verify the
                source page.
              </p>
              <details ref={recipeForm}>
                <summary>Add a recipe</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addRecipe();
                  }}
                >
                  <label>
                    Recipe name
                    <input
                      required
                      maxLength={160}
                      value={recipe.title}
                      onChange={(e) =>
                        setRecipe({ ...recipe, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ingredients (one per line)
                    <textarea
                      required
                      value={recipe.ingredients}
                      maxLength={10000}
                      onChange={(e) =>
                        setRecipe({ ...recipe, ingredients: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Instructions (optional)
                    <textarea
                      maxLength={6000}
                      value={recipe.instructions}
                      onChange={(e) =>
                        setRecipe({ ...recipe, instructions: e.target.value })
                      }
                    />
                  </label>
                  <div className={styles.formGrid}>
                    <label>
                      Preparation minutes (optional)
                      <input
                        type="number"
                        min={1}
                        max={480}
                        value={recipe.minutes}
                        onChange={(e) =>
                          setRecipe({ ...recipe, minutes: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Recipe servings
                      <input
                        required
                        type="number"
                        min={1}
                        max={20}
                        value={recipe.servings}
                        onChange={(e) =>
                          setRecipe({ ...recipe, servings: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Original recipe link (optional)
                    <input
                      type="url"
                      value={recipe.sourceUrl}
                      onChange={(e) =>
                        setRecipe({ ...recipe, sourceUrl: e.target.value })
                      }
                      placeholder="https://…"
                    />
                  </label>
                  <div className={styles.topicChoices}>
                    {mealSlots.map((slot) => (
                      <label key={slot}>
                        <input
                          type="checkbox"
                          checked={recipe.slots.includes(slot)}
                          onChange={(e) =>
                            setRecipe({
                              ...recipe,
                              slots: e.target.checked
                                ? [...recipe.slots, slot]
                                : recipe.slots.filter((s) => s !== slot),
                            })
                          }
                        />
                        {label(slot)}
                      </label>
                    ))}
                  </div>
                  <button>
                    {recipeEditing ? "Save recipe changes" : "Save recipe"}
                  </button>
                </form>
              </details>
              {nutrition?.recipes.length ? (
                <ul className={styles.foodEntries}>
                  {nutrition.recipes.map((saved) => {
                    const avoided = recipeRestrictions(saved, [
                      ...state.food.dislikes,
                      ...state.food.allergies,
                    ]);
                    return (
                      <li key={saved.id}>
                        <strong>{saved.title}</strong>
                        <p className={styles.muted}>
                          {saved.servings} servings ·{" "}
                          {saved.minutes === null
                            ? "Prep time not provided"
                            : saved.minutes + " minutes"}
                          {avoided.length
                            ? " · Excluded from rotation: " + avoided.join(", ")
                            : ""}
                        </p>
                        <details>
                          <summary>Ingredients & instructions</summary>
                          <ul>
                            {saved.ingredients.map((ingredient, i) => (
                              <li key={i}>{ingredient}</li>
                            ))}
                          </ul>
                          <p>
                            {saved.instructions || "No instructions entered."}
                          </p>
                        </details>
                        {saved.sourceUrl && (
                          <p>
                            <a
                              href={saved.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Original recipe ↗
                            </a>
                          </p>
                        )}
                        <button
                          className={styles.secondary}
                          onClick={() => {
                            if (
                              confirm(
                                "Remove this saved recipe? Existing meal-plan names and journal entries will stay.",
                              )
                            )
                              save(
                                {
                                  ...state.nutrition,
                                  recipes: state.nutrition.recipes.filter(
                                    (r) => r.id !== saved.id,
                                  ),
                                },
                                "Recipe removed. Check grocery ingredients for plans that used it.",
                              );
                          }}
                        >
                          Remove {saved.title}
                        </button>
                        <button
                          className={styles.secondary}
                          onClick={() => editRecipe(saved)}
                        >
                          Edit recipe {saved.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.muted}>
                  No recipes saved yet. Start with a family favorite; nothing is
                  prefilled as a food you like.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
