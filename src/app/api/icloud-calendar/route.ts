import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  ICLOUD_COOKIE,
  icloudConfig,
  icloudCookieOptions,
  readICloudSession,
  requireICloudOrigin,
  sealICloud,
  icloudOwner,
} from "@/lib/icloud-calendar-server";
import {
  ICloudCalDavClient,
  ICloudCalendarError,
  icloudCredentialsSchema,
} from "@/lib/icloud-caldav";
import {
  discoverICloudCalendars,
  listICloudCalendars,
  readICloudCalendar,
} from "@/lib/icloud-calendar-operations";
export const runtime = "nodejs",
  dynamic = "force-dynamic",
  maxDuration = 60;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const actionSchema = z.discriminatedUnion("op", [
  icloudCredentialsSchema.extend({ op: z.literal("connect") }).strict(),
  z.object({ op: z.literal("disconnect") }).strict(),
  z.object({ op: z.literal("calendars") }).strict(),
  z
    .object({
      op: z.literal("read"),
      calendarId: z.url().max(2048),
      from: z.iso.datetime(),
      to: z.iso.datetime(),
      displayTimeZone: z.string().min(1).max(100),
    })
    .strict(),
]);
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ZodError
          ? "Check the iCloud request. Use an Apple app-specific password and a valid calendar window."
          : error instanceof ICloudCalendarError
            ? error.message
            : "iCloud could not finish this request. Your saved calendars are kept.",
    },
    {
      status: error instanceof ICloudCalendarError ? error.status : 400,
      headers,
    },
  );
}
export async function GET(request: NextRequest) {
  const config = icloudConfig();
  if (!config)
    return NextResponse.json(
      { configured: false, connected: false },
      { headers },
    );
  try {
    const owner = await icloudOwner(request);
    let session = null;
    try {
      session = readICloudSession(
        request.cookies.get(ICLOUD_COOKIE)?.value,
        config,
        owner,
      );
    } catch {}
    return NextResponse.json(
      { configured: true, connected: !!session, canWrite: false },
      { headers },
    );
  } catch (error) {
    if (error instanceof ICloudCalendarError && error.status === 401)
      return NextResponse.json(
        { configured: true, connected: false, requiresSignIn: true },
        { headers },
      );
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  const config = icloudConfig();
  if (!config)
    return NextResponse.json(
      {
        error:
          "iCloud Calendar needs its one-time secure setup on this deployment.",
      },
      { status: 503, headers },
    );
  try {
    requireICloudOrigin(request, config);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ICloudCalendarError("Send a JSON calendar request.", 415);
    const reader = request.body?.getReader();
    if (!reader)
      throw new ICloudCalendarError("The calendar request is missing.");
    let raw = "",
      size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 12000) {
        await reader.cancel();
        throw new ICloudCalendarError(
          "The calendar request is too large.",
          413,
        );
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    const action = actionSchema.parse(JSON.parse(raw)),
      owner = await icloudOwner(request);
    if (action.op === "disconnect") {
      const response = NextResponse.json(
        { disconnected: true, remoteRevoked: false },
        { headers },
      );
      response.cookies.set(ICLOUD_COOKIE, "", icloudCookieOptions(config, 0));
      return response;
    }
    if (action.op === "connect") {
      const credentials = icloudCredentialsSchema.parse({
        email: action.email,
        appPassword: action.appPassword,
      });
      const client = new ICloudCalDavClient(credentials, fetch, request.signal),
        discovered = await discoverICloudCalendars(client);
      const session = {
        ...credentials,
        kind: "icloud-calendar" as const,
        owner,
        principalURL: discovered.principalURL,
        homeURL: discovered.homeURL,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      const response = NextResponse.json(
        { connected: true, canWrite: false, calendars: discovered.calendars },
        { headers },
      );
      response.cookies.set(
        ICLOUD_COOKIE,
        sealICloud(session, config.cookieSecret),
        icloudCookieOptions(config),
      );
      return response;
    }
    const session = readICloudSession(
      request.cookies.get(ICLOUD_COOKIE)?.value,
      config,
      owner,
    );
    if (!session)
      throw new ICloudCalendarError(
        "Connect iCloud Calendar before reading events.",
        401,
      );
    const client = new ICloudCalDavClient(
      { email: session.email, appPassword: session.appPassword },
      fetch,
      request.signal,
    );
    if (action.op === "calendars")
      return NextResponse.json(
        { calendars: await listICloudCalendars(client, session.homeURL) },
        { headers },
      );
    return NextResponse.json(
      {
        calendar: await readICloudCalendar(
          client,
          session.homeURL,
          action.calendarId,
          action.from,
          action.to,
          action.displayTimeZone,
        ),
      },
      { headers },
    );
  } catch (error) {
    const response = failure(error);
    if (error instanceof ICloudCalendarError && error.status === 401)
      response.cookies.set(ICLOUD_COOKIE, "", icloudCookieOptions(config, 0));
    return response;
  }
}
