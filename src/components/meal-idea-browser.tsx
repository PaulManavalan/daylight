"use client";
import { useState } from "react";
import { eligibleMealIdeas, type MealPreferences } from "@/lib/meal-ideas";
import { mealSlots, type Recipe } from "@/lib/nutrition";
import styles from "./notion-daily-planner.module.css";
interface Props {
  food: MealPreferences;
  hidden: string[];
  saved: Recipe[];
  onSave: (recipe: Recipe) => void;
  onHide: (id: string) => void;
  onRestore: () => void;
}
export default function MealIdeaBrowser({
  food,
  hidden,
  saved,
  onSave,
  onHide,
  onRestore,
}: Props) {
  const [query, setQuery] = useState(""),
    [slot, setSlot] = useState<(typeof mealSlots)[number] | "all">("all"),
    [minutes, setMinutes] = useState(120);
  const ideas = eligibleMealIdeas(food, hidden, query, slot, minutes);
  return (
    <section className={styles.panel}>
      <div className={styles.sectionTitle}>
        <h2>Find your next meal</h2>
        <span>Curated recipe links</span>
      </div>
      <p>
        Browse this curated collection without entering recipes yourself. Links
        were checked on November 21, 2026. Open the source pages for ingredient
        amounts and preparation steps.
      </p>
      <div className={styles.formGrid}>
        <label>
          Search meals or ingredients
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chicken, noodles, beans…"
          />
        </label>
        <label>
          Meal category
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as typeof slot)}
          >
            <option value="all">All meals</option>
            {mealSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot[0].toUpperCase() + slot.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preparation and cooking time
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            <option value={15}>Up to 15 minutes</option>
            <option value={30}>Up to 30 minutes</option>
            <option value={60}>Up to 60 minutes</option>
            <option value={120}>Up to 2 hours</option>
          </select>
        </label>
      </div>
      <p className={styles.muted}>
        Listed dislikes and restrictions are filtered. Timing can be unknown;
        chilling and waiting are shown separately. Alternatives in source
        ingredient lists still need your review.
      </p>
      <div className={styles.recipeCards}>
        {ideas.map((idea) => {
          const exists = saved.some(
            (recipe) =>
              recipe.id === idea.recipe.id ||
              recipe.title.toLowerCase() === idea.recipe.title.toLowerCase(),
          );
          return (
            <article key={idea.recipe.id} className={styles.ideaCard}>
              <p className={styles.eyebrow}>
                {idea.publisher} · {idea.recipe.slots.join(" / ")}
              </p>
              <h3>{idea.recipe.title}</h3>
              <p className={styles.muted}>
                {idea.recipe.minutes === null
                  ? "Preparation time not stated"
                  : idea.recipe.minutes + " minutes prep + cooking"}{" "}
                · Source recipe makes {idea.recipe.servings} servings
              </p>
              {idea.timingNote && (
                <p className={styles.recipeNote}>{idea.timingNote}</p>
              )}
              <details>
                <summary>Listed ingredients</summary>
                <ul>
                  {idea.recipe.ingredients.map((ingredient, i) => (
                    <li key={i}>{ingredient}</li>
                  ))}
                </ul>
              </details>
              <p>
                <a
                  href={idea.recipe.sourceUrl!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source recipe ↗
                </a>
              </p>
              <button disabled={exists} onClick={() => onSave(idea.recipe)}>
                {exists ? "Saved" : "Save this recipe"}
              </button>
              <button
                className={styles.secondary}
                onClick={() => onHide(idea.recipe.id)}
              >
                Not for me
              </button>
            </article>
          );
        })}
      </div>
      {!ideas.length && (
        <p>
          No matching ideas in this collection. Broaden the search, adjust the
          time limit, or use a family favorite.
        </p>
      )}
      {hidden.length > 0 && (
        <button className={styles.secondary} onClick={onRestore}>
          Restore hidden ideas ({hidden.length})
        </button>
      )}
      <p className={styles.muted}>
        Source yield tells you how much each recipe makes. Review household
        portions and any substitutions with your family.
      </p>
    </section>
  );
}
