"use client";
import { useEffect, useState } from "react";
import {
  SatStore,
  defaultSat,
  satKey,
  satStateSchema,
  type SatState,
} from "@/lib/sat";
import { useAccountWorkspace } from "./account-workspace-context";
export function useSatReviews() {
  const { account } = useAccountWorkspace();
  const [state, setState] = useState<SatState | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let sequence = -1;
    function load() {
      try {
        if (account) {
          const entry = account.document("sat");
          if (entry.sequence === sequence) return;
          const next =
            entry.payload === null
              ? defaultSat()
              : satStateSchema.parse(entry.payload);
          sequence = entry.sequence;
          setState(next);
        } else setState(new SatStore(localStorage, "local-demo").load().state);
        setError("");
      } catch (error) {
        setState(null);
        setError((error as Error).message);
      }
    }
    load();
    const unsubscribe = account?.subscribe(load);
    const changed = (event: StorageEvent) => {
      if (event.key === satKey("local-demo") || event.key === null) load();
    };
    if (!account) window.addEventListener("storage", changed);
    window.addEventListener("focus", load);
    return () => {
      unsubscribe?.();
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", load);
    };
  }, [account]);
  return { state, error };
}
