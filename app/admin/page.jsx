"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { hashPin } from "../../lib/pin";

export default function AdminTenantsPage() {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [qris, setQris] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const db = supabase();
    const { data, error } = await db.from("tenants").select("id,name,qris_photo_url,created_at").order("created_at");
    if (!error) setRows(data || []);
    else setMsg(error.message);
  }

  useEffect(() => {
    load();
  }, []);

  async function addTenant(e) {
    e.preventDefault();
    setMsg("");
    if (!name.trim()) {
      setMsg("Nama tenant wajib diisi.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setMsg("PIN harus 4-6 digit angka.");
      return;
    }
    if (!qris.trim()) {
      setMsg("Foto QRIS wajib diisi (URL foto).");
      return;
    }
    const db = supabase();
    const h = await hashPin(pin);
    const { error } = await db.from("tenants").insert({ name: name.trim(), pin_hash: h, qris_photo_url: qris.trim() });
    if (error) {
      setMsg(error.message);
      return;
    }
    setName("");
    setPin("");
    setQris("");
    setMsg("Tenant tersimpan.");
    load();
  }

  return (
    <main style={{ maxWidth: 560, margin: "5vh auto", padding: 24 }}>
      <h1>Kelola Tenant</h1>
      <p>
        <a href="/">← Kembali ke login</a>
      </p>
      <form onSubmit={addTenant} style={{ border: "1px solid #ccc", padding: 16, marginBottom: 16 }}>
        <h2>Tambah Tenant</h2>
        <input placeholder="Nama tenant" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8 }} />
        <input placeholder="PIN 4-6 digit" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" style={{ width: "100%", padding: 10, marginBottom: 8 }} />
        <input placeholder="URL foto QRIS (wajib)" value={qris} onChange={(e) => setQris(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8 }} />
        <button type="submit" style={{ padding: "10px 16px" }}>
          Simpan
        </button>
      </form>
      {msg && <p>{msg}</p>}
      <h2>Daftar ({rows.length})</h2>
      <ul>
        {rows.map((t) => (
          <li key={t.id}>
            {t.name} — {t.qris_photo_url ? "QRIS ok" : "QRIS kosong"}
          </li>
        ))}
      </ul>
    </main>
  );
}
