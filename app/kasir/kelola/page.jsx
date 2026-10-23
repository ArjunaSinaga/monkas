"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getSession, clearSession } from "../../../lib/pin";

// Konvensi DB monkas: kolom price_cents menyimpan nilai rupiah mentah (12000 = Rp12.000),
// sesuai fungsi fmt() di kasir yang menampilkannya apa adanya.
const rpJadiCents = (rp) => Math.round(parseFloat(String(rp).replace(/[^\d]/g, "") || "0"));
const centsJadiRp = (c) => Number(c || 0);

export default function KelolaPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // form tambah
  const [namaBaru, setNamaBaru] = useState("");
  const [katBaru, setKatBaru] = useState("");
  const [hargaBaru, setHargaBaru] = useState("");
  // edit inline
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const muat = useCallback(async (tid) => {
    const { data, error } = await supabase()
      .from("products")
      .select("id, name, category, price_cents, is_active, variants(id, name, price_delta_cents)")
      .eq("tenant_id", tid)
      .order("name");
    if (!error && data) setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s || !s.tenant_id) {
      router.replace("/");
      return;
    }
    (async () => {
      setTenant(s);
      await muat(s.tenant_id);
    })();
  }, [router, muat]);

  const tandai = (m) => { setMsg(m); setErr("");setTimeout(() => { setMsg(""); }, 2200); };
  const gagal = (m) => { setErr(m); setMsg(""); };

  const validasiBaru = () => {
    if (!namaBaru.trim()) return "Nama produk wajib diisi.";
    if (hargaBaru === "" || isNaN(parseFloat(hargaBaru))) return "Harga wajib angka (rupiah).";
    if (rpJadiCents(hargaBaru) <= 0) return "Harga harus di atas 0.";
    return null;
  };

  const tambahProduk = async (e) => {
    e.preventDefault();
    const salah = validasiBaru();
    if (salah) return gagal(salah);
    const { error } = await supabase()
      .from("products")
      .insert({ tenant_id: tenant.tenant_id, name: namaBaru.trim(), category: katBaru.trim() || null, price_cents: rpJadiCents(hargaBaru), is_active: true });
    if (error) return gagal("Gagal menambah produk: " + (error.message || error.code));
    setNamaBaru(""); setKatBaru(""); setHargaBaru("");
    tandai("Produk ditambahkan");
    muat(tenant.tenant_id);
  };

  const mulaiEdit = (p) => { setEditId(p.id); setDraft({ name: p.name, category: p.category || "", hargaRp: String(centsJadiRp(p.price_cents)) }); };
  const simpanEdit = async () => {
    if (!draft.name.trim()) return gagal("Nama tidak boleh kosong.");
    if (rpJadiCents(draft.hargaRp) <= 0) return gagal("Harga harus di atas 0.");
    const { error } = await supabase()
      .from("products")
      .update({ name: draft.name.trim(), category: draft.category.trim() || null, price_cents: rpJadiCents(draft.hargaRp) })
      .eq("id", editId);
    if (error) return gagal("Gagal menyimpan: " + (error.message || "unknown"));
    setEditId(null); setDraft(null);
    tandai("Perubahan tersimpan");
    muat(tenant.tenant_id);
  };

  const toggleAktif = async (p) => {
    const { error } = await supabase().from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return gagal("Gagal mengubah status.");
    muat(tenant.tenant_id);
  };

  const tambahVarian = async (p) => {
    const nama = window.prompt("Nama varian (mis. Es, Large):");
    if (!nama || !nama.trim()) return;
    const delta = window.prompt("Tambahan harga (rupiah, 0 jika gratis):", "0") || "0";
    const { error } = await supabase().from("variants").insert({ product_id: p.id, name: nama.trim(), price_delta_cents: rpJadiCents(delta) });
    if (error) return gagal("Gagal menambah varian: " + (error.message || "unknown"));
    tandai("Varian ditambah");
    muat(tenant.tenant_id);
  };

  const hapusVarian = async (v) => {
    if (!window.confirm(`Hapus varian "${v.name}"?`)) return;
    const { error } = await supabase().from("variants").delete().eq("id", v.id);
    if (error) return gagal("Gagal menghapus varian.");
    muat(tenant.tenant_id);
  };

  if (!tenant || loading) {
    return <main className="page"><p className="muted">{tenant ? "Memuat produk..." : "Memeriksa sesi..."}</p></main>;
  }

  return (
    <main className="page page-wide page-fadein">
      <header className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1>Kelola Produk - {tenant.tenant_name}</h1>
          <p className="muted">Tambah, ubah, nonaktifkan produk & varian milik tenant-mu.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => router.push("/kasir")}>Kasir</button>
          <button type="button" className="btn btn-sm" onClick={() => { clearSession(); router.replace("/"); }}>Keluar</button>
        </div>
      </header>

      {msg && <div className="card msg-ok" style={{ marginBottom: 12 }}><span>{msg}</span></div>}
      {err && <div className="card msg-error-wrap" style={{ marginBottom: 12 }}><span className="msg msg-error">{err}</span></div>}

      <form className="card" onSubmit={tambahProduk} style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label style={{ flex: "2 1 200px", display: "block" }}>
          <span className="muted" style={{ fontSize: 13 }}>Nama produk</span>
          <input className="field" value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="mis. Kopi Susu" />
        </label>
        <label style={{ flex: "1 1 140px", display: "block" }}>
          <span className="muted" style={{ fontSize: 13 }}>Kategori</span>
          <input className="field" value={katBaru} onChange={(e) => setKatBaru(e.target.value)} placeholder="mis. Minuman" />
        </label>
        <label style={{ flex: "1 1 140px", display: "block" }}>
          <span className="muted" style={{ fontSize: 13 }}>Harga (Rp)</span>
          <input className="field" inputMode="numeric" value={hargaBaru} onChange={(e) => setHargaBaru(e.target.value)} placeholder="12000" />
        </label>
        <button type="submit" className="btn btn-primary">+ Tambah Produk</button>
      </form>

      {products.length === 0 ? (
        <p className="muted">Belum ada produk. Tambah produk pertama lewat form di atas.</p>
      ) : (
        <ul className="list">
          {products.map((p) => (
            <li key={p.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
              {editId === p.id ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                  <label style={{ flex: "2 1 180px" }}>
                    <span className="muted" style={{ fontSize: 13 }}>Nama</span>
                    <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </label>
                  <label style={{ flex: "1 1 120px" }}>
                    <span className="muted" style={{ fontSize: 13 }}>Kategori</span>
                    <input className="field" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                  </label>
                  <label style={{ flex: "1 1 120px" }}>
                    <span className="muted" style={{ fontSize: 13 }}>Harga (Rp)</span>
                    <input className="field" inputMode="numeric" value={draft.hargaRp} onChange={(e) => setDraft({ ...draft, hargaRp: e.target.value })} />
                  </label>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-primary" onClick={simpanEdit}>Simpan</button>
                    <button type="button" className="btn" onClick={() => { setEditId(null); setDraft(null); }}>Batal</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div className="row" style={{ gap: 8 }}>
                        <strong>{p.name}</strong>
                        {p.category && <span className="chip">{p.category}</span>}
                        {!p.is_active && <span style={{ color: "var(--danger)", fontSize: 13 }}>nonaktif</span>}
                      </div>
                      <div className="price" style={{ color: "var(--accent)", fontWeight: 650 }}>
                        Rp{centsJadiRp(p.price_cents).toLocaleString("id-ID")}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn btn-sm" onClick={() => mulaiEdit(p)}>Ubah</button>
                      <button type="button" className="btn btn-sm" onClick={() => toggleAktif(p)}>{p.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                      <button type="button" className="btn btn-sm" onClick={() => tambahVarian(p)}>+ Varian</button>
                    </div>
                  </div>
                  {p.variants?.length > 0 && (
                    <ul className="list" style={{ marginTop: 8 }}>
                      {p.variants.map((v) => (
                        <li key={v.id} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                          <span>{v.name} {v.price_delta_cents ? <span className="muted">(+Rp{centsJadiRp(v.price_delta_cents).toLocaleString("id-ID")})</span> : null}</span>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => hapusVarian(v)}>Hapus</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
