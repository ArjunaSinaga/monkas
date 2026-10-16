import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabase() {
  if (!url || !anon) throw new Error("Supabase env belum diisi (.env.local).");
  return createClient(url, anon);
}
