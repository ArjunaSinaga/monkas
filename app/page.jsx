"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { hashPin, hashPassword, setSession, setAdminSession } from "../lib/pin";

const FAIL_KEY = "monkas_login_fail";
const MAX_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("admin");
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const db = supabase();

      // 1. Coba sebagai admin
      const ah = await hashPassword(password);
      const { data: admin, error: aErr } = await db
        .from("admins")
        .select("id,username")
        .eq("username", username.trim())
        .eq("password_hash", ah)
        .limit(1)
        .maybeSingle();
      if (aErr) throw aErr;
      try { localStorage.removeItem(FAIL_KEY); } catch {}
      if (admin) {
        setAdminSession({ admin_id: admin.id, username: admin.username, login_at: Date.now() });
        router.push("/admin");
        return;
      }

      // 2. Coba sebagai tenant (username = nama tenant, password = PIN)
      if (!/^\d{4,6}$/.test(password)) {
        setError("Username atau password salah.");
        return;
      }
      const ph = await hashPin(password);
      const { data: tenant, error: tErr } = await db
        .from("tenants")
        .select("id,name")
        .eq("name", username.trim())
        .eq("pin_hash", ph)
        .limit(1)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!tenant) {
        setError("Username atau password salah.");
        return;
      }
      setSession({ tenant_id: tenant.id, tenant_name: tenant.name, login_at: Date.now() });
      router.push("/kasir");
    } catch (err) {
      setError(err.message || "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>MONKAS</h1>
      <p style={{ color: "#6f6252", fontSize: 14, marginTop: 4 }}>
        {mode === "admin"
          ? "Masuk sebagai admin untuk mendaftarkan tenant dan mengatur produk."
          : "Masuk sebagai tenant (kafe) untuk memakai mesin kasir."}
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button
          type="button"
          onClick={() => { setMode("admin"); setError(""); }}
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 600,
            border: "1px solid " + (mode === "admin" ? "#3d2c1e" : "#e8e0cf"),
            background: mode === "admin" ? "#3d2c1e" : "#fff",
            color: mode === "admin" ? "#fff" : "#2b2118",
          }}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => { setMode("tenant"); setError(""); }}
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 600,
            border: "1px solid " + (mode === "tenant" ? "#3d2c1e" : "#e8e0cf"),
            background: mode === "tenant" ? "#3d2c1e" : "#fff",
            color: mode === "tenant" ? "#fff" : "#2b2118",
          }}
        >
          Tenant (Kafe)
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <input
          placeholder={mode === "admin" ? "Username admin" : "Nama tenant (kafe)"}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 12, fontSize: 16, marginBottom: 8 }}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder={mode === "admin" ? "PIN admin (6 angka)" : "PIN tenant (4-6 angka)"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 12, fontSize: 16 }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          {busy ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
