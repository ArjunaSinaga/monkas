"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { hashPin, hashPassword, setSession, setAdminSession } from "../lib/pin";

const FAIL_KEY = "monkas_login_fail";
const MAX_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;

// Panggil RPC verifikasi; kalau migrasi 005 belum diterapkan, pakai query lama.
async function cariBaris(db, fn, args, fallback) {
  const { data, error } = await db.rpc(fn, args);
  if (!error) return data?.[0] || null;
  if (/Could not find the function|does not exist/i.test(error.message || "")) {
    const { data: old, error: oldErr } = await fallback();
    if (oldErr) throw oldErr;
    return old || null;
  }
  throw error;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function noteFail() {
    try {
      const rec = JSON.parse(localStorage.getItem(FAIL_KEY) || "null") || { n: 0, until: 0 };
      rec.n = (rec.n || 0) + 1;
      if (rec.n >= MAX_FAIL) {
        rec.until = Date.now() + LOCK_MS;
        rec.n = 0;
      }
      localStorage.setItem(FAIL_KEY, JSON.stringify(rec));
    } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !pin) {
      setError("Username dan PIN wajib diisi.");
      return;
    }
    // Lockout: 5x gagal -> kunci 5 menit
    try {
      const rec = JSON.parse(localStorage.getItem(FAIL_KEY) || "null");
      if (rec && rec.until && Date.now() < rec.until) {
        const sisa = Math.ceil((rec.until - Date.now()) / 1000);
        setError("Terlalu banyak percobaan. Coba lagi dalam " + sisa + " detik.");
        return;
      }
    } catch {}
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN harus 4-6 angka.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const db = supabase();
      const name = username.trim();

      // 1. Admin? (username admin + PIN 6 angka)
      const ah = await hashPassword(pin);
      const admin = await cariBaris(db, "monkas_login_admin", {
        p_username: name,
        p_hash: ah,
      }, () => db.from("admins").select("id,username")
        .eq("username", name).eq("password_hash", ah).limit(1).maybeSingle());
      if (admin) {
        try { localStorage.removeItem(FAIL_KEY); } catch {}
        setAdminSession({ admin_id: admin.id, username: admin.username, login_at: Date.now() });
        router.push("/admin");
        return;
      }

      // 2. Tenant? (nama tenant + PIN)
      const ph = await hashPin(pin);
      const tenant = await cariBaris(db, "monkas_login_tenant", {
        p_name: name,
        p_hash: ph,
      }, () => db.from("tenants").select("id,name")
        .eq("name", name).eq("pin_hash", ph).limit(1).maybeSingle());
      if (!tenant) {
        noteFail();
        setError("Username atau PIN salah.");
        return;
      }
      try { localStorage.removeItem(FAIL_KEY); } catch {}
      setSession({ tenant_id: tenant.id, tenant_name: tenant.name, login_at: Date.now() });
      router.push("/kasir");
    } catch (err) {
      setError(err.message || "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 380, paddingTop: "12vh" }}>
      <h1>MONKAS</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Monjali Kasir - masuk dengan username + PIN. Admin dan tenant memakai form yang sama.
      </p>
      <form onSubmit={handleSubmit} className="stack" style={{ marginTop: 20 }}>
        <input
          className="field"
          placeholder="Username admin atau nama tenant"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <input
          className="field"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="PIN (4-6 angka)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoComplete="current-password"
        />
        {error && <p className="msg msg-error">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
