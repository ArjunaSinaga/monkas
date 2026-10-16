"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { hashPin, hashPassword, setSession, setAdminSession } from "../lib/pin";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
      <p>Monjali Kasir — masuk dengan username + password.</p>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Username"
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
          {busy ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
