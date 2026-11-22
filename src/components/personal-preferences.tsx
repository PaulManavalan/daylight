"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePersonalWorkspace } from "./use-personal-workspace";
import {
  newsTopics,
  personalProfileSchema,
  type PersonalWorkspace,
} from "@/lib/personal-workspace";
import styles from "./notion-daily-planner.module.css";
import { mealSlots } from "@/lib/nutrition";
import { WorkspaceBackupControl } from "./workspace-backup";
import { exportLocalWorkspace } from "@/lib/workspace-backup";
import GoogleCalendarPanel from "./google-calendar-panel";
import { useAccountWorkspace } from "./account-workspace-context";
import AccountSyncPanel from "./account-sync-panel";
const lines = (text: string) => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export default function PersonalPreferences() {
  const { account, owner } = useAccountWorkspace();
  const workspace = usePersonalWorkspace();
  const [draft, setDraft] = useState<PersonalWorkspace | null>(null),
    [knownProfile, setKnownProfile] = useState<Pick<
      PersonalWorkspace,
      "displayName" | "food" | "news"
    > | null>(null),
    [message, setMessage] = useState(""),
    [rawFood, setRawFood] = useState({
      likes: "",
      dislikes: "",
      allergies: "",
      ingredientExceptions: "",
    });
  const [rawMeals, setRawMeals] = useState({
    breakfast: "",
    lunch: "",
    dinner: "",
    snack: "",
  });
  useEffect(() => {
    if (account) return;
    void fetch("/api/personal-profile-snapshot", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok)
          setKnownProfile(personalProfileSchema.parse(await response.json()));
      })
      .catch(() => {});
  }, [account]);
  useEffect(() => {
    if (workspace.state && !draft) {
      setDraft(structuredClone(workspace.state));
      setRawFood({
        likes: workspace.state.food.likes.join(", "),
        dislikes: workspace.state.food.dislikes.join(", "),
        allergies: workspace.state.food.allergies.join(", "),
        ingredientExceptions:
          workspace.state.food.ingredientExceptions.join(", "),
      });
      setRawMeals(
        Object.fromEntries(
          mealSlots.map((slot) => [
            slot,
            workspace
              .state!.food.favoriteMeals.filter((meal) => meal.slot === slot)
              .map((meal) => meal.title)
              .join(", "),
          ]),
        ) as typeof rawMeals,
      );
    }
  }, [workspace.state, draft]);
  function food(
    field: "likes" | "dislikes" | "allergies" | "ingredientExceptions",
    value: string,
  ) {
    setRawFood((previous) => ({ ...previous, [field]: value }));
  }
  function reviewKnownProfile() {
    if (!draft || !knownProfile) return;
    setDraft({
      ...draft,
      displayName: knownProfile.displayName || draft.displayName,
      food: {
        ...draft.food,
        meals: knownProfile.food.meals ?? draft.food.meals,
        allergyStatus:
          draft.food.allergyStatus === "unknown"
            ? knownProfile.food.allergyStatus
            : draft.food.allergyStatus,
      },
      news: [...new Set([...draft.news, ...knownProfile.news])],
    });
    setRawFood({
      ...rawFood,
      likes: [
        ...new Set([...lines(rawFood.likes), ...knownProfile.food.likes]),
      ].join(", "),
      dislikes: [
        ...new Set([...lines(rawFood.dislikes), ...knownProfile.food.dislikes]),
      ].join(", "),
      ingredientExceptions: [
        ...new Set([
          ...lines(rawFood.ingredientExceptions),
          ...knownProfile.food.ingredientExceptions,
        ]),
      ].join(", "),
      allergies:
        draft.food.allergyStatus === "unknown"
          ? knownProfile.food.allergies.join(", ")
          : rawFood.allergies,
    });
    setRawMeals(
      Object.fromEntries(
        mealSlots.map((slot) => [
          slot,
          [
            ...new Set([
              ...lines(rawMeals[slot]),
              ...knownProfile.food.favoriteMeals
                .filter((meal) => meal.slot === slot)
                .map((meal) => meal.title),
            ]),
          ].join(", "),
        ]),
      ) as typeof rawMeals,
    );
    setMessage(
      "Confirmed preferences from our chat are filled for review. Existing allergy answers are preserved; previously unknown answers can use your latest confirmation. Save after reviewing.",
    );
  }
  async function save() {
    if (!draft) return;
    try {
      await workspace.save({
        ...workspace.state!,
        displayName: draft.displayName,
        news: draft.news,
        food: {
          ...draft.food,
          likes: lines(rawFood.likes),
          dislikes: lines(rawFood.dislikes),
          ingredientExceptions: lines(rawFood.ingredientExceptions),
          favoriteMeals: mealSlots.flatMap((slot) =>
            lines(rawMeals[slot]).map((title) => ({
              id:
                [
                  ...draft.food.favoriteMeals,
                  ...(knownProfile?.food.favoriteMeals ?? []),
                ].find(
                  (meal) =>
                    meal.slot === slot &&
                    meal.title.toLowerCase() === title.toLowerCase(),
                )?.id ?? crypto.randomUUID(),
              title,
              slot,
            })),
          ),
          allergies:
            draft.food.allergyStatus === "listed"
              ? lines(rawFood.allergies)
              : [],
        },
      });
      setMessage(
        account
          ? "Saved on this device. The account sync status above shows when the upload is confirmed."
          : "Saved in this browser. These preferences will be used in your planning conversations.",
      );
    } catch {
      setMessage("");
    }
  }
  function download() {
    if (!workspace.state) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(workspace.state, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daylight-personal-settings.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/day" className={styles.logo}>
          daylight
        </Link>
        <Link href="/day">← Back to your day</Link>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>PERSONAL, WITH YOUR PERMISSION</p>
        <h1>
          Make this
          <br />
          <em>your Daylight.</em>
        </h1>
        <p>
          Review and correct what Daylight knows.{" "}
          {account
            ? "These records belong to your account; local drafts are kept while syncing."
            : "Settings here are saved in this browser. Sign in to use a separate account workspace."}
        </p>
      </section>
      <section className={styles.panel}>
        {!draft ? (
          <p>Loading your preferences…</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2>About you</h2>
            <label>
              Your name
              <input
                value={draft.displayName}
                maxLength={80}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </label>
            <h2>Food & family meals</h2>
            {knownProfile && (
              <button
                type="button"
                className={styles.secondary}
                onClick={reviewKnownProfile}
              >
                Review preferences from our chat
              </button>
            )}
            <p>These guide your weekly menu and recipe ideas.</p>
            <label>
              Foods you enjoy (comma separated)
              <input
                value={rawFood.likes}
                onChange={(e) => food("likes", e.target.value)}
              />
            </label>
            <label>
              Foods you dislike (comma separated)
              <input
                value={rawFood.dislikes}
                onChange={(e) => food("dislikes", e.target.value)}
              />
            </label>
            <label>
              Dislikes that are okay inside other recipes
              <input
                value={rawFood.ingredientExceptions}
                onChange={(e) => food("ingredientExceptions", e.target.value)}
                placeholder="For example: eggs"
              />
            </label>
            <p className={styles.muted}>
              Use the same ingredient name as in dislikes. This never overrides
              an allergy or medical restriction.
            </p>
            <details>
              <summary>Favorite meals to use in weekly suggestions</summary>
              {mealSlots.map((slot) => (
                <label key={slot}>
                  {slot[0].toUpperCase() + slot.slice(1)} favorites (comma
                  separated)
                  <input
                    value={rawMeals[slot]}
                    onChange={(e) =>
                      setRawMeals({ ...rawMeals, [slot]: e.target.value })
                    }
                  />
                </label>
              ))}
              <p className={styles.muted}>
                Family favorites need no recipe to appear in the plan.
                Ingredients and nutrition remain unknown until you add them.
              </p>
            </details>
            <label>
              Who usually prepares meals?
              <select
                value={draft.food.meals ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    food: {
                      ...draft.food,
                      meals: (e.target.value ||
                        null) as PersonalWorkspace["food"]["meals"],
                    },
                  })
                }
              >
                <option value="">Not specified</option>
                <option value="family">Family meals</option>
                <option value="self">I usually cook</option>
                <option value="school">Mostly school meals</option>
                <option value="mixed">A mix</option>
              </select>
            </label>
            <label>
              Allergies and medical dietary restrictions
              <select
                value={draft.food.allergyStatus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    food: {
                      ...draft.food,
                      allergyStatus: e.target
                        .value as PersonalWorkspace["food"]["allergyStatus"],
                      allergies: [],
                    },
                  })
                }
              >
                <option value="unknown">Not confirmed yet</option>
                <option value="none">I have none</option>
                <option value="listed">I have restrictions to list</option>
              </select>
            </label>
            {draft.food.allergyStatus === "listed" && (
              <label>
                List restrictions
                <input
                  value={rawFood.allergies}
                  onChange={(e) => food("allergies", e.target.value)}
                />
              </label>
            )}
            <h2>Your news interests</h2>
            <div className={styles.topicChoices}>
              {newsTopics.map((topic) => (
                <label key={topic}>
                  <input
                    type="checkbox"
                    checked={draft.news.includes(topic)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        news: e.target.checked
                          ? [...draft.news, topic]
                          : draft.news.filter((t) => t !== topic),
                      })
                    }
                  />
                  {topic}
                </label>
              ))}
            </div>
            <p className={styles.muted}>
              Your interests guide future news retrieval. Meals use your saved
              food preferences.
            </p>
            <button>Save preferences</button>
            <button
              type="button"
              className={styles.secondary}
              onClick={download}
            >
              Export saved settings
            </button>
          </form>
        )}
        {workspace.error && (
          <p role="alert" className={styles.error}>
            {workspace.error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      {workspace.state && (
        <GoogleCalendarPanel
          state={workspace.state}
          save={workspace.save}
          disabled={!!workspace.error}
        />
      )}
      <AccountSyncPanel />
      {!account && (
        <section className={styles.panel} style={{ marginTop: 24 }}>
          <h2>Keep a copy of your Daylight</h2>
          <p>
            Export and restore your local tasks, SAT records, meals, training,
            calendars, preferences and saved daily plans. Your account sign-in
            and connection credentials are excluded.
          </p>
          <WorkspaceBackupControl
            disabled={false}
            onExport={() => {
              try {
                const data = exportLocalWorkspace(localStorage),
                  url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  ),
                  link = document.createElement("a");
                link.href = url;
                link.download = "daylight-workspace.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </section>
      )}
    </main>
  );
}
