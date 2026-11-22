"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import {
  AccountWorkspace,
  accountCacheKey,
  type WorkspaceSyncSnapshot,
} from "@/lib/account-workspace";
import { supabaseDocuments } from "@/lib/supabase-documents";
import { AuthDialog } from "./auth-dialog";
import css from "./account-workspace.module.css";

interface AccountContext {
  owner: string;
  account: AccountWorkspace | null;
  status: WorkspaceSyncSnapshot | null;
}
const localContext: AccountContext = {
  owner: "local-demo",
  account: null,
  status: null,
};
const Context = createContext<AccountContext>(localContext);
export const useAccountWorkspace = () => useContext(Context);
export async function accountAuthHeaders(
  owner: string,
): Promise<Record<string, string>> {
  if (owner === "local-demo") return {};
  const session = (await getSupabase()?.auth.getSession())?.data.session;
  if (session?.user.id !== owner)
    throw Error(
      "Your signed-in account changed. Reopen the current workspace.",
    );
  return { Authorization: "Bearer " + session.access_token };
}

export function AccountWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [owner, setOwner] = useState<string | null>(null),
    [account, setAccount] = useState<AccountWorkspace | null>(null),
    [status, setStatus] = useState<WorkspaceSyncSnapshot | null>(null),
    [error, setError] = useState(""),
    [authOpen, setAuthOpen] = useState(false),
    [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setOwner("local-demo");
      return;
    }
    let live = true;
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, session) => {
      if (live) setOwner(session?.user.id ?? "local-demo");
    });
    void db.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setError(
          "Your sign-in could not be checked. Retry or reopen your workspace.",
        );
        return;
      }
      setOwner(data.session?.user.id ?? "local-demo");
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!owner || owner === "local-demo") {
      setAccount(null);
      setStatus(null);
      return;
    }
    const db = getSupabase();
    if (!db) {
      setError("Account configuration is unavailable.");
      return;
    }
    let engine: AccountWorkspace;
    let alive = true;
    setOpened(null);
    try {
      engine = new AccountWorkspace(
        localStorage,
        owner,
        supabaseDocuments(db, owner),
      );
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError("");
    setAccount(engine);
    setStatus(engine.snapshot());
    const unsubscribe = engine.subscribe(() => setStatus(engine.snapshot()));
    void engine.sync().then(() => {
      if (alive) setOpened(owner);
    });
    const retry = () => void engine.sync(),
      changed = (event: StorageEvent) => {
        if (event.key === engine.key || event.key === null) retry();
      };
    window.addEventListener("storage", changed);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") retry();
    }, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("storage", changed);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      unsubscribe();
      engine.dispose();
    };
  }, [owner]);
  useEffect(() => {
    if (!account || account.owner !== owner || status?.status !== "queued")
      return;
    const timer = setTimeout(() => void account.sync(), 500);
    return () => clearTimeout(timer);
  }, [account, owner, status]);
  const local = owner === "local-demo",
    matching = !!owner && account?.owner === owner,
    ready = local || (matching && status?.ready && opened === owner);
  function downloadRecovery() {
    if (!owner || local || status?.privacyBlocked) return;
    const raw = localStorage.getItem(accountCacheKey(owner));
    if (!raw) return;
    const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "daylight-account-recovery.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function hasRecovery() {
    try {
      return (
        !!owner &&
        !local &&
        !status?.privacyBlocked &&
        localStorage.getItem(accountCacheKey(owner)) !== null
      );
    } catch {
      return false;
    }
  }
  return (
    <>
      <div className={css.bar} aria-label="Workspace identity">
        <span>
          {!owner
            ? "Checking your workspace…"
            : local
              ? "Local workspace · this device"
              : status?.status === "synced"
                ? "Account workspace · saved"
                : status?.status === "syncing"
                  ? "Account workspace · syncing"
                  : status?.status === "conflict"
                    ? "Account workspace · review needed"
                    : "Account workspace · changes kept on this device"}
        </span>
        <div>
          {local ? (
            getSupabase() && (
              <button onClick={() => setAuthOpen(true)}>Sign in</button>
            )
          ) : (
            <>
              <button onClick={() => void account?.sync()}>Retry sync</button>
              <Link href="/day/preferences#account-sync">Account details</Link>
              <button onClick={() => void getSupabase()?.auth.signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
      {ready ? (
        <Context.Provider
          key={owner + ":" + (status?.generation ?? 0)}
          value={{
            owner: owner!,
            account: local ? null : account,
            status: local ? null : status,
          }}
        >
          {children}
        </Context.Provider>
      ) : (
        <main className={css.loading}>
          <h1>
            {error || status?.status === "error"
              ? "Your workspace needs attention"
              : "Opening your account…"}
          </h1>
          <p role={error || status?.status === "error" ? "alert" : "status"}>
            {error ||
              status?.message ||
              "Your saved data stays intact while the account is checked."}
          </p>
          {hasRecovery() && (
            <button onClick={downloadRecovery}>
              Download account recovery copy
            </button>
          )}
          <button onClick={() => location.reload()}>Reload workspace</button>
        </main>
      )}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
