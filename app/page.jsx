"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { hashPin, setSession } from "../lib/pin";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
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
        .select("id,name,qris_photo_url")
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

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>MONKAS</h1>
      <p>Monjali Kasir — masukkan PIN tenant di perangkat ini.</p>
      <form onSubmit={handleSubmit}>
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
          {busy ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
      <p style={{ marginTop: 16 }}>
        <a href="/admin">Kelola tenant (admin)</a>
      </p>
    </main>
  );
}
