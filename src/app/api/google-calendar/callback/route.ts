import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_COOKIE,
  GOOGLE_STATE_COOKIE,
  finishGoogleAuthorization,
  googleCalendarConfig,
  googleCookieOptions,
  sealGoogle,
  validateGoogleState,
} from "@/lib/google-calendar-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const config = googleCalendarConfig();
  if (!config)
    return NextResponse.json(
      { error: "Google Calendar setup is missing." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  let response: NextResponse;
  try {
    const cookie = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    if (!cookie) throw Error();
    const state = validateGoogleState(
      cookie,
      request.nextUrl.searchParams.get("state") ?? "",
      config,
    );
    if (request.nextUrl.searchParams.has("error")) throw Error();
    const session = await finishGoogleAuthorization(
        config,
        state,
        request.nextUrl.searchParams.get("code") ?? "",
      ),
      sealed = sealGoogle(session, config.cookieSecret);
    if (sealed.length > 3800) throw Error();
    response = NextResponse.redirect(
      config.origin + "/day/preferences?google=connected",
      303,
    );
    response.cookies.set(GOOGLE_COOKIE, sealed, googleCookieOptions(config));
  } catch {
    response = NextResponse.redirect(
      config.origin + "/day/preferences?google=retry",
      303,
    );
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(GOOGLE_STATE_COOKIE, "", googleCookieOptions(config, 0));
  return response;
}
