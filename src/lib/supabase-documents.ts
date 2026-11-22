import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  workspacePrivacySchema,
  erasureReceiptSchema,
  WorkspacePrivacyChangedError,
} from "./workspace-privacy";
import {
  validateCloudDocuments,
  validateDocument,
  WorkspaceConflictError,
  type DocumentTransport,
  type DocumentChange,
} from "./workspace-documents";

/** Uses the user's JWT and owner-checked SQL function; no service-role key. */
export function supabaseDocuments(
  db: SupabaseClient,
  owner: string,
): DocumentTransport {
  z.uuid().parse(owner);
  function failure(error: { code?: string; message?: string }) {
    if (
      error.code === "40001" &&
      error.message?.includes("workspace_privacy_changed")
    )
      return new WorkspacePrivacyChangedError();
    if (error.code === "40001") return new WorkspaceConflictError();
    if (["42P01", "PGRST202", "42883"].includes(error.code ?? ""))
      return Error(
        "Account sync needs its database migration on this deployment. Your local account cache is kept.",
      );
    if (["42501", "PGRST301", "PGRST302"].includes(error.code ?? ""))
      return Error("Sign in to this Daylight account again before syncing.");
    return Error(
      "Account sync could not finish. Your local changes are kept for retry.",
    );
  }
  async function verifyIdentity() {
    const { data, error } = await db.auth.getSession();
    if (error || data.session?.user.id !== owner)
      throw Error(
        "The signed-in account changed. Reopen the current workspace before syncing.",
      );
  }
  return {
    owner,
    async readPrivacy() {
      await verifyIdentity();
      const { data, error } = await db
        .rpc("read_workspace_privacy", { p_owner: owner })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw failure(error);
      await verifyIdentity();
      return workspacePrivacySchema.parse(data);
    },
    async readAll() {
      await verifyIdentity();
      const rows: unknown[] = [];
      for (let page = 0; page < 10; page++) {
        const { data, error } = await db
          .from("workspace_documents")
          .select("user_id,document_key,revision,payload,updated_at")
          .eq("user_id", owner)
          .order("document_key", { ascending: true })
          .range(page * 200, page * 200 + 199)
          .abortSignal(AbortSignal.timeout(15000));
        if (error) throw failure(error);
        if (!Array.isArray(data))
          throw Error("Account sync returned an incomplete document page.");
        rows.push(...data);
        if (data.length < 200) {
          await verifyIdentity();
          return validateCloudDocuments(rows, owner);
        }
      }
      throw Error(
        "This account has too many documents to load safely. No cached data was replaced.",
      );
    },
    async save(changes: DocumentChange[], generation: number) {
      await verifyIdentity();
      if (changes.length < 1 || changes.length > 200)
        throw Error("Sync up to 200 documents per batch.");
      const prepared = changes.map((change) => ({
        ...change,
        key: z.string().parse(change.key),
        expectedRevision: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER - 1)
          .parse(change.expectedRevision),
        payload: validateDocument(change.key, change.payload),
      }));
      const { data, error } = await db
        .rpc("save_workspace_documents", {
          p_owner: owner,
          p_changes: prepared,
          p_generation: generation,
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw failure(error);
      await verifyIdentity();
      return validateCloudDocuments(data, owner);
    },
    async erase(scope, generation, expected) {
      await verifyIdentity();
      const { data, error } = await db
        .rpc("erase_workspace_scope", {
          p_owner: owner,
          p_scope: scope,
          p_generation: generation,
          p_expected: expected,
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw failure(error);
      await verifyIdentity();
      return erasureReceiptSchema.parse(data);
    },
  };
}
