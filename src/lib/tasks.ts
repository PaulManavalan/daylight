import type { Task, TaskStatus } from "./types";
export type DeadlineFilter = "all" | "today" | "week" | "overdue" | "none";
export function filterTasks(tasks: Task[], filters: { search: string; subject: string; status: TaskStatus | "all"; deadline: DeadlineFilter }, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).getTime();
  return tasks.filter(task => {
    if (filters.search && !`${task.title} ${task.subject} ${task.description}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.subject !== "all" && task.subject !== filters.subject) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    const due = task.deadline ? Date.parse(task.deadline) : null;
    switch (filters.deadline) {
      case "none": return due === null;
      case "today": return due !== null && due >= dayStart && due < tomorrow;
      case "week": return due !== null && due >= dayStart && due < weekEnd;
      case "overdue": return due !== null && due < now.getTime() && task.status !== "done";
      default: return true;
    }
  });
}
export function sortTasks(tasks: Task[], sort: "deadline" | "priority" | "newest") {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    if (sort === "priority") return rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title);
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    return (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity) || rank[a.priority] - rank[b.priority];
  });
}
export function formatMinutes(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}
