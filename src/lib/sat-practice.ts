import { z } from "zod";

export interface PracticeQuestion {
  id: string;
  section: "math" | "reading_writing";
  skill: string;
  prompt: string;
  choices: [string, string, string, string];
  answer: number;
  explanation: string;
}
// Original Daylight questions, versioned so saved attempts remain interpretable.
export const practiceQuestions: PracticeQuestion[] = [
  {
    id: "linear-v1",
    section: "math",
    skill: "Linear equations",
    prompt: "If 3(2x − 5) = 27, what is x?",
    choices: ["2", "7", "9", "14"],
    answer: 1,
    explanation:
      "Distribute: 6x − 15 = 27. Add 15 to get 6x = 42, then divide by 6: x = 7. Substitution gives 3(14 − 5) = 27.",
  },
  {
    id: "system-v1",
    section: "math",
    skill: "Linear equations",
    prompt: "The equations y = 2x + 1 and x + y = 10 hold. What is y?",
    choices: ["3", "5", "7", "9"],
    answer: 2,
    explanation:
      "Substitute 2x + 1 for y: x + 2x + 1 = 10. Thus x = 3 and y = 7. Check: 3 + 7 = 10.",
  },
  {
    id: "slope-v1",
    section: "math",
    skill: "Linear equations",
    prompt: "A line passes through (2, 5) and (6, 13). What is its slope?",
    choices: ["1/2", "2", "3", "4"],
    answer: 1,
    explanation:
      "Slope is change in y divided by change in x: (13 − 5)/(6 − 2) = 8/4 = 2.",
  },
  {
    id: "quadratic-v1",
    section: "math",
    skill: "Quadratics",
    prompt: "What is the larger solution to x² − 7x + 12 = 0?",
    choices: ["−4", "−3", "3", "4"],
    answer: 3,
    explanation:
      "Factor: (x − 3)(x − 4) = 0. The solutions are 3 and 4, so the larger is 4.",
  },
  {
    id: "vertex-v1",
    section: "math",
    skill: "Quadratics",
    prompt: "The function f(x) = (x − 4)² + 9 has what minimum value?",
    choices: ["4", "9", "13", "25"],
    answer: 1,
    explanation:
      "A square is nonnegative. Its smallest value is 0, reached when x = 4. Therefore f(4) = 9.",
  },
  {
    id: "percent-v1",
    section: "math",
    skill: "Ratios and percentages",
    prompt:
      "A jacket costs $80 before a 25% discount. Sales tax of 10% is then applied to the discounted price. What is the final price?",
    choices: ["$60", "$64", "$66", "$68"],
    answer: 2,
    explanation:
      "The discounted price is 80 × 0.75 = 60 dollars. Apply tax to that price: 60 × 1.10 = 66 dollars. The percentage changes use different bases.",
  },
  {
    id: "ratio-v1",
    section: "math",
    skill: "Ratios and percentages",
    prompt:
      "A mixture contains blue and white paint in a ratio of 3 to 5 by volume. How many liters of blue paint are in 24 liters of the mixture?",
    choices: ["8", "9", "15", "16"],
    answer: 1,
    explanation:
      "There are 3 + 5 = 8 equal parts. Each part is 24/8 = 3 liters. Blue paint occupies 3 parts, or 9 liters.",
  },
  {
    id: "transition-v1",
    section: "reading_writing",
    skill: "Transitions",
    prompt:
      "The first prototype was inexpensive to produce. _____, it broke after only a few uses. Which transition best signals the contrast?",
    choices: ["Similarly", "For example", "However", "Therefore"],
    answer: 2,
    explanation:
      "However signals a contrast between low production cost and poor durability. Similarly suggests agreement, for example introduces an illustration, and therefore signals a consequence.",
  },
  {
    id: "boundary-v1",
    section: "reading_writing",
    skill: "Sentence boundaries",
    prompt:
      "Which option correctly joins these two independent clauses? “The observatory opened in June” and “its first public tour sold out.”",
    choices: [
      "The observatory opened in June, its first public tour sold out.",
      "The observatory opened in June; its first public tour sold out.",
      "The observatory opened in June its first public tour sold out.",
      "The observatory opened in June; and its first public tour sold out.",
    ],
    answer: 1,
    explanation:
      "A semicolon can join two closely related independent clauses. A comma alone produces a comma splice; no punctuation produces a run-on. Here, and should be preceded by a comma rather than the semicolon offered.",
  },
  {
    id: "evidence-v1",
    section: "reading_writing",
    skill: "Evidence and inference",
    prompt:
      "A researcher counted seedlings in two plots. The shaded plot contained 18 seedlings, while the sunny plot contained 11. Both plots had the same area. Which statement is directly supported by these observations?",
    choices: [
      "Shade always causes more seedlings to grow.",
      "The shaded plot had more seedlings per unit area than the sunny plot.",
      "The sunny plot received less rain.",
      "All seedlings survive better in shade.",
    ],
    answer: 1,
    explanation:
      "With equal areas, the plot with 18 seedlings has more seedlings per unit area than the plot with 11. The observations do not establish causation, rainfall, or survival rates.",
  },
];
export const practiceAttemptSchema = z.object({
  id: z.uuid(),
  questionId: z.enum(
    practiceQuestions.map((q) => q.id) as [string, ...string[]],
  ),
  date: z.iso.datetime(),
  choice: z.number().int().min(0).max(3),
  seconds: z.number().int().min(0).max(86400),
});
export type PracticeAttempt = z.infer<typeof practiceAttemptSchema>;
export function gradeAttempt(attempt: PracticeAttempt) {
  const parsed = practiceAttemptSchema.parse(attempt);
  const question = practiceQuestions.find((q) => q.id === parsed.questionId);
  if (!question) throw Error("This practice question version is unavailable.");
  return { question, correct: parsed.choice === question.answer };
}
export function choosePractice(
  attempts: PracticeAttempt[],
  skill: string,
  count = 4,
) {
  const eligible = practiceQuestions.filter(
    (q) => skill === "all" || q.skill === skill,
  );
  return [...eligible]
    .sort((a, b) => {
      const aa = attempts.filter((x) => x.questionId === a.id),
        bb = attempts.filter((x) => x.questionId === b.id);
      // New items first; then revisit the most recently incorrect item before correct items.
      const rank = (rows: PracticeAttempt[]) =>
        rows.length === 0
          ? 0
          : gradeAttempt(rows[rows.length - 1]).correct
            ? 2
            : 1;
      return (
        rank(aa) - rank(bb) || aa.length - bb.length || a.id.localeCompare(b.id)
      );
    })
    .slice(0, Math.max(1, Math.min(10, count)));
}
export function practiceSummary(attempts: PracticeAttempt[]) {
  const skills = new Map<
    string,
    { skill: string; attempts: number; correct: number; seconds: number }
  >();
  for (const a of attempts) {
    const { question, correct } = gradeAttempt(a),
      row = skills.get(question.skill) ?? {
        skill: question.skill,
        attempts: 0,
        correct: 0,
        seconds: 0,
      };
    row.attempts++;
    row.correct += Number(correct);
    row.seconds += a.seconds;
    skills.set(question.skill, row);
  }
  return [...skills.values()].sort(
    (a, b) =>
      a.correct / a.attempts - b.correct / b.attempts ||
      a.skill.localeCompare(b.skill),
  );
}
