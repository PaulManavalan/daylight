"use client";
import { useEffect, useRef, useState } from "react";
import {
  PersonalWorkspaceStore,
  personalWorkspaceKey,
  type PersonalWorkspace,
} from "@/lib/personal-workspace";
export function usePersonalWorkspace() {
  const [state, setState] = useState<PersonalWorkspace | null>(null),
    [error, setError] = useState("");
  const raw = useRef<string | null>(null);
  function load() {
    try {
      const saved = new PersonalWorkspaceStore(localStorage).load();
      raw.current = saved.raw;
      setState(saved.state);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read personal settings.",
      );
    }
  }
  useEffect(() => {
    load();
    const changed = (event: StorageEvent) => {
      if (event.key === personalWorkspaceKey || event.key === null) {
        try {
          setState(new PersonalWorkspaceStore(localStorage).load().state);
        } catch {}
        setError(
          "Your personal data changed in another tab. Reload this page before saving further edits.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function save(next: PersonalWorkspace) {
    try {
      const saved = new PersonalWorkspaceStore(localStorage).save(
        next,
        raw.current,
      );
      raw.current = saved.raw;
      setState(saved.state);
      setError("");
      return saved.state;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save personal settings.";
      setError(message);
      throw new Error(message);
    }
  }
  return { state, error, save, reload: load };
}
