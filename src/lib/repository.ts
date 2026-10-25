import { z } from "zod";
import { getSupabase } from "./supabase";
import { createDemoTasks } from "./seed";
import { taskInputSchema, type Task, type TaskInput } from "./types";

const storageKey = "daylight.tasks.v1";
const storedTaskSchema = taskInputSchema.safeExtend({
  id: z.string().uuid(), user_id: z.literal("local-demo"), actual_minutes: z.number().int().min(0),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
});
export interface TaskRepository {
  list(): Promise<Task[]>;
  save(input: TaskInput, id?: string): Promise<Task>;
  remove(id: string): Promise<void>;
}
function readLocal(): Task[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const seed = createDemoTasks();
    localStorage.setItem(storageKey, JSON.stringify(seed));
    return seed;
  }
  const result = z.array(storedTaskSchema).safeParse(JSON.parse(raw));
  if (!result.success) throw new Error("Saved demo data could not be read. Export or clear this site's browser storage to start again.");
  return result.data;
}
export function localRepository(): TaskRepository {
  return {
    async list() { return readLocal(); },
    async save(input, id) {
      const parsed = taskInputSchema.parse(input);
      const rows = readLocal();
      const existing = id ? rows.find(row => row.id === id) : undefined;
      if (id && !existing) throw new Error("This task was deleted. Refresh your list.");
      const task: Task = { ...parsed, remaining_minutes: parsed.status === "done" ? 0 : parsed.remaining_minutes,
        id: id ?? crypto.randomUUID(), user_id: "local-demo", actual_minutes: existing?.actual_minutes ?? 0,
        created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      localStorage.setItem(storageKey, JSON.stringify(id ? rows.map(row => row.id === id ? task : row) : [task, ...rows]));
      return task;
    },
    async remove(id) { localStorage.setItem(storageKey, JSON.stringify(readLocal().filter(row => row.id !== id))); },
  };
}
export function cloudRepository(userId: string): TaskRepository {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured.");
  return {
    async list() {
      const { data, error } = await db.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Task[];
    },
    async save(input, id) {
      const parsed = taskInputSchema.parse(input);
      const values = { ...parsed, remaining_minutes: parsed.status === "done" ? 0 : parsed.remaining_minutes };
      const query = id ? db.from("tasks").update(values).eq("id", id).eq("user_id", userId)
        : db.from("tasks").insert({ ...values, user_id: userId });
      const { data, error } = await query.select().single();
      if (error) throw new Error(error.message);
      return data as Task;
    },
    async remove(id) {
      const { error, data } = await db.from("tasks").delete().eq("id", id).eq("user_id", userId).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("Task was already deleted. Refresh your list.");
    },
  };
}
