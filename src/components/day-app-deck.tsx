"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Dumbbell,
  GraduationCap,
  Newspaper,
  Utensils,
} from "lucide-react";
import type { RunningListSource } from "@/lib/notion-daily-source";
import type { PersonalWorkspace } from "@/lib/personal-workspace";
import type { SatDayReview } from "@/lib/sat-day-review";
import { calendarBusyToday } from "@/lib/calendar-transfer";
import { fitnessActivitiesForDate } from "@/lib/fitness";
import css from "./day-app-deck.module.css";

export default function DayAppDeck({
  source,
  sample,
  personal,
  satReviews,
  day,
  recordStatus = "Loading…",
  satStatus = "Loading…",
}: {
  source: RunningListSource | null;
  sample: boolean;
  personal: PersonalWorkspace | null;
  satReviews: SatDayReview[] | null;
  day: string;
  recordStatus?: string;
  satStatus?: string;
}) {
  let calendarValue = personal ? "Add your calendars" : recordStatus;
  if (personal && personal.calendars.calendars.length && day)
    try {
      const count = calendarBusyToday(
        personal.calendars,
        new Date(day + "T12:00:00"),
      ).length;
      calendarValue = `${count} event${count === 1 ? "" : "s"} today`;
    } catch {
      calendarValue = "Refresh needed";
    }
  const meals = personal?.nutrition.plans
    .flatMap((plan) => plan.days)
    .find((item) => item.date === day)?.slots;
  const mealCount = meals
    ? Object.values(meals).filter((value) => value.trim()).length
    : 0;
  const activities =
    personal && day ? fitnessActivitiesForDate(personal.fitness, day) : [];
  const minutes =
    satReviews?.reduce((sum, review) => sum + review.minutes, 0) ?? 0;
  const cards = [
    {
      label: "Notion",
      icon: BookOpen,
      tone: "amber",
      href: "#running-list",
      value: source
        ? `${source.items.filter((item) => item.yellowHighlighted && item.completion !== "checked").length} chosen for today`
        : "Your running list",
      note: source
        ? sample
          ? "Sample homework"
          : "Saved read · refresh below"
        : "Read and choose your work",
    },
    {
      label: "Calendars",
      icon: CalendarDays,
      tone: "blue",
      href: "/day/preferences#calendar-connections",
      value: calendarValue,
      note: personal?.calendars.calendars.length
        ? "Saved calendar reads · refreshable"
        : "Google & Apple options",
    },
    {
      label: "Meals",
      icon: Utensils,
      tone: "peach",
      href: "/day/meals",
      value: personal
        ? mealCount
          ? `${mealCount} meals planned`
          : "Something you'll enjoy"
        : recordStatus,
      note: "Family meals & your food journal",
    },
    {
      label: "Training",
      icon: Dumbbell,
      tone: "green",
      href: "/day/fitness",
      value: personal
        ? activities.length
          ? `${activities.length} selected today`
          : "Move with a purpose"
        : recordStatus,
      note: "Your sessions & actual progress",
    },
    {
      label: "SAT",
      icon: GraduationCap,
      tone: "purple",
      href: "/day/sat",
      value: satReviews
        ? minutes
          ? `${minutes} min selected`
          : "A little practice"
        : satStatus,
      note: "Make space for your next step",
    },
    {
      label: "News",
      icon: Newspaper,
      tone: "rose",
      href: "/day/news",
      value: "A wider perspective",
      note: "Stories linked to their publishers",
    },
  ];
  return (
    <nav className={css.deck} aria-label="Your day at a glance">
      <div className={css.heading}>
        <span>YOUR DAY, IN ONE PLACE</span>
        <span>
          Explore your spaces <ArrowUpRight size={13} aria-hidden="true" />
        </span>
      </div>
      <div className={css.cards}>
        {cards.map(({ icon: Icon, ...card }) => (
          <Link
            key={card.label}
            href={card.href}
            className={css.card}
            data-tone={card.tone}
          >
            <div className={css.top}>
              <span className={css.icon}>
                <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span>{card.label}</span>
              <ArrowUpRight
                className={css.arrow}
                size={15}
                aria-hidden="true"
              />
            </div>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </Link>
        ))}
      </div>
    </nav>
  );
}
