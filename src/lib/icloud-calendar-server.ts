import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import {
  ICloudCalendarError,
  icloudCredentialsSchema,
  icloudURL,
} from "./icloud-caldav";
import { notionOwner, NotionError } from "./notion-server";
export async function icloudOwner(request: Request) {
  try {
    return await notionOwner(request);
  } catch (error) {
    throw new ICloudCalendarError(
      "Your Daylight account could not be verified. Sign in or retry before using iCloud.",
      error instanceof NotionError ? error.status : 503,
    );
  }
}
export const ICLOUD_COOKIE = "daylight_icloud_calendar";
export interface ICloudConfig {
  origin: string;
  cookieSecret: string;
  secure: boolean;
}
export function icloudConfig(
  env: Record<string, string | undefined> = process.env,
): ICloudConfig | null {
  const origin = env.ICLOUD_CALENDAR_ORIGIN,
    cookieSecret = env.ICLOUD_CALENDAR_COOKIE_SECRET;
  if (!origin || !cookieSecret || cookieSecret.length < 32) return null;
  try {
    const url = new URL(origin),
      local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" &&
        !(env.VERCEL !== "1" && local && url.protocol === "http:")) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
    return {
      origin: url.origin,
      cookieSecret,
      secure: url.protocol === "https:",
    };
  } catch {
    return null;
  }
}
export const icloudSessionSchema = icloudCredentialsSchema
  .extend({
    kind: z.literal("icloud-calendar"),
    owner: z.string().min(1).max(100),
    principalURL: z.url().max(2048),
    homeURL: z.url().max(2048),
    expires: z.number().int().positive(),
  })
  .strict();
export type ICloudSession = z.infer<typeof icloudSessionSchema>;
export function sealICloud(value: ICloudSession, secret: string) {
  const session = icloudSessionSchema.parse(value);
  icloudURL(session.principalURL);
  icloudURL(session.homeURL);
  const nonce = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      nonce,
    );
  cipher.setAAD(Buffer.from("daylight-icloud-calendar-v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const sealed = Buffer.concat([
    nonce,
    cipher.getAuthTag(),
    encrypted,
  ]).toString("base64url");
  if (sealed.length > 3600)
    throw new ICloudCalendarError(
      "This iCloud connection is too large to store safely in this browser.",
      413,
    );
  return sealed;
}
export function readICloudSession(
  raw: string | undefined,
  config: ICloudConfig,
  owner: string,
  now = Date.now(),
): ICloudSession | null {
  if (!raw) return null;
  try {
    if (raw.length > 6000) throw Error();
    const buffer = Buffer.from(raw, "base64url");
    if (buffer.length < 29) throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(config.cookieSecret).digest(),
      buffer.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("daylight-icloud-calendar-v1"));
    decipher.setAuthTag(buffer.subarray(12, 28));
    const session = icloudSessionSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(buffer.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
    icloudURL(session.principalURL);
    icloudURL(session.homeURL);
    return session.expires <= now || session.owner !== owner ? null : session;
  } catch {
    throw new ICloudCalendarError(
      "Reconnect iCloud Calendar to continue.",
      401,
    );
  }
}
export function icloudCookieOptions(
  config: ICloudConfig,
  maxAge = 30 * 24 * 60 * 60,
) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax" as const,
    path: "/api/icloud-calendar",
    maxAge,
  };
}
export function requireICloudOrigin(request: Request, config: ICloudConfig) {
  if (request.headers.get("origin") !== config.origin)
    throw new ICloudCalendarError(
      "Open Daylight at its primary address before using this iCloud connection.",
      403,
    );
}
