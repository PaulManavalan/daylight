import { readFile } from "node:fs/promises";
import path from "node:path";
import { sameLocalOrigin } from "@/lib/local-model";
import { personalProfileSchema } from "@/lib/personal-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    process.env.VERCEL === "1" ||
    process.env.DAYLIGHT_LOCAL_NOTION_SNAPSHOT !== "1" ||
    !sameLocalOrigin(request)
  )
    return Response.json({ available: false }, { status: 404, headers });
  try {
    const raw = await readFile(
      path.join(
        process.env.DAYLIGHT_LOCAL_DATA_ROOT ?? process.cwd(),
        "artifacts",
        "private-personal-profile.json",
      ),
      "utf8",
    );
    if (raw.length > 50000) throw new Error("Profile too large");
    return Response.json(personalProfileSchema.parse(JSON.parse(raw)), {
      headers,
    });
  } catch {
    return Response.json({ available: false }, { status: 404, headers });
  }
}
