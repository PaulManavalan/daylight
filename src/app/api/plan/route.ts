import { createClient } from "@supabase/supabase-js";
import { aiPlanInput, suggestTaskOrder } from "@/lib/ai-scheduling";

export const runtime = "nodejs";
const requests = new Map<string, { count: number; reset: number }>();
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey || !url || !key) return Response.json({ error: "AI is not configured. Use the local planner." }, { status: 503 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Sign in to use AI assistance." }, { status: 401 });
  const db = createClient(url,key,{ auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const now = Date.now();
  for (const [id, entry] of requests) if (entry.reset < now) requests.delete(id);
  const rate = requests.get(data.user.id) ?? { count: 0, reset: now+60000 };
  if (rate.count >= 5) return Response.json({ error: "Please wait a minute before another AI plan." }, { status: 429 });
  requests.set(data.user.id,{ ...rate,count:rate.count+1 });
  try {
    const body = await request.text();
    if (body.length > 100000) return Response.json({ error: "Planning request is too large." }, { status: 413 });
    const input = aiPlanInput.parse(JSON.parse(body));
    return Response.json({ order: await suggestTaskOrder(input,apiKey) });
  } catch {
    return Response.json({ error: "AI advice unavailable. Use the local planner." }, { status: 422 });
  }
}
