"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { hashPin, hashPassword, getAdminSession, checkAdminPasswordPolicy } from "../../lib/pin";

const CATEGORIES = ["Minuman", "Makanan"];

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
  const [tenantId, setTenantId] = useState(null);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCategory, setPCategory] = useState(CATEGORIES[0]);
  const [editing, setEditing] = useState(null);
  const [vForms, setVForms] = useState({});
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    async function checkSetup() {
      const db = supabase();
      const { count, error } = await db.from("admins").select("*", { count: "exact", head: true });
      if (error) {
        console.error("Setup check error:", error);
        return;
      }
      if (count === 0) {
        setNeedSetup(true);
        setAuthed(true);
        return;
      }
      const s = getAdminSession();
      if (!s) {
        router.push("/");
        return;
      }
      setAuthed(true);
      load();
    }
    checkSetup();
  }, [router]);

  async function load() {
    const as = getAdminSession();
    if (as && as.username) setAdminName(as.username);
    const db = supabase();
    const { data } = await db
      .from("tenants")
      .select("id,name,qris_photo_url,created_at")
      .order("created_at");
    setRows(data || []);
  }

  async function createFirstAdmin(e) {
    e.preventDefault();
    if (!adminUser.trim() || adminPw.length < 4) {
      setMsg("Username wajib + password min 4 karakter.");
      return;
    }
    const db = supabase();
    const pw = hashPassword(adminPw);
    const { error } = await db
      .from("admins")
      .insert({ username: adminUser.trim(), password_hash: pw });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setNeedSetup(false);
    setMsg("Admin dibuat. Login lewat halaman utama mode Admin.");
  }

  async function addTenant(e) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg("Nama tenant wajib diisi.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin.trim())) {
      setMsg("PIN harus 4-6 digit angka.");
      return;
    }
    if (!qris.trim()) {
      setMsg("Foto QRIS belum diisi (boleh kosong dulu, bisa diisi nanti).");
    }
    // Validasi: nama tenant unik + tidak boleh sama dengan username admin
    // (kalau sama, login auto-deteksi akan salah masuk sebagai admin)
    const db = supabase();
    const { data: dupTenant } = await db.from("tenants").select("id").eq("name", name.trim()).maybeSingle();
    if (dupTenant) { setMsg("Nama tenant sudah dipakai."); return; }
    const { data: adminNameRow } = await db.from("admins").select("id").eq("username", name.trim()).maybeSingle();
    if (adminNameRow) { setMsg("Nama tenant tidak boleh sama dengan username admin."); return; }
    const h = hashPin(pin.trim());
    const { error } = await db.from("tenants").insert({
      name: name.trim(),
      pin_hash: h,
      qris_photo_url: qris.trim() || null,
    });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setName("");
    setPin("");
    setQris("");
    setMsg(
      "Tenant '" +
        name.trim() +
        "' tersimpan. PIN: " +
        pin.trim() +
        " (catat dan kasih ke merchant - PIN tidak bisa dibaca lagi karena disimpan sebagai hash)."
    );
    load();
  }

  async function changeAdminPw(e) {
    e.preventDefault();
    const err = checkAdminPasswordPolicy(newPw);
    if (err) { setMsg(err); return; }
    if (newPw !== newPw2) { setMsg("Konfirmasi password tidak sama."); return; }
    const db = supabase();
    const { data: adm } = await db.from("admins").select("id,password_hash").eq("username", adminName).maybeSingle();
    if (!adm) { setMsg("Akun admin tidak ditemukan."); return; }
    const cur = await hashPassword(curPw);
    if (cur !== adm.password_hash) { setMsg("Password lama salah."); return; }
    const nh = await hashPassword(newPw);
    const { error } = await db.from("admins").update({ password_hash: nh }).eq("id", adm.id);
    if (error) { setMsg("Gagal: " + error.message); return; }
    setCurPw(""); setNewPw(""); setNewPw2("");
    setMsg("PIN admin diubah. Pakai PIN baru di login berikutnya.");
  }

  async function loadProducts(tid) {
    const db = supabase();
    const { data: prods, error: prodErr } = await db
      .from("products")
      .select("id,name,price_cents,category,is_active,created_at")
      .eq("tenant_id", tid)
      .order("created_at");
    if (prodErr) {
      // Kolom category belum ada di DB = migrasi 003 belum dijalankan.
      setMsg("Gagal memuat produk: " + prodErr.message);
      setProducts([]);
      setVariants([]);
      setVForms({});
      return;
    }
    setProducts(prods || []);
    const ids = (prods || []).map((p) => p.id);
    if (!ids.length) {
      setVariants([]);
      setVForms({});
      return;
    }
    const { data: vs } = await db
      .from("variants")
      .select("id,product_id,name,price_delta_cents,created_at")
      .in("product_id", ids)
      .order("created_at");
    setVariants(vs || []);
    setVForms(
      Object.fromEntries((prods || []).map((p) => [p.id, { name: "", delta: "" }]))
    );
  }

  function openTenant(t) {
    setTenantId(t.id);
    loadProducts(t.id);
  }

  async function addProduct(e) {
    e.preventDefault();
    const cents = Math.round(parseFloat(pPrice || "0") * 100);
    if (!pName.trim() || isNaN(cents) || cents < 0) {
      setMsg("Nama & harga produk wajib diisi (harga >= 0).");
      return;
    }
    const db = supabase();
    const { error } = await db.from("products").insert({
      tenant_id: tenantId,
      name: pName.trim(),
      price_cents: cents,
      category: pCategory,
    });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setPName("");
    setPPrice("");
    setPCategory(CATEGORIES[0]);
    loadProducts(tenantId);
  }

  function startEdit(p) {
    setEditing({
      id: p.id,
      name: p.name,
      price: String(p.price_cents / 100),
      category: p.category || CATEGORIES[0],
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    const cents = Math.round(parseFloat(editing.price || "0") * 100);
    if (!editing.name.trim() || isNaN(cents) || cents < 0) {
      setMsg("Nama & harga produk wajib diisi (harga >= 0).");
      return;
    }
    const db = supabase();
    const { error } = await db
      .from("products")
      .update({
        name: editing.name.trim(),
        price_cents: cents,
        category: editing.category,
      })
      .eq("id", editing.id);
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setEditing(null);
    setMsg("Produk diperbarui.");
    loadProducts(tenantId);
  }

  async function toggleProduct(p) {
    const db = supabase();
    await db
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    loadProducts(tenantId);
  }

  async function delProduct(p) {
    const db = supabase();
    await db.from("variants").delete().in("product_id", [p.id]);
    await db.from("products").delete().eq("id", p.id);
    loadProducts(tenantId);
  }

  async function addVariant(pid) {
    const f = vForms[pid] || { name: "", delta: "" };
    if (!f.name.trim()) {
      setMsg("Nama varian wajib diisi.");
      return;
    }
    const delta = f.delta.trim() === "" ? 0 : parseInt(f.delta, 10);
    if (isNaN(delta)) {
      setMsg("Selisih harga varian harus angka.");
      return;
    }
    const db = supabase();
    const { error } = await db.from("variants").insert({
      product_id: pid,
      name: f.name.trim(),
      price_delta_cents: Math.round(delta * 100),
    });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    loadProducts(tenantId);
  }

  async function delVariant(v) {
    const db = supabase();
    await db.from("variants").delete().eq("id", v.id);
    loadProducts(tenantId);
  }

  if (!authed) {
    return (
      <main style={{ padding: 24 }}>
        <p>Memeriksa sesi admin...</p>
      </main>
    );
  }

  if (needSetup) {
    return (
      <main className="page">
        <h2>Buat Admin Pertama (PIN 6 angka)</h2>
        <p>Belum ada akun admin. Buat sekarang (cukup sekali).</p>
        <form onSubmit={createFirstAdmin}>
          <input
            value={adminUser}
            onChange={(e) => setAdminUser(e.target.value)}
            placeholder="Username admin"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            type="password"
            value={adminPw}
            onChange={(e) => setAdminPw(e.target.value)}
            placeholder="Password (min 4 karakter)"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <button type="submit" className="btn btn-primary btn-block">
            Buat Admin
          </button>
        </form>
        {msg && <p className="msg">{msg}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Kelola Tenant</h1>
      <Link href="/">← Kembali ke login</Link>
      <section className="card">
        <h2>Ubah PIN Admin</h2>
        <p style={{ fontSize: 13, color: "#6f6252" }}>
          Boleh pure PIN 6 angka, atau password minimal 8 karakter. PIN lebih lemah:
          jangan dipakai buat data uang sungguhan sebelum rate limit server-side aktif (F0b).
        </p>
        <form onSubmit={changeAdminPw}>
          <input
            placeholder="PIN lama (6 angka)"
            type="password"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
            style={{ width: "100%", padding: 12, marginBottom: 8 }}
          />
          <input
            placeholder="PIN baru (6 angka)"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            style={{ width: "100%", padding: 12, marginBottom: 8 }}
          />
          <input
            placeholder="Ulangi PIN baru"
            type="password"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            style={{ width: "100%", padding: 12, marginBottom: 8 }}
          />
          <button type="submit" className="btn btn-primary btn-block">
            Simpan PIN Baru
          </button>
        </form>
      </section>
      <section className="card">
        <h2>Tambah Tenant</h2>
        <form onSubmit={addTenant}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama tenant"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN (4-6 digit)"
            inputMode="numeric"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            value={qris}
            onChange={(e) => setQris(e.target.value)}
            placeholder="URL foto QRIS (wajib)"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <button type="submit" className="btn btn-primary btn-block">
            Simpan
          </button>
        </form>
      </section>
      {msg && <p className="msg">{msg}</p>}
      <h2>Daftar ({rows.length})</h2>
      <ul>
        {rows.map((t) => (
          <li key={t.id} onClick={() => openTenant(t)}>
            {t.name} — {t.qris_photo_url ? "QRIS ok" : "QRIS kosong"}
          </li>
        ))}
      </ul>
      {tenantId !== null && (
        <section className="card">
          <h2>Produk</h2>
          <form onSubmit={addProduct}>
            <input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="Nama produk"
              style={{ width: "100%", padding: 10, marginBottom: 8 }}
            />
            <input
              value={pPrice}
              onChange={(e) => setPPrice(e.target.value)}
              placeholder="Harga (Rp)"
              inputMode="numeric"
              style={{ width: "100%", padding: 10, marginBottom: 8 }}
            />
            <select
              value={pCategory}
              onChange={(e) => setPCategory(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 8 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary btn-block">
              Tambah
            </button>
          </form>
          <ul>
            {products.map((p) => (
              <li key={p.id}>
                {p.name} — Rp{(p.price_cents / 100).toLocaleString("id-ID")}{" "}
                {p.category ? "[" + p.category + "]" : ""}{" "}
                {p.is_active ? "" : "(mati)"}
                <button className="btn btn-sm" type="button" onClick={() => toggleProduct(p)}
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                >
                  {p.is_active ? "Matikan" : "Aktifkan"}
                </button>
                <button className="btn btn-sm" type="button" onClick={() => startEdit(p)}
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                >
                  Edit
                </button>
                <button className="btn btn-sm" type="button" onClick={() => delProduct(p)}
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                >
                  Hapus
                </button>
                {editing && editing.id === p.id && (
                  <form onSubmit={saveEdit} style={{ marginTop: 8 }}>
                    <input
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      placeholder="Nama produk"
                      style={{ padding: 6, marginRight: 6 }}
                    />
                    <input
                      value={editing.price}
                      onChange={(e) =>
                        setEditing({ ...editing, price: e.target.value })
                      }
                      placeholder="Harga (Rp)"
                      inputMode="numeric"
                      style={{ padding: 6, marginRight: 6 }}
                    />
                    <select
                      value={editing.category}
                      onChange={(e) =>
                        setEditing({ ...editing, category: e.target.value })
                      }
                      style={{ padding: 6, marginRight: 6 }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn btn-primary btn-block">
                      Simpan
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setEditing(null)}
                      style={{ padding: "6px 10px" }}
                    >
                      Batal
                    </button>
                  </form>
                )}
                <ul>
                  {variants
                    .filter((v) => v.product_id === p.id)
                    .map((v) => (
                      <li key={v.id}>
                        {v.name} (Rp
                        {(v.price_delta_cents / 100).toLocaleString("id-ID")})
                        <button className="btn btn-sm" type="button" onClick={() => delVariant(v)}
                          style={{ padding: "2px 6px", marginLeft: 6 }}
                        >
                          x
                        </button>
                      </li>
                    ))}
                </ul>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addVariant(p.id);
                  }}
                >
                  <input
                    value={(vForms[p.id] || {}).name || ""}
                    onChange={(e) =>
                      setVForms({
                        ...vForms,
                        [p.id]: { ...(vForms[p.id] || {}), name: e.target.value },
                      })
                    }
                    placeholder="Varian"
                    style={{ padding: 6, marginRight: 6 }}
                  />
                  <input
                    value={(vForms[p.id] || {}).delta || ""}
                    onChange={(e) =>
                      setVForms({
                        ...vForms,
                        [p.id]: { ...(vForms[p.id] || {}), delta: e.target.value },
                      })
                    }
                    placeholder="Selisih Rp"
                    inputMode="numeric"
                    style={{ padding: 6, marginRight: 6 }}
                  />
                  <button type="submit" className="btn btn-primary btn-block">
                    + Varian
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
