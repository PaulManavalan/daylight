import type { Task, TaskInput } from "./types";
export function createDemoTasks(): Task[] {
  const due = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(20, 0, 0, 0); return d.toISOString(); };
  const rows: TaskInput[] = [
    { title: "Draft the history essay", subject: "History", description: "Build an outline, then write the first draft. Start with the causes of the Industrial Revolution.", deadline: due(1), estimated_minutes: 90, remaining_minutes: 60, priority: "high", energy_level: "high", status: "in_progress" },
    { title: "Practice quadratic equations", subject: "Math", description: "Chapter 5, problems 1–15.", deadline: due(0), estimated_minutes: 45, remaining_minutes: 45, priority: "high", energy_level: "high", status: "not_started" },
    { title: "Debug the autonomous routine", subject: "Robotics", description: "Check the turning offset and test on the practice field.", deadline: due(3), estimated_minutes: 60, remaining_minutes: 60, priority: "medium", energy_level: "high", status: "stuck" },
    { title: "Read chapter 7 of The Great Gatsby", subject: "English", description: "Note three passages to discuss in class.", deadline: due(2), estimated_minutes: 40, remaining_minutes: 40, priority: "medium", energy_level: "medium", status: "not_started" },
    { title: "Review cell biology flashcards", subject: "Biology", description: "A quick review of organelles and cell transport.", deadline: due(4), estimated_minutes: 25, remaining_minutes: 25, priority: "low", energy_level: "low", status: "not_started" },
    { title: "Sketch the portfolio homepage", subject: "Personal", description: "Explore a few layouts for the projects section.", deadline: null, estimated_minutes: 45, remaining_minutes: 45, priority: "low", energy_level: "medium", status: "not_started" },
    { title: "Submit the lab report", subject: "Biology", description: "", deadline: due(-1), estimated_minutes: 30, remaining_minutes: 0, priority: "medium", energy_level: "medium", status: "done" },
  ];
  return rows.map((row, index) => ({ ...row, id: crypto.randomUUID(), user_id: "local-demo", actual_minutes: index === 0 ? 30 : 0, created_at: new Date(Date.now() - index * 3600000).toISOString(), updated_at: new Date().toISOString() }));
}
