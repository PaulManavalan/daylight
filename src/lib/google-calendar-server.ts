import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { notionOwner } from "./notion-server";

export const GOOGLE_COOKIE = "daylight_google_calendar";
export const GOOGLE_STATE_COOKIE = "daylight_google_calendar_state";
export const googleReadScopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
export const googleWriteScope =
  "https://www.googleapis.com/auth/calendar.events";
export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  cookieSecret: string;
  origin: string;
  secure: boolean;
}
export function googleCalendarConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarConfig | null {
  const {
    GOOGLE_CALENDAR_CLIENT_ID: clientId,
    GOOGLE_CALENDAR_CLIENT_SECRET: clientSecret,
    GOOGLE_CALENDAR_REDIRECT_URI: redirectUri,
    GOOGLE_CALENDAR_COOKIE_SECRET: cookieSecret,
  } = env;
  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !cookieSecret ||
    cookieSecret.length < 32
  )
    return null;
  try {
    const url = new URL(redirectUri),
      local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.pathname !== "/api/google-calendar/callback" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      cookieSecret,
      origin: url.origin,
      secure: url.protocol === "https:",
    };
  } catch {
    return null;
  }
}
export function googleCookieOptions(
  config: GoogleCalendarConfig,
  maxAge = 30 * 24 * 60 * 60,
) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax" as const,
    path: "/api/google-calendar",
    maxAge,
  };
}
export function sealGoogle(value: unknown, secret: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      nonce,
    );
  cipher.setAAD(Buffer.from("daylight-google-calendar-v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unsealGoogle(raw: string, secret: string): unknown {
  try {
    if (raw.length > 6000) throw Error();
    const data = Buffer.from(raw, "base64url");
    if (data.length < 29) throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      data.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("daylight-google-calendar-v1"));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new GoogleCalendarError(
      "Reconnect Google Calendar to continue.",
      401,
    );
  }
}
export const googleSessionSchema = z
  .object({
    kind: z.literal("google-calendar"),
    owner: z.string().min(1).max(100),
    accessToken: z.string().min(1).max(2000),
    refreshToken: z.string().min(1).max(2000).optional(),
    accessExpires: z.number().int(),
    expires: z.number().int(),
    scopes: z.array(z.string().max(200)).max(10),
  })
  .strict();
export type GoogleCalendarSession = z.infer<typeof googleSessionSchema>;
const stateSchema = z
  .object({
    kind: z.literal("google-calendar-state"),
    owner: z.string().min(1).max(100),
    nonce: z.string().min(32).max(100),
    verifier: z.string().min(43).max(128),
    write: z.boolean(),
    expires: z.number(),
  })
  .strict();
