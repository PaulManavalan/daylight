import sax from "sax";
import { z } from "zod";

export class ICloudCalendarError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export const icloudCredentialsSchema = z
  .object({
    email: z.email().max(254),
    appPassword: z
      .string()
      .trim()
      .regex(/^[a-z]{4}(?:-[a-z]{4}){3}$/i),
  })
  .strict();
export type ICloudCredentials = z.infer<typeof icloudCredentialsSchema>;

/** Credentials may travel only to Apple's fixed CalDAV hosts, including discovery redirects. */
export function icloudURL(value: string, base = "https://caldav.icloud.com/") {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new ICloudCalendarError(
      "iCloud returned an invalid calendar address.",
      502,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^(?:caldav|p\d{2,3}-caldav)\.icloud\.com$/.test(url.hostname)
  )
    throw new ICloudCalendarError(
      "iCloud returned an unsupported calendar address.",
      502,
    );
  return url;
}
export interface DavNode {
  uri: string;
  local: string;
  text: string;
  children: DavNode[];
}
export const davName = (uri: string, local: string) => `{${uri}}${local}`;
export const DAV = "DAV:",
  CALDAV = "urn:ietf:params:xml:ns:caldav";
export const xmlText = (node: DavNode): string =>
  node.text + node.children.map(xmlText).join("");
export const davChild = (node: DavNode, uri: string, local: string) =>
  node.children.find((child) => child.uri === uri && child.local === local);
export interface DavResponse {
  href: string;
  properties: Map<string, DavNode>;
}

