import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  GOOGLE_COOKIE,
  GOOGLE_STATE_COOKIE,
  GoogleCalendarClient,
  GoogleCalendarError,
  googleCalendarConfig,
  googleCalendarOwner,
  googleCookieOptions,
  googleJSON,
  readGoogleSession,
  requireGoogleOrigin,
  sealGoogle,
  startGoogleAuthorization,
  googleWriteScope,
} from "@/lib/google-calendar-server";
import {
  createGoogleEvent,
  editGoogleEvent,
  listGoogleCalendars,
  readGoogleCalendar,
} from "@/lib/google-calendar-operations";
import { googleEventDraftSchema } from "@/lib/google-calendar-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const action = z.discriminatedUnion("op", [
  z
    .object({ op: z.literal("connect"), write: z.boolean().default(false) })
    .strict(),
  z.object({ op: z.literal("disconnect") }).strict(),
  z.object({ op: z.literal("calendars") }).strict(),
  z
    .object({
      op: z.literal("read"),
      calendarId: z.string().min(1).max(1024),
      from: z.iso.datetime(),
      to: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      op: z.literal("create"),
      draft: googleEventDraftSchema,
      approved: z.literal(true),
    })
    .strict(),
  z
    .object({
      op: z.literal("update"),
      draft: googleEventDraftSchema,
      id: z.string().min(1).max(1024),
      etag: z.string().min(1).max(1024),
      approved: z.literal(true),
    })
    .strict(),
  z
    .object({
      op: z.literal("delete"),
      draft: googleEventDraftSchema,
      id: z.string().min(1).max(1024),
      etag: z.string().min(1).max(1024),
      approved: z.literal(true),
      confirmDelete: z.literal(true),
    })
    .strict(),
]);
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ZodError
          ? "The calendar request or response could not be verified. Your previous local data is kept; refresh Google before retrying a write."
          : error instanceof GoogleCalendarError
            ? error.message
            : "The calendar connection could not finish. Your saved data has not been replaced.",
    },
    {
      status: error instanceof GoogleCalendarError ? error.status : 400,
      headers,
    },
  );
}
export async function GET(request: NextRequest) {
  const config = googleCalendarConfig();
  if (!config)
    return NextResponse.json(
      { configured: false, connected: false },
      { headers },
    );
  try {
    const owner = await googleCalendarOwner(request);
    let session;
    try {
      session = readGoogleSession(
        request.cookies.get(GOOGLE_COOKIE)?.value,
        config,
        owner,
      );
    } catch {
      session = null;
    }
    return NextResponse.json(
      {
        configured: true,
        connected: !!session,
        canWrite: session?.scopes.includes(googleWriteScope) ?? false,
      },
      { headers },
    );
  } catch (e) {
    if (e instanceof GoogleCalendarError && e.status === 401)
      return NextResponse.json(
        { configured: true, connected: false, requiresSignIn: true },
        { headers },
      );
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  const config = googleCalendarConfig();
  if (!config)
    return NextResponse.json(
      {
        error:
          "Google Calendar needs its one-time setup on this deployment before it can connect.",
      },
      { status: 503, headers },
    );
  let client: GoogleCalendarClient | undefined;
  try {
    requireGoogleOrigin(request, config);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new GoogleCalendarError("Send a JSON request.", 415);
    const body = action.parse(
        await googleJSON(new Response(request.body), 16000),
      ),
      owner = await googleCalendarOwner(request);
    if (body.op === "connect") {
      const auth = startGoogleAuthorization(config, owner, body.write),
        response = NextResponse.json({ url: auth.url }, { headers });
      response.cookies.set(
        GOOGLE_STATE_COOKIE,
        auth.cookie,
        googleCookieOptions(config, 600),
      );
      return response;
    }
    if (body.op === "disconnect") {
      const response = NextResponse.json({ connected: false }, { headers });
      response.cookies.set(GOOGLE_COOKIE, "", googleCookieOptions(config, 0));
      response.cookies.set(
        GOOGLE_STATE_COOKIE,
        "",
        googleCookieOptions(config, 0),
      );
      return response;
    }
    const session = readGoogleSession(
      request.cookies.get(GOOGLE_COOKIE)?.value,
      config,
      owner,
    );
    if (!session)
      throw new GoogleCalendarError(
        "Connect Google Calendar in this Daylight workspace first.",
        401,
      );
    client = new GoogleCalendarClient(session, config);
    const result =
      body.op === "calendars"
        ? { calendars: await listGoogleCalendars(client) }
        : body.op === "read"
          ? {
              calendar: await readGoogleCalendar(
                client,
                body.calendarId,
                body.from,
                body.to,
              ),
            }
          : body.op === "create"
            ? { receipt: await createGoogleEvent(client, body.draft) }
            : {
                receipt: await editGoogleEvent(
                  client,
                  body.draft,
                  body.id,
                  body.etag,
                  body.op === "delete",
                ),
              };
    const response = NextResponse.json(result, { headers });
    if (client.changed) {
      const cookie = sealGoogle(client.session, config.cookieSecret);
      if (cookie.length > 3800)
        throw new GoogleCalendarError(
          "Reconnect Google Calendar: this session is too large to store safely.",
          401,
        );
      response.cookies.set(GOOGLE_COOKIE, cookie, googleCookieOptions(config));
    }
    return response;
  } catch (e) {
    const response = failure(e);
    if (client?.changed) {
      const cookie = sealGoogle(client.session, config.cookieSecret);
      if (cookie.length <= 3800)
        response.cookies.set(
          GOOGLE_COOKIE,
          cookie,
          googleCookieOptions(config),
        );
    }
    return response;
  }
}
