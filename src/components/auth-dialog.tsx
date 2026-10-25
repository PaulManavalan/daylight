"use client";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
export function AuthDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const configured = Boolean(getSupabase());
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    const email = String(new FormData(e.currentTarget).get("email"));
    try {
      const { error } = await getSupabase()!.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      setMessage("Check your email for a sign-in link. Open it in this browser to sync your tasks.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed. Try again."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent>
    <DialogTitle className="text-xl font-semibold">Your tasks, wherever you study.</DialogTitle>
    <DialogDescription className="mt-2 text-sm text-muted-foreground">{configured ? "Sign in with an email link to save tasks to your private account. Demo tasks stay in this browser." : "You’re in local demo mode. Your tasks are saved in this browser. Connect Supabase to enable a private, synced account."}</DialogDescription>
    {configured ? <form onSubmit={submit} className="mt-6 space-y-4"><label className="field">Email<input name="email" type="email" placeholder="you@example.com" required /></label><Button disabled={busy} className="w-full">{busy ? "Sending…" : "Email me a sign-in link"}</Button>{message && <p role="status" className="text-sm text-primary">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form>
    : <div className="mt-5 rounded-lg bg-muted p-4 text-sm leading-6">Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and publishable key, then run the SQL migration and restart the app. Full instructions are in the project README.</div>}
  </DialogContent></Dialog>;
}
