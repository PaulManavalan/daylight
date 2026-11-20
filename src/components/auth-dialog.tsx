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
    <DialogTitle className="text-xl font-semibold">Your workspace</DialogTitle>
    <DialogDescription className="mt-2 text-sm text-muted-foreground">{configured ? "Sign in with an email link to save tasks to your private account. Demo tasks stay in this browser." : "This workspace is saved on this device. Account sync is not enabled here."}</DialogDescription>
    {configured ? <form onSubmit={submit} className="mt-6 space-y-4"><label className="field">Email<input name="email" type="email" placeholder="you@example.com" required /></label><Button disabled={busy} className="w-full">{busy ? "Sending…" : "Email me a sign-in link"}</Button>{message && <p role="status" className="text-sm text-primary">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}</form>
    : <div className="mt-5 rounded-lg bg-muted p-4 text-sm leading-6">You can keep using Daylight here. Download a workspace backup from the top bar to keep an extra copy.<Button className="mt-4 w-full" onClick={onClose}>Continue on this device</Button></div>}
  </DialogContent></Dialog>;
}