export function startGoogleAuthorization(
  config: GoogleCalendarConfig,
  owner: string,
  write = false,
  now = Date.now(),
) {
  const nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url"),
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [...googleReadScopes, ...(write ? [googleWriteScope] : [])].join(
      " ",
    ),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return {
    url: url.href,
    cookie: sealGoogle(
      {
        kind: "google-calendar-state",
        owner,
        nonce,
        verifier,
        write,
        expires: now + 600000,
      },
      config.cookieSecret,
    ),
  };
}
export function validateGoogleState(
  raw: string,
  nonce: string,
  config: GoogleCalendarConfig,
  now = Date.now(),
) {
  const parsed = stateSchema.safeParse(unsealGoogle(raw, config.cookieSecret));
  if (!parsed.success)
    throw new GoogleCalendarError(
      "Google sign-in expired. Start the connection again.",
    );
  const state = parsed.data,
    a = Buffer.from(nonce),
    b = Buffer.from(state.nonce);
  if (state.expires < now || a.length !== b.length || !timingSafeEqual(a, b))
    throw new GoogleCalendarError(
      "Google sign-in expired. Start the connection again.",
    );
  return state;
}
export function requireGoogleOrigin(
  request: Request,
  config: GoogleCalendarConfig,
) {
  if (request.headers.get("origin") !== config.origin)
    throw new GoogleCalendarError(
      "Open Daylight at its primary address before using this connection.",
      403,
    );
}
export async function googleCalendarOwner(request: Request) {
  const owner = await notionOwner(request);
  if (owner === "local-demo") {
    const authority = request.headers.get("host");
    let local = false;
    try {
      const url = new URL(request.url),
        actual = new URL(url.protocol + "//" + authority);
      local =
        process.env.VERCEL !== "1" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname) &&
        actual.host === authority;
    } catch {}
    if (!local)
      throw new GoogleCalendarError(
        "Sign in to Daylight before connecting your calendar on the hosted app.",
        401,
      );
  }
  return owner;
}
export function readGoogleSession(
  raw: string | undefined,
  config: GoogleCalendarConfig,
  owner: string,
  now = Date.now(),
) {
  if (!raw) return null;
  const parsed = googleSessionSchema.safeParse(
    unsealGoogle(raw, config.cookieSecret),
  );
  return parsed.success &&
    parsed.data.owner === owner &&
    parsed.data.expires > now
    ? parsed.data
    : null;
}
export async function googleJSON(
  response: Response,
  limit = 1_500_000,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new GoogleCalendarError("Google returned an empty response.", 502);
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new GoogleCalendarError(
        "The calendar result is too large. Choose a smaller date range.",
        413,
      );
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data as Record<string, unknown>;
  } catch {
    throw new GoogleCalendarError(
      "Google returned an unreadable response. Your saved calendar is unchanged.",
      502,
    );
  }
}
async function googleToken(
  config: GoogleCalendarConfig,
  body: Record<string, string>,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...body,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new GoogleCalendarError(
      "Google sign-in could not finish. Reconnect and try again.",
      502,
    );
  }
  const data = await googleJSON(response, 20000);
  if (!response.ok)
    throw new GoogleCalendarError(
      "Google authorization expired or was not accepted. Reconnect your calendar.",
      401,
    );
  return data;
}
const tokenSchema = z.object({
  access_token: z.string().min(1).max(2000),
  refresh_token: z.string().min(1).max(2000).optional(),
  expires_in: z.number().int().positive().max(86400),
  scope: z.string().max(2000).optional(),
  token_type: z.string().optional(),
});
export async function finishGoogleAuthorization(
  config: GoogleCalendarConfig,
  state: ReturnType<typeof validateGoogleState>,
  code: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (!code || code.length > 3000)
    throw new GoogleCalendarError(
      "Google returned an invalid sign-in response.",
    );
  const data = tokenSchema.parse(
      await googleToken(
        config,
        {
          grant_type: "authorization_code",
          code,
          redirect_uri: config.redirectUri,
          code_verifier: state.verifier,
        },
        fetcher,
      ),
    ),
    scopes = (data.scope ?? "").split(" ").filter(Boolean);
  if (
    !googleReadScopes.every((scope) => scopes.includes(scope)) ||
    (state.write && !scopes.includes(googleWriteScope))
  )
    throw new GoogleCalendarError(
      "The requested calendar permissions were not granted. Start again and review the permission choices.",
      403,
    );
  return googleSessionSchema.parse({
    kind: "google-calendar",
    owner: state.owner,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpires: now + data.expires_in * 1000,
    expires: now + 30 * 24 * 60 * 60 * 1000,
    scopes,
  });
}
export class GoogleCalendarClient {
  changed = false;
  constructor(
    public session: GoogleCalendarSession,
    private config: GoogleCalendarConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async refresh() {
    if (!this.session.refreshToken)
      throw new GoogleCalendarError(
        "Reconnect Google Calendar to renew access.",
        401,
      );
    const data = tokenSchema.parse(
      await googleToken(
        this.config,
        {
          grant_type: "refresh_token",
          refresh_token: this.session.refreshToken,
        },
        this.fetcher,
      ),
    );
    this.session = googleSessionSchema.parse({
      ...this.session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.session.refreshToken,
      accessExpires: Date.now() + data.expires_in * 1000,
      ...(data.scope ? { scopes: data.scope.split(" ").filter(Boolean) } : {}),
    });
    this.changed = true;
  }
  async call(path: string, method = "GET", body?: unknown, etag?: string) {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("..") ||
      path.includes("#")
    )
      throw new GoogleCalendarError("Invalid Google Calendar request.");
    const url = new URL("https://www.googleapis.com/calendar/v3" + path);
    if (
      url.origin !== "https://www.googleapis.com" ||
      !url.pathname.startsWith("/calendar/v3/")
    )
      throw new GoogleCalendarError("Invalid calendar destination.");
    if (this.session.expires < Date.now())
      throw new GoogleCalendarError(
        "Reconnect Google Calendar to continue.",
        401,
      );
    if (this.session.accessExpires < Date.now() + 30000) await this.refresh();
    if (method !== "GET" && !this.session.scopes.includes(googleWriteScope))
      throw new GoogleCalendarError(
        "Enable event editing for this connection first.",
        403,
      );
    const send = async () => {
      try {
        return await this.fetcher(url, {
          method,
          headers: {
            Authorization: "Bearer " + this.session.accessToken,
            "content-type": "application/json",
            ...(etag ? { "If-Match": etag } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
      } catch {
        throw new GoogleCalendarError(
          method === "GET"
            ? "Google Calendar could not be reached. Your saved snapshot is unchanged."
            : "Google may have received this action. Keep this proposal and retry it to check the same event before creating another.",
          502,
        );
      }
    };
    let response = await send();
    if (response.status === 401) {
      await response.body?.cancel();
      await this.refresh();
      response = await send();
    }
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      throw new GoogleCalendarError(
        status === 409
          ? "This calendar action already has an event ID."
          : status === 412
            ? "This event changed in Google Calendar. Refresh and review it again."
            : status === 401
              ? "Reconnect Google Calendar to continue."
              : status === 403
                ? "Google did not allow this action. Check calendar permissions or reconnect."
                : status === 404
                  ? "That calendar or event is no longer available. Refresh your calendar selection."
                  : status === 429
                    ? "Google Calendar is busy. Wait a moment before trying again."
                    : "Google Calendar could not finish this request. Refresh the destination before retrying.",
        status >= 400 && status < 500 ? status : 502,
      );
    }
    if (response.status === 204) return {};
    return googleJSON(response);
  }
}
