import { z } from "zod";
import { getSupabase } from "./supabase";
import { createDemoTasks } from "./seed";
import { taskInputSchema, type Task, type TaskInput } from "./types";
import {recoverLocalRestore} from './workspace-backup';

const storageKey = "daylight.tasks.v1";
const storedTaskSchema = taskInputSchema.safeExtend({
  id: z.string().uuid(), user_id: z.literal("local-demo"), actual_minutes: z.number().int().min(0),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
});
export interface TaskRepository {
  list(): Promise<Task[]>;
  save(input: TaskInput, id?: string, expected?:Task): Promise<Task>;
  remove(id: string, expected?:Task): Promise<void>;
}
const changed=()=>new Error('This task changed in another tab or was deleted. Reload the task before trying again.');
function checkExpected(current:Task|undefined,expected?:Task){if(expected && (!current || current.id!==expected.id || current.user_id!==expected.user_id || current.updated_at!==expected.updated_at || current.actual_minutes!==expected.actual_minutes || JSON.stringify(taskInputSchema.parse(current))!==JSON.stringify(taskInputSchema.parse(expected))))throw changed();}
function writeLocal(rows:Task[]){try{localStorage.setItem(storageKey,JSON.stringify(rows));}catch{throw new Error('Your task could not be saved because browser storage is unavailable or full. The previous saved data is unchanged.');}}
function readLocal(): Task[] {
  recoverLocalRestore(localStorage);
  const raw = localStorage.getItem(storageKey);
  if (raw===null) {
    const seed = createDemoTasks();
    writeLocal(seed);
    return seed;
  }
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Your saved tasks could not be read. Download a recovery file before restoring a backup. Your saved data has not been reset.');}
  const result = z.array(storedTaskSchema).safeParse(value);
  if (!result.success || new Set(result.data.map(t=>t.id)).size!==result.data.length) throw new Error('Your saved tasks could not be read. Download a recovery file before restoring a backup. Your saved data has not been reset.');
  return result.data;
}
export function localRepository(): TaskRepository {
  return {
    async list() { return readLocal(); },
    async save(input, id, expected) {
      const parsed = taskInputSchema.parse(input);
      const rows = readLocal();
      const existing = id ? rows.find(row => row.id === id) : undefined;
      checkExpected(existing,expected);
      if (id && !existing) throw new Error("This task was deleted. Refresh your list.");
      const task: Task = { ...parsed, remaining_minutes: parsed.status === "done" ? 0 : parsed.remaining_minutes,
        id: id ?? crypto.randomUUID(), user_id: "local-demo", actual_minutes: existing?.actual_minutes ?? 0,
        created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      writeLocal(id ? rows.map(row => row.id === id ? task : row) : [task, ...rows]);
      return task;
    },
    async remove(id,expected) { const rows=readLocal(),current=rows.find(row=>row.id===id);checkExpected(current,expected);if(!current)throw new Error('This task was already deleted. Refresh your list.');writeLocal(rows.filter(row=>row.id!==id)); },
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
    async save(input, id, expected) {
      const parsed = taskInputSchema.parse(input);
      const values = { ...parsed, remaining_minutes: parsed.status === "done" ? 0 : parsed.remaining_minutes };
      if(expected && (expected.id!==id || expected.user_id!==userId))throw changed();
      let query = id ? db.from("tasks").update(values).eq("id", id).eq("user_id", userId)
        : db.from("tasks").insert({ ...values, user_id: userId });
      if(id && expected)query=query.eq('updated_at',expected.updated_at);
      const { data, error } = await query.select().single();
      if (error) {if(expected && error.code==='PGRST116')throw changed();throw new Error(error.message);}
      return data as Task;
    },
    async remove(id,expected) {
      if(expected && (expected.id!==id || expected.user_id!==userId))throw changed();
      let query=db.from("tasks").delete().eq("id",id).eq("user_id",userId);if(expected)query=query.eq('updated_at',expected.updated_at);
      const { error, data } = await query.select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) {if(expected)throw changed();throw new Error("Task was already deleted. Refresh your list.");}
    },
  };
}
