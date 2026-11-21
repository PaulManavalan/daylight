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
const lines = (text: string) => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export default function PersonalPreferences() {
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
    });
  useEffect(() => {
    void fetch("/api/personal-profile-snapshot", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok)
          setKnownProfile(personalProfileSchema.parse(await response.json()));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (workspace.state && !draft) {
      setDraft(structuredClone(workspace.state));
      setRawFood({
        likes: workspace.state.food.likes.join(", "),
        dislikes: workspace.state.food.dislikes.join(", "),
        allergies: workspace.state.food.allergies.join(", "),
      });
    }
  }, [workspace.state, draft]);
  function food(field: "likes" | "dislikes" | "allergies", value: string) {
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
    });
    setMessage(
      "Confirmed preferences from our chat are filled for review. Your existing allergy answers are preserved; unknown allergies remain unknown. Save after reviewing.",
    );
  }
  function save() {
    if (!draft) return;
    try {
      workspace.save({
        ...draft,
        food: {
          ...draft.food,
          likes: lines(rawFood.likes),
          dislikes: lines(rawFood.dislikes),
          allergies:
            draft.food.allergyStatus === "listed"
              ? lines(rawFood.allergies)
              : [],
        },
      });
      setMessage(
        "Saved in this browser. These preferences will be used in your planning conversations.",
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
          Review and correct what Daylight knows. Settings here are saved only
          in this browser; account sync is still to come.
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
            <p>
              These help with planning. No calorie restriction or weight-loss
              targets are set.
            </p>
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
              This stores your interests. Live news retrieval and the meal
              planner are tracked in the roadmap and are not connected yet.
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
    </main>
  );
}
