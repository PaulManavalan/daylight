import type { SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // The SDK reads storage during module initialization; do not load it for a
  // local workspace or when the browser has blocked storage access.
  try {
    if(typeof window!=='undefined')window.localStorage.getItem('daylight.tasks.v1');
    const {createClient}=require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
    client ??= createClient(url, key);
  }catch{return null;}
  return client;
}
