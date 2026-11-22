import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newsTopicSchema } from "@/lib/news";
import { NewsService } from "@/lib/news-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const service = new NewsService(),
  headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    [...params.keys()].some((key) => key !== "topics") ||
    params.getAll("topics").length !== 1
  )
    return NextResponse.json(
      { error: "Choose supported news topics." },
      { status: 400, headers },
    );
  const parsed = z
    .array(newsTopicSchema)
    .min(1)
    .max(9)
    .refine((topics) => new Set(topics).size === topics.length)
    .safeParse((params.get("topics") ?? "").split(","));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose supported news topics." },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(await service.read(parsed.data), { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "The news reader could not finish. Your planner records are unchanged.",
      },
      { status: 503, headers },
    );
  }
}
