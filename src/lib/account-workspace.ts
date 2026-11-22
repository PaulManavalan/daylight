import { z } from "zod";
import {
  validateDocument,
  validateCloudDocuments,
  stableJSON,
  WorkspaceConflictError,
  type CloudDocument,
  type DocumentTransport,
} from "./workspace-documents";

const entrySchema = z.object({
  payload: z.unknown(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sequence: z.number().int().nonnegative(),
  dirty: z.boolean(),
});
const conflictSchema = z.object({
  payload: z.unknown(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const cacheSchema = z.object({
  version: z.literal(1),
  owner: z.uuid(),
  ready: z.boolean(),
  documents: z.record(z.string(), entrySchema),
  conflicts: z.record(z.string(), conflictSchema),
});
type Cache = z.infer<typeof cacheSchema>;
type Entry = z.infer<typeof entrySchema>;
export type WorkspaceSyncStatus =
  | "loading"
  | "synced"
  | "syncing"
  | "queued"
  | "offline"
  | "conflict"
  | "error";
export interface WorkspaceSyncSnapshot {
  status: WorkspaceSyncStatus;
  ready: boolean;
  message: string;
  dirty: number;
  conflicts: string[];
}
interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type WorkspaceLock = <T>(action: () => Promise<T>) => Promise<T>;
export function browserWorkspaceLock(owner: string): WorkspaceLock {
  return async (action) => {
    if (typeof navigator === "undefined" || !navigator.locks)
      throw Error(
        "Safe account storage is unavailable in this browser. Your existing data is kept.",
      );
    return await navigator.locks.request("daylight-account-" + owner, action);
  };
}
export const accountCacheKey = (owner: string) =>
  "daylight.account-cache.v1." + z.uuid().parse(owner);
const empty = (owner: string): Cache => ({
  version: 1,
  owner,
  ready: false,
  documents: {},
  conflicts: {},
});
const missing = (): Entry => ({
  payload: null,
  revision: 0,
  sequence: 0,
  dirty: false,
});

/** Durable local outbox + cloud compare-and-swap; conflict resolution is explicit. */
export class AccountWorkspace {
  readonly key: string;
  private cache: Cache;
  private raw: string | null = null;
  private disposed = false;
  private active: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private view: WorkspaceSyncSnapshot = {
    status: "loading",
    ready: false,
    message: "Loading account data…",
    dirty: 0,
    conflicts: [],
  };
  constructor(
    private storage: CacheStorage,
    readonly owner: string,
    private transport: DocumentTransport,
    private lock: WorkspaceLock = browserWorkspaceLock(owner),
  ) {
    this.key = accountCacheKey(owner);
    if (transport.owner !== owner)
      throw Error("The account transport belongs to another user.");
    this.cache = empty(owner);
    this.readCache();
    this.publish("loading", "Checking your account data…");
  }
  private readCache() {
    const raw = this.storage.getItem(this.key);
    if (raw === this.raw) return;
    let parsed: Cache;
    try {
      parsed =
        raw === null ? empty(this.owner) : cacheSchema.parse(JSON.parse(raw));
      if (parsed.owner !== this.owner) throw Error();
      for (const [key, entry] of Object.entries(parsed.documents))
        entry.payload = validateDocument(key, entry.payload);
      for (const [key, entry] of Object.entries(parsed.conflicts))
        entry.payload = validateDocument(key, entry.payload);
    } catch {
      throw Error(
        "Your account cache needs recovery. It has not been reset or overwritten.",
      );
    }
    this.raw = raw;
    this.cache = parsed;
  }
  private writeCache(cache: Cache) {
    if (this.storage.getItem(this.key) !== this.raw)
      throw Error(
        "This account cache changed in another tab. Reload before continuing.",
      );
    const text = JSON.stringify(cacheSchema.parse(cache));
    try {
      this.storage.setItem(this.key, text);
    } catch {
      throw Error(
        "This browser could not save the account cache. Previous saved records are kept.",
      );
    }
    this.raw = text;
    this.cache = cache;
  }
  private publish(status: WorkspaceSyncStatus, message: string) {
    if (this.disposed) return;
    this.view = {
      status,
      ready: this.cache.ready,
      message,
      dirty: Object.values(this.cache.documents).filter((e) => e.dirty).length,
      conflicts: Object.keys(this.cache.conflicts).sort(),
    };
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.view;
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
  document(key: string) {
    this.readCache();
    validateDocument(key, null);
    return structuredClone(this.cache.documents[key] ?? missing());
  }
  recovery() {
    return this.storage.getItem(this.key);
  }
  keys() {
    this.readCache();
    return Object.keys(this.cache.documents).sort();
  }
  async updateMany(
    changes: { key: string; payload: unknown; expectedSequence: number }[],
  ) {
    if (
      !changes.length ||
      changes.length > 200 ||
      new Set(changes.map((c) => c.key)).size !== changes.length
    )
      throw Error("Choose 1–200 distinct account records.");
    const prepared = changes.map((change) => ({
      ...change,
      payload: validateDocument(change.key, change.payload),
    }));
    await this.lock(async () => {
      if (this.disposed) throw Error("This workspace is no longer active.");
      this.readCache();
      if (!this.cache.ready)
        throw Error("Load your account before importing records.");
      const next = structuredClone(this.cache);
      for (const change of prepared) {
        const previous = next.documents[change.key] ?? missing();
        if (previous.sequence !== change.expectedSequence)
          throw Error(
            "Account data changed after this review. Review the import again.",
          );
        next.documents[change.key] = {
          payload: change.payload,
          revision: previous.revision,
          sequence: previous.sequence + 1,
          dirty: true,
        };
      }
      if (
        new TextEncoder().encode(
          JSON.stringify(
            prepared.map((c) => ({
              key: c.key,
              expectedRevision: next.documents[c.key].revision,
              payload: c.payload,
            })),
          ),
        ).length > 4194304
      )
        throw Error("Import fewer records at a time; this batch exceeds 4 MB.");
      this.writeCache(next);
    });
    this.publish(
      Object.keys(this.cache.conflicts).length ? "conflict" : "queued",
      "Reviewed records are saved on this device and waiting to sync.",
    );
  }
  async update(key: string, payload: unknown, expectedSequence: number) {
    const valid = validateDocument(key, payload);
    await this.lock(async () => {
      if (this.disposed) throw Error("This workspace is no longer active.");
      this.readCache();
      if (!this.cache.ready)
        throw Error("Load your account before saving a new draft.");
      const previous = this.cache.documents[key] ?? missing();
      if (previous.sequence !== expectedSequence)
        throw Error(
          "This account document changed since you opened it. Reload before saving.",
        );
      const next = structuredClone(this.cache);
      next.documents[key] = {
        payload: valid,
        revision: previous.revision,
        sequence: previous.sequence + 1,
        dirty: true,
      };
      this.writeCache(next);
    });
    this.publish(
      Object.keys(this.cache.conflicts).length ? "conflict" : "queued",
      "Saved on this device; waiting to sync.",
    );
    return this.document(key);
  }
  async resolve(
    key: string,
    choice: "cloud" | "draft",
    expectedRevision: number,
    expectedSequence: number,
  ) {
    await this.lock(async () => {
      if (this.disposed) throw Error("This workspace is no longer active.");
      this.readCache();
      const conflict = this.cache.conflicts[key],
        entry = this.cache.documents[key];
      if (
        !conflict ||
        !entry ||
        conflict.revision !== expectedRevision ||
        entry.sequence !== expectedSequence
      )
        throw Error("The conflict changed after review. Review it again.");
      const next = structuredClone(this.cache);
      next.documents[key] = {
        payload: choice === "cloud" ? conflict.payload : entry.payload,
        revision: conflict.revision,
        sequence: entry.sequence + 1,
        dirty: choice === "draft",
      };
      delete next.conflicts[key];
      this.writeCache(next);
    });
    this.publish(
      Object.keys(this.cache.conflicts).length
        ? "conflict"
        : Object.values(this.cache.documents).some((e) => e.dirty)
          ? "queued"
          : "synced",
      "Your reviewed version is kept.",
    );
  }
  conflict(key: string) {
    this.readCache();
    return structuredClone(this.cache.conflicts[key] ?? null);
  }
  private async merge(rows: CloudDocument[]) {
    await this.lock(async () => {
      if (this.disposed) return;
      this.readCache();
      const next = structuredClone(this.cache),
        remote = new Map(rows.map((row) => [row.document_key, row]));
      for (const [key, row] of remote) {
        const local = next.documents[key];
        if (!local) {
          next.documents[key] = {
            payload: row.payload,
            revision: row.revision,
            sequence: 1,
            dirty: false,
          };
          delete next.conflicts[key];
          continue;
        }
        if (row.revision < local.revision) continue;
        if (stableJSON(local.payload) === stableJSON(row.payload)) {
          next.documents[key] = {
            ...local,
            revision: row.revision,
            dirty: false,
          };
          delete next.conflicts[key];
        } else if (local.dirty && local.revision !== row.revision) {
          next.conflicts[key] = {
            payload: row.payload,
            revision: row.revision,
          };
        } else if (!local.dirty) {
          next.documents[key] = {
            payload: row.payload,
            revision: row.revision,
            sequence: local.sequence + 1,
            dirty: false,
          };
          delete next.conflicts[key];
        } else delete next.conflicts[key];
      }
      for (const [key, local] of Object.entries(next.documents))
        if (!remote.has(key) && local.revision > 0)
          next.conflicts[key] = { payload: null, revision: 0 };
      next.ready = true;
      this.writeCache(next);
    });
  }
  async sync() {
    if (this.disposed) return;
    if (this.active) return this.active;
    this.active = this.performSync().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async performSync() {
    this.publish("syncing", "Syncing your account…");
    try {
      const rows = validateCloudDocuments(
        await this.transport.readAll(),
        this.owner,
      );
      if (this.disposed) return;
      await this.merge(rows);
      for (let pass = 0; pass < 5; pass++) {
        if (this.disposed) return;
        this.readCache();
        if (Object.keys(this.cache.conflicts).length) {
          this.publish(
            "conflict",
            "Another device has a different version. Both versions are kept for review.",
          );
          return;
        }
        const pending: [string, Entry][] = [];
        let batchBytes = 2;
        for (const [key, entry] of Object.entries(this.cache.documents).sort(
          ([a], [b]) => a.localeCompare(b),
        )) {
          if (!entry.dirty) continue;
          const bytes =
            new TextEncoder().encode(
              JSON.stringify({
                key,
                expectedRevision: entry.revision,
                payload: entry.payload,
              }),
            ).length + (pending.length ? 1 : 0);
          if (pending.length >= 200 || batchBytes + bytes > 4194304) break;
          pending.push([key, entry]);
          batchBytes += bytes;
        }
        if (!pending.length) {
          this.publish("synced", "Saved to your account.");
          return;
        }
        let saved: CloudDocument[];
        try {
          saved = validateCloudDocuments(
            await this.transport.save(
              pending.map(([key, entry]) => ({
                key,
                expectedRevision: entry.revision,
                payload: entry.payload,
              })),
            ),
            this.owner,
          );
        } catch (error) {
          if (error instanceof WorkspaceConflictError) {
            await this.merge(
              validateCloudDocuments(
                await this.transport.readAll(),
                this.owner,
              ),
            );
            continue;
          }
          throw error;
        }
        if (this.disposed) return;
        const byKey = new Map(saved.map((row) => [row.document_key, row]));
        if (
          saved.length !== pending.length ||
          pending.some(([key, entry]) => {
            const row = byKey.get(key);
            return (
              !row ||
              row.revision !== entry.revision + 1 ||
              stableJSON(row.payload) !== stableJSON(entry.payload)
            );
          })
        )
          throw Error(
            "The account save response could not be verified. Your draft is kept for reconciliation.",
          );
        await this.lock(async () => {
          this.readCache();
          const next = structuredClone(this.cache);
          for (const [key, sent] of pending) {
            const current = next.documents[key],
              row = byKey.get(key)!;
            if (!current || current.revision > row.revision) continue;
            if (
              current.sequence === sent.sequence &&
              stableJSON(current.payload) === stableJSON(sent.payload)
            ) {
              next.documents[key] = {
                ...current,
                revision: row.revision,
                dirty: false,
              };
              delete next.conflicts[key];
            } else if (current.revision === sent.revision)
              next.documents[key] = { ...current, revision: row.revision };
          }
          this.writeCache(next);
        });
      }
      this.publish(
        "queued",
        "Recent changes are saved on this device and still waiting to sync.",
      );
    } catch (error) {
      if (this.disposed) return;
      this.publish(
        this.cache.ready ? "offline" : "error",
        error instanceof Error
          ? error.message
          : "Account sync could not finish. Your local changes are kept.",
      );
    }
  }
}
