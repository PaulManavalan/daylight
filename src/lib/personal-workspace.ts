import { z } from "zod";
import { calendarSnapshotSchema, emptyCalendars } from "./calendar-transfer";
import { nutritionSchema, emptyNutrition } from "./nutrition";
const foodList = z.array(z.string().trim().min(1).max(80)).max(60);
export const newsTopics = [
  "US",
  "World",
  "Politics",
  "Technology",
  "AI",
  "Business",
  "Science",
  "Sports",
  "Local",
] as const;
export const personalWorkspaceSchema = z.object({
  version: z.literal(1),
  displayName: z.string().trim().max(80),
  food: z
    .object({
      likes: foodList,
      dislikes: foodList,
      allergyStatus: z.enum(["unknown", "none", "listed"]),
      allergies: foodList,
      meals: z.enum(["family", "self", "school", "mixed"]).nullable(),
    })
    .refine(
      (f) =>
        f.allergyStatus === "listed"
          ? f.allergies.length > 0
          : f.allergies.length === 0,
      "List allergies when selected, or choose unknown/none.",
    ),
  news: z.array(z.enum(newsTopics)).min(1).max(9),
  calendars: calendarSnapshotSchema,
  nutrition: nutritionSchema.default(emptyNutrition),
  updatedAt: z.iso.datetime(),
});
export type PersonalWorkspace = z.infer<typeof personalWorkspaceSchema>;
export const personalProfileSchema = personalWorkspaceSchema.pick({
  displayName: true,
  food: true,
  news: true,
});
export const personalWorkspaceKey = "daylight.personal-preview.v1";
export const defaultPersonalWorkspace = (): PersonalWorkspace => ({
  version: 1,
  displayName: "",
  food: {
    likes: [],
    dislikes: [],
    allergyStatus: "unknown",
    allergies: [],
    meals: null,
  },
  news: [...newsTopics.filter((topic) => topic !== "Local")],
  calendars: emptyCalendars(),
  nutrition: emptyNutrition(),
  updatedAt: new Date().toISOString(),
});
interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class PersonalWorkspaceStore {
  constructor(private storage: Storage) {}
  load() {
    const raw = this.storage.getItem(personalWorkspaceKey);
    if (raw === null) return { state: defaultPersonalWorkspace(), raw };
    try {
      return { state: personalWorkspaceSchema.parse(JSON.parse(raw)), raw };
    } catch {
      throw new Error(
        "Your saved personal settings need recovery. They have not been reset or overwritten.",
      );
    }
  }
  save(next: PersonalWorkspace, expected: string | null) {
    const parsed = personalWorkspaceSchema.safeParse({
      ...next,
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success)
      throw new Error(
        "Check the required fields and record limits before saving. Choose a news topic and list restrictions if selected. Your previous personal data is preserved.",
      );
    const valid = parsed.data;
    if (this.storage.getItem(personalWorkspaceKey) !== expected)
      throw new Error(
        "Your settings or calendars changed in another tab. Reload before saving.",
      );
    const raw = JSON.stringify(valid);
    try {
      this.storage.setItem(personalWorkspaceKey, raw);
    } catch {
      throw new Error(
        "This browser could not save your settings. Your previous records are preserved.",
      );
    }
    return { state: valid, raw };
  }
}
