"use client";
import { useEffect, useRef, useState } from "react";
import { recoverLocalRestore } from "@/lib/workspace-backup";
import { useAccountWorkspace } from "./account-workspace-context";
import { stableJSON } from "@/lib/workspace-documents";
import {
  PersonalWorkspaceStore,
  personalWorkspaceKey,
  personalWorkspaceSchema,
  defaultPersonalWorkspace,
  type PersonalWorkspace,
} from "@/lib/personal-workspace";
export function usePersonalWorkspace() {
  const { account, owner } = useAccountWorkspace();
  const [state, setState] = useState<PersonalWorkspace | null>(null),
    [error, setError] = useState("");
  const raw = useRef<string | null>(null);
  const sequence = useRef(0),
    signature = useRef(""),
    current = useRef<PersonalWorkspace | null>(null),
    active = useRef(false);
  function accountState() {
    const entry = account!.document("personal");
    return {
      entry,
      state:
        entry.payload === null
          ? defaultPersonalWorkspace()
          : personalWorkspaceSchema.parse(entry.payload),
    };
  }
  function load() {
    try {
      let saved: PersonalWorkspace;
      if (account) {
        const result = accountState();
        sequence.current = result.entry.sequence;
        signature.current = stableJSON(result.entry);
        saved = result.state;
      } else {
        recoverLocalRestore(localStorage);
        const result = new PersonalWorkspaceStore(localStorage).load();
        raw.current = result.raw;
        saved = result.state;
      }
      current.current = saved;
      setState(saved);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read personal settings.",
      );
    }
  }
  useEffect(() => {
    load();
    if (account)
      return account.subscribe(() => {
        try {
          const result = accountState(),
            nextSignature = stableJSON(result.entry);
          if (nextSignature === signature.current) return;
          signature.current = nextSignature;
          if (result.entry.sequence === sequence.current) return;
          current.current = result.state;
          setState(result.state);
          setError(
            "Your personal records changed. Reload this page before saving an older draft.",
          );
        } catch (e) {
          setError((e as Error).message);
        }
      });
    const changed = (event: StorageEvent) => {
      if (event.key === personalWorkspaceKey || event.key === null) {
        try {
          const next = new PersonalWorkspaceStore(localStorage).load().state;
          current.current = next;
          setState(next);
        } catch {}
        setError(
          "Your personal data changed in another tab. Reload this page before saving further edits.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [account, owner]);
  async function save(next: PersonalWorkspace) {
    if (active.current)
      throw Error("Wait for the current personal-data save to finish.");
    active.current = true;
    try {
      if (current.current && next.updatedAt !== current.current.updatedAt)
        throw Error(
          "Personal records changed while this draft was open. Reload before saving.",
        );
      let saved: PersonalWorkspace;
      if (account) {
        const value = personalWorkspaceSchema.parse({
            ...next,
            updatedAt: new Date(
              Math.max(Date.now(), Date.parse(next.updatedAt) + 1),
            ).toISOString(),
          }),
          entry = await account.update("personal", value, sequence.current);
        sequence.current = entry.sequence;
        signature.current = stableJSON(entry);
        saved = personalWorkspaceSchema.parse(entry.payload);
      } else {
        const result = new PersonalWorkspaceStore(localStorage).save(
          next,
          raw.current,
        );
        raw.current = result.raw;
        saved = result.state;
      }
      current.current = saved;
      setState(saved);
      setError("");
      return saved;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save personal settings.";
      setError(message);
      throw new Error(message);
    } finally {
      active.current = false;
    }
  }
  return { state, error, save, reload: load };
}