export function parseDavMultistatus(xml: string): DavResponse[] {
  if (
    Buffer.byteLength(xml, "utf8") > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw new ICloudCalendarError(
      "iCloud's calendar result is too large or contains unsupported declarations.",
      502,
    );
  const parser = sax.parser(true, {
      xmlns: true,
      strictEntities: true,
    } as sax.SAXOptions),
    stack: DavNode[] = [];
  let root: DavNode | null = null,
    nodes = 0;
  parser.onerror = () => {
    throw new ICloudCalendarError(
      "iCloud returned unreadable calendar XML.",
      502,
    );
  };
  parser.ondoctype = () => {
    throw new ICloudCalendarError(
      "iCloud returned unsupported calendar XML.",
      502,
    );
  };
  parser.onopentag = (raw) => {
    const tag = raw as sax.QualifiedTag;
    if (++nodes > 30000 || stack.length >= 40)
      throw new ICloudCalendarError(
        "Choose a smaller iCloud calendar window.",
        413,
      );
    const node: DavNode = {
      uri: tag.uri,
      local: tag.local,
      text: "",
      children: [],
    };
    if (stack.length) stack.at(-1)!.children.push(node);
    else if (root)
      throw new ICloudCalendarError("iCloud returned multiple XML roots.", 502);
    else root = node;
    stack.push(node);
  };
  const text = (value: string) => {
    if (stack.length) stack.at(-1)!.text += value;
  };
  parser.ontext = text;
  parser.oncdata = text;
  parser.onclosetag = () => {
    stack.pop();
  };
  parser.write(xml).close();
  const tree = root as DavNode | null;
  if (!tree || tree.uri !== DAV || tree.local !== "multistatus")
    throw new ICloudCalendarError(
      "iCloud returned an unexpected calendar result.",
      502,
    );
  const rows = tree.children.filter(
    (node) => node.uri === DAV && node.local === "response",
  );
  if (rows.length > 1000)
    throw new ICloudCalendarError(
      "Choose a smaller iCloud calendar window.",
      413,
    );
  return rows.map((row) => {
    const hrefNode = davChild(row, DAV, "href"),
      properties = new Map<string, DavNode>();
    if (!hrefNode || !xmlText(hrefNode).trim())
      throw new ICloudCalendarError(
        "iCloud omitted a calendar resource address.",
        502,
      );
    const status = davChild(row, DAV, "status");
    if (
      status &&
      !/^HTTP\/\d(?:\.\d)? 2\d\d(?:\s|$)/.test(xmlText(status).trim())
    )
      throw new ICloudCalendarError(
        "An iCloud calendar resource changed. Refresh before trying again.",
        409,
      );
    for (const propstat of row.children.filter(
      (node) => node.uri === DAV && node.local === "propstat",
    )) {
      const result = davChild(propstat, DAV, "status"),
        prop = davChild(propstat, DAV, "prop");
      if (!result || !prop)
        throw new ICloudCalendarError(
          "iCloud omitted a calendar property status.",
          502,
        );
      const statusText = xmlText(result).trim();
      if (/^HTTP\/\d(?:\.\d)? 404(?:\s|$)/.test(statusText)) continue;
      if (!/^HTTP\/\d(?:\.\d)? 200(?:\s|$)/.test(statusText))
        throw new ICloudCalendarError(
          "iCloud could not read every requested calendar property.",
          502,
        );
      for (const property of prop.children) {
        const key = davName(property.uri, property.local);
        if (properties.has(key))
          throw new ICloudCalendarError(
            "iCloud returned duplicate calendar properties.",
            502,
          );
        properties.set(key, property);
      }
    }
    return { href: xmlText(hrefNode).trim(), properties };
  });
}
export function escapeDav(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export class ICloudCalDavClient {
  private credentials: ICloudCredentials;
  private deadline = Date.now() + 45000;
  constructor(
    credentials: ICloudCredentials,
    private fetcher: typeof fetch = fetch,
    private signal?: AbortSignal,
  ) {
    this.credentials = icloudCredentialsSchema.parse(credentials);
  }
  async request(
    value: string,
    method: "PROPFIND" | "REPORT" | "GET",
    body?: string,
    depth = "0",
  ) {
    z.enum(["0", "1"]).parse(depth);
    let url = icloudURL(value);
    for (let redirect = 0; redirect < 4; redirect++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0 || this.signal?.aborted)
        throw new ICloudCalendarError(
          "The iCloud request timed out or stopped. Your saved calendars are kept.",
          503,
        );
      const timeout = AbortSignal.timeout(Math.min(15000, remaining));
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method,
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(
                this.credentials.email + ":" + this.credentials.appPassword,
              ).toString("base64"),
            Accept: "application/xml, text/calendar",
            "Content-Type": "application/xml; charset=utf-8",
            Depth: depth,
            "User-Agent":
              "Daylight/0.1 (https://github.com/PaulManavalan/daylight)",
          },
          ...(body === undefined ? {} : { body }),
          redirect: "manual",
          cache: "no-store",
          signal: this.signal
            ? AbortSignal.any([this.signal, timeout])
            : timeout,
        });
      } catch {
        throw new ICloudCalendarError(
          "iCloud could not be reached. Your saved calendars are kept.",
          502,
        );
      }
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location)
          throw new ICloudCalendarError(
            "iCloud omitted its calendar redirect.",
            502,
          );
        url = icloudURL(location, url.href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ICloudCalendarError(
          response.status === 401
            ? "iCloud did not accept the app-specific password. Reconnect to try again."
            : response.status === 403
              ? "This iCloud calendar is not available to this connection."
              : response.status === 429
                ? "iCloud is busy. Wait before trying again."
                : "iCloud could not finish reading this calendar. Your saved data is kept.",
          response.status === 401 ||
          response.status === 403 ||
          response.status === 429
            ? response.status
            : 502,
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new ICloudCalendarError(
          "iCloud returned an empty calendar response.",
          502,
        );
      let size = 0,
        result = "";
      const decoder = new TextDecoder();
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new ICloudCalendarError(
            "Choose a smaller iCloud calendar window.",
            413,
          );
        }
        result += decoder.decode(part.value, { stream: true });
      }
      result += decoder.decode();
      return {
        url: url.href,
        text: result,
        etag: response.headers.get("etag"),
      };
    }
    throw new ICloudCalendarError(
      "iCloud redirected too many times. Reconnect before trying again.",
      502,
    );
  }
}
