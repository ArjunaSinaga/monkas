"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { hashPin, hashPassword, setSession, setAdminSession } from "../lib/pin";

export default function LoginPage() {
  const [mode, setMode] = useState("tenant"); // tenant | admin
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function loginTenant(e) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN harus 4-6 digit angka.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const h = await hashPin(pin);
      const db = supabase();
      const { data, error: qErr } = await db
        .from("tenants")
        .select("id,name")
        .eq("pin_hash", h)
        .limit(1)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setError("PIN salah. Coba lagi.");
        return;
      }
      setSession({ tenant_id: data.id, tenant_name: data.name, login_at: Date.now() });
      router.push("/kasir");
    } catch (err) {
      setError(err.message || "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }

  async function loginAdmin(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const h = await hashPassword(password);
      const db = supabase();
      const { data, error: qErr } = await db
        .from("admins")
        .select("id,username")
        .eq("username", username.trim())
        .eq("password_hash", h)
        .limit(1)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setError("Username atau password salah.");
        return;
      }
      setAdminSession({ admin_id: data.id, username: data.username, login_at: Date.now() });
      router.push("/admin");
    } catch (err) {
      setError(err.message || "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>MONKAS</h1>
      <p>Monjali Kasir — pilih mode masuk.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setMode("tenant"); setError(""); }} disabled={mode === "tenant"} style={{ flex: 1, padding: 10 }}>
          Kasir (PIN)
        </button>
        <button onClick={() => { setMode("admin"); setError(""); }} disabled={mode === "admin"} style={{ flex: 1, padding: 10 }}>
          Admin
        </button>
      </div>
      {mode === "tenant" ? (
        <form onSubmit={loginTenant}>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN 4-6 digit"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={{ width: "100%", padding: 12, fontSize: 18 }}
          />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 12 }}>
            {busy ? "Memeriksa..." : "Masuk Kasir"}
          </button>
        </form>
      ) : (
        <form onSubmit={loginAdmin}>
          <input
            placeholder="Username admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", padding: 12, fontSize: 16, marginBottom: 8 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 12, fontSize: 16 }}
          />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 12 }}>
            {busy ? "Memeriksa..." : "Masuk Admin"}
          </button>
        </form>
      )}
    </main>
  );
}
