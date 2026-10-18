"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  const [tenantId, setTenantId] = useState(null);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [vForms, setVForms] = useState({});

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
      setMsg("Foto QRIS wajib diisi (URL foto).");
      return;
    }
    const db = supabase();
    const h = hashPin(pin.trim());
    const { error } = await db.from("tenants").insert({
      name: name.trim(),
      pin_hash: h,
      qris_photo_url: qris.trim(),
    });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setName("");
    setPin("");
    setQris("");
    setMsg("Tenant tersimpan.");
    load();
  }

  async function loadProducts(tid) {
    const db = supabase();
    const { data: prods } = await db
      .from("products")
      .select("id,name,price_cents,is_active,created_at")
      .eq("tenant_id", tid)
      .order("created_at");
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
    });
    if (error) {
      setMsg("Gagal: " + error.message);
      return;
    }
    setPName("");
    setPPrice("");
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
      <main style={{ maxWidth: 420, margin: "10vh auto", padding: 16 }}>
        <h2>Buat Admin Pertama</h2>
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
          <button type="submit" style={{ padding: "10px 16px" }}>
            Buat Admin
          </button>
        </form>
        {msg && <p>{msg}</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "5vh auto", padding: 16 }}>
      <h1>Kelola Tenant</h1>
      <Link href="/">← Kembali ke login</Link>
      <section style={{ border: "1px solid #ccc", padding: 16, marginBottom: 16 }}>
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
          <button type="submit" style={{ padding: "10px 16px" }}>
            Simpan
          </button>
        </form>
      </section>
      {msg && <p>{msg}</p>}
      <h2>Daftar ({rows.length})</h2>
      <ul>
        {rows.map((t) => (
          <li key={t.id} onClick={() => openTenant(t)}>
            {t.name} — {t.qris_photo_url ? "QRIS ok" : "QRIS kosong"}
          </li>
        ))}
      </ul>
      {tenantId !== null && (
        <section style={{ border: "1px solid #ccc", padding: 16 }}>
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
            <button type="submit" style={{ padding: "10px 16px" }}>
              Tambah
            </button>
          </form>
          <ul>
            {products.map((p) => (
              <li key={p.id}>
                {p.name} — Rp{(p.price_cents / 100).toLocaleString("id-ID")}{" "}
                {p.is_active ? "" : "(mati)"}
                <button
                  type="button"
                  onClick={() => toggleProduct(p)}
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                >
                  {p.is_active ? "Matikan" : "Aktifkan"}
                </button>
                <button
                  type="button"
                  onClick={() => delProduct(p)}
                  style={{ padding: "4px 8px", marginLeft: 6 }}
                >
                  Hapus
                </button>
                <ul>
                  {variants
                    .filter((v) => v.product_id === p.id)
                    .map((v) => (
                      <li key={v.id}>
                        {v.name} (Rp
                        {(v.price_delta_cents / 100).toLocaleString("id-ID")})
                        <button
                          type="button"
                          onClick={() => delVariant(v)}
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
                  <button type="submit" style={{ padding: "6px 10px" }}>
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
