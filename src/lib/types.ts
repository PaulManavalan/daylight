import { z } from "zod";

export const priorities = ["high", "medium", "low"] as const;
export const energies = ["high", "medium", "low"] as const;
export const statuses = ["not_started", "in_progress", "stuck", "done"] as const;
export type Priority = typeof priorities[number];
export type Energy = typeof energies[number];
export type TaskStatus = typeof statuses[number];
export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give your task a title.").max(200),
  description: z.string().trim().max(5000),
  subject: z.string().trim().min(1).max(80),
  deadline: z.iso.datetime({ offset: true }).nullable(),
  estimated_minutes: z.number().int().min(5).max(1440),
  remaining_minutes: z.number().int().min(0).max(10080),
  priority: z.enum(priorities),
  energy_level: z.enum(energies).nullable(),
  status: z.enum(statuses),
}).refine(value => value.status === "done" || value.remaining_minutes > 0, {
  message: "Set remaining time, or mark this task as done.", path: ["remaining_minutes"],
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export interface Task extends TaskInput {
  id: string;
  user_id: string;
  actual_minutes: number;
  created_at: string;
  updated_at: string;
}
export interface TaskBlock {
  id: string; user_id: string; task_id: string;
  starts_at: string; ends_at: string;
  state: "planned" | "active" | "completed" | "cancelled";
  locked: boolean; explanation: string; schedule_version: number;
}
export interface ProtectedTime {
  id: string; user_id: string; title: string;
  starts_at: string; ends_at: string;
  source: "manual" | "google"; external_id: string | null;
}
export interface CheckIn {
  id: string; user_id: string; task_id: string;
  question: string; response: string | null;
  outcome: TaskStatus | "need_more_time" | null;
  added_minutes: number; resulting_action: Record<string, unknown>;
  created_at: string; answered_at: string | null;
}
export interface Preferences {
  user_id: string; timezone: string;
  daily_capacity_minutes: number; block_minutes: number; break_minutes: number;
  work_windows: { day: number; start: string; end: string; energy: Energy }[];
  check_ins_enabled: boolean;
}
export const statusLabels: Record<TaskStatus, string> = {
  not_started: "Not started", in_progress: "In progress", stuck: "Stuck", done: "Done",
};
