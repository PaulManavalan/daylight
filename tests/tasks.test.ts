import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, sortTasks } from "../src/lib/tasks";
import { localRepository } from "../src/lib/repository";
import { taskInputSchema, type Task, type TaskInput } from "../src/lib/types";

const input: TaskInput = { title: "Essay", description: "Draft", subject: "History", deadline: null, estimated_minutes: 90, remaining_minutes: 60, priority: "high", energy_level: "high", status: "in_progress" };
const row = (id: string, changes: Partial<Task> = {}): Task => ({ ...input, id, user_id: "u1", actual_minutes: 0, created_at: "2026-10-24T12:00:00Z", updated_at: "2026-10-24T12:00:00Z", ...changes });

test("filters combine subject, status, search, and deadline", () => {
  const now = new Date(2026, 9, 24, 12);
  const tasks = [row("1", { deadline: new Date(2026, 9, 24, 17).toISOString() }), row("2", { subject: "Math" }), row("3", { status: "done" })];
  const result = filterTasks(tasks, { subject: "History", status: "in_progress", search: "draft", deadline: "today" }, now);
  assert.deepEqual(result.map(t => t.id), ["1"]);
});
test("overdue excludes completed work; undated work is separate", () => {
  const tasks = [row("late", { deadline: "2026-10-23T17:00:00Z" }), row("done", { deadline: "2026-10-23T17:00:00Z", status: "done" }), row("undated")];
  const filters = { subject: "all", status: "all" as const, search: "" };
  assert.deepEqual(filterTasks(tasks, { ...filters, deadline: "overdue" }, new Date("2026-10-24T12:00:00Z")).map(t => t.id), ["late"]);
  assert.deepEqual(filterTasks(tasks, { ...filters, deadline: "none" }).map(t => t.id), ["undated"]);
});
test("deadline sorting keeps undated work last and does not mutate input", () => {
  const tasks = [row("none"), row("later", { deadline: "2026-10-26T17:00:00Z" }), row("first", { deadline: "2026-10-25T17:00:00Z" })];
  assert.deepEqual(sortTasks(tasks, "deadline").map(t => t.id), ["first", "later", "none"]);
  assert.equal(tasks[0].id, "none");
});
test("task validation rejects malformed deadlines and invalid durations", () => {
  assert.equal(taskInputSchema.safeParse({ ...input, deadline: "tomorrow" }).success, false);
  assert.equal(taskInputSchema.safeParse({ ...input, estimated_minutes: -1 }).success, false);
  assert.equal(taskInputSchema.safeParse({ ...input, remaining_minutes: 1.5 }).success, false);
  assert.equal(taskInputSchema.safeParse({ ...input, title: "  " }).success, false);
});
test("local repository persists create/edit/complete/delete without reseeding an empty inbox", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
  const repo = localRepository();
  assert.equal((await repo.list()).length, 7);
  const created = await repo.save(input);
  assert.equal((await repo.list()).length, 8);
  await repo.save({ ...input, title: "Revised essay", status: "done", remaining_minutes: 60 }, created.id);
  const updated = (await repo.list()).find(t => t.id === created.id)!;
  assert.equal(updated.title, "Revised essay");
  assert.equal(updated.remaining_minutes, 0);
  assert.equal(updated.created_at, created.created_at);
  for (const task of await repo.list()) await repo.remove(task.id);
  assert.deepEqual(await repo.list(), []);
  await assert.rejects(() => repo.save(input, created.id), /deleted/);
});
test('task snapshots reject stale saves and deletes without replacing newer progress',async()=>{
 const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)}});
 const repo=localRepository(),original=await repo.save(input),fresh=await repo.save({...input,remaining_minutes:11},original.id,original);
 await assert.rejects(()=>repo.save({...input,title:'Stale title'},original.id,original),/changed/);await assert.rejects(()=>repo.remove(original.id,original),/changed/);
 const after=(await repo.list()).find(t=>t.id===original.id)!;assert.equal(after.remaining_minutes,11);assert.equal(after.title,input.title);
 await repo.remove(fresh.id,fresh);await assert.rejects(()=>repo.remove(fresh.id,fresh),/changed/);
});
test('empty, malformed and duplicate stored tasks are preserved instead of reseeded',async()=>{
 const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)}});const repo=localRepository();
 for(const raw of ['', 'broken JSON','{}']){memory.set('daylight.tasks.v1',raw);await assert.rejects(()=>repo.list(),/saved tasks/);assert.equal(memory.get('daylight.tasks.v1'),raw);}
 memory.delete('daylight.tasks.v1');const task=(await repo.list())[0],raw=JSON.stringify([task,task]);memory.set('daylight.tasks.v1',raw);await assert.rejects(()=>repo.list(),/saved tasks/);assert.equal(memory.get('daylight.tasks.v1'),raw);
});
test('task writes fail cleanly when browser storage is full',async()=>{
 const memory=new Map<string,string>();let full=false;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{if(full)throw new Error('Quota');memory.set(k,v);}}});const repo=localRepository();await repo.list();const before=memory.get('daylight.tasks.v1');full=true;
 await assert.rejects(()=>repo.save(input),/previous saved data is unchanged/);assert.equal(memory.get('daylight.tasks.v1'),before);
});
