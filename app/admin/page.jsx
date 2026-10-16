"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { hashPin, hashPassword, getAdminSession } from "../../lib/pin";

export default function AdminTenantsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [needSetup, setNeedSetup] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminPw, setAdminPw] = useState("");
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
    (async () => {
      const db = supabase();
      const { count } = await db.from("admins").select("id", { count: "exact", head: true });
      if ((count || 0) === 0) {
        setNeedSetup(true);
        setAuthed(true);
        load();
        return;
      }
      const s = getAdminSession();
      if (!s) {
        router.push("/");
        return;
      }
      setAuthed(true);
      load();
    })();
  }, []);

  async function createFirstAdmin(e) {
    e.preventDefault();
    setMsg("");
    if (!adminUser.trim() || adminPw.length < 4) {
      setMsg("Username wajib + password min 4 karakter.");
      return;
    }
    const db = supabase();
    const h = await hashPassword(adminPw);
    const { error } = await db.from("admins").insert({ username: adminUser.trim(), password_hash: h });
    if (error) {
      setMsg(error.message);
      return;
    }
    setNeedSetup(false);
    setMsg("Admin dibuat. Login lewat halaman utama mode Admin.");
  }

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

  if (!authed) return <main style={{ padding: 24 }}><p>Memeriksa sesi admin...</p></main>;

  if (needSetup) {
    return (
      <main style={{ maxWidth: 420, margin: "10vh auto", padding: 24 }}>
        <h1>Buat Admin Pertama</h1>
        <p>Belum ada akun admin. Buat sekarang (cukup sekali).</p>
        <form onSubmit={createFirstAdmin}>
          <input placeholder="Username" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8 }} />
          <input type="password" placeholder="Password (min 4)" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8 }} />
          <button type="submit" style={{ padding: "10px 16px" }}>Buat Admin</button>
        </form>
        {msg && <p>{msg}</p>}
      </main>
    );
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
