"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { hashPin, hashPassword, getAdminSession, checkAdminPasswordPolicy } from "../../lib/pin";
import { Popup, Kotak } from "./komponen";

const rupiah = (c) => "Rp" + Number(c || 0).toLocaleString("id-ID");

const IconTenant = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />
  </svg>
);
const IconPin = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M17 12v3M20 12v2" />
  </svg>
);
const IconLaporan = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
const IconTutup = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export default function AdminPage() {
  const router = useRouter();
  const [siap, setSiap] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [popup, setPopup] = useState(null); // "tenant" | "pin" | "laporan" | "riwayat" | "tutup"
  const [msg, setMsg] = useState("");
  const [tenantOrang, setTenantOrang] = useState(null); // tenant yang riwayatnya dibuka

  // data
  const [tenants, setTenants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [produk, setProduk] = useState([]);
  const [tenantAktif, setTenantAktif] = useState(null);
  // konfirmasi 3 lapis: nonaktifkan tenant
  const [konfirmasi, setKonfirmasi] = useState(null);
  const [konNama, setKonNama] = useState("");
  const [konPin, setKonPin] = useState("");

  // form tambah tenant
  const [nama, setNama] = useState("");
  const [pin, setPin] = useState("");
  const [qris, setQris] = useState("");
  // form ganti pin admin
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  useEffect(() => {
    let batal = false;
    async function muat() {
      const s = getAdminSession();
      if (!s) {
        router.replace("/");
        return;
      }
      setAdminName(s.username || "admin");
      const db = supabase();
      const { data: t } = await db.from("tenants").select("id,name,qris_photo_url,created_at,is_active").order("name");
      const { data: o } = await db.from("orders").select("id,tenant_id,items,total_cents,paid_at,voided").order("paid_at", { ascending: false }).limit(500);
      if (batal) return;
      setTenants(t || []);
      setOrders(o || []);
      setSiap(true);
    }
    muat();
    return () => { batal = true; };
  }, [router]);

  async function muatTenant() {
    const db = supabase();
    const { data } = await db.from("tenants").select("id,name,qris_photo_url,created_at,is_active").order("name");
    setTenants(data || []);
  }

  async function muatProduk(tenantId) {
    const db = supabase();
    const { data } = await db
      .from("products")
      .select("id,name,price_cents,category,is_active")
      .eq("tenant_id", tenantId)
      .order("name");
    setProduk(data || []);
  }

  // ---------- tambah tenant ----------
  async function tambahTenant(e) {
    e.preventDefault();
    if (!nama.trim()) { setMsg("Nama tenant wajib diisi."); return; }
    if (!/^\d{4,6}$/.test(pin.trim())) { setMsg("PIN tenant harus 4-6 angka."); return; }
    const db = supabase();
    const { data: dup } = await db.from("tenants").select("id").eq("name", nama.trim()).maybeSingle();
    if (dup) { setMsg("Nama tenant sudah dipakai."); return; }
    const { data: adminRow } = await db.from("admins").select("id").eq("username", nama.trim()).maybeSingle();
    if (adminRow) { setMsg("Nama tenant tidak boleh sama dengan username admin."); return; }
    const h = await hashPin(pin.trim());
    const { error } = await db.from("tenants").insert({
      name: nama.trim(),
      pin_hash: h,
      qris_photo_url: qris.trim() || null,
    });
    if (error) { setMsg("Gagal: " + error.message); return; }
    setNama(""); setPin(""); setQris("");
    setMsg("Tenant '" + nama.trim() + "' dibuat dengan PIN " + pin.trim() + ". Catat PIN ini, tidak bisa dibaca lagi.");
    await muatTenant();
  }

  // ---------- nonaktifkan tenant (konfirmasi 3 lapis) ----------
  // Lapis 1: klik tombol Nonaktifkan
  // Lapis 2: ketik ulang nama tenant persis
  // Lapis 3: masukkan PIN admin (6 angka)
  // Hasil: soft delete (is_active=false + deleted_at). Riwayat order tetap utuh.
  async function nonaktifkanTenant(e) {
    e.preventDefault();
    const t = konfirmasi;
    if (!t) return;
    if (konNama.trim() !== t.name) {
      setMsg("Nama tenant tidak cocok. Ketik ulang persis: " + t.name);
      return;
    }
    if (!/^\d{6}$/.test(konPin.trim())) {
      setMsg("PIN admin harus 6 angka.");
      return;
    }
    const db = supabase();
    const hash = await hashPassword(konPin.trim());
    const { data: okNonaktif, error: rpcErr } = await db.rpc("monkas_admin_set_tenant_active", {
      p_username: adminName,
      p_admin_hash: hash,
      p_tenant: t.id,
      p_active: false,
    });
    if (rpcErr) {
      // Migrasi 005 belum diterapkan: jalur lama
      if (!/Could not find the function|does not exist/i.test(rpcErr.message || "")) {
        setMsg("Gagal: " + rpcErr.message); return;
      }
      const { data: adm } = await db.from("admins").select("id,password_hash").eq("username", adminName).maybeSingle();
      if (!adm) { setMsg("Akun admin tidak ditemukan."); return; }
      if (hash !== adm.password_hash) { setMsg("PIN admin salah."); return; }
      const { error } = await db.from("tenants")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) { setMsg("Gagal: " + error.message); return; }
    } else if (!okNonaktif) { setMsg("PIN admin salah."); return; }
    setKonfirmasi(null);
    setKonNama("");
    setKonPin("");
    setMsg("Tenant '" + t.name + "' dinonaktifkan. Bisa dipulihkan di daftar nonaktif.");
    await muatTenant();
  }

  // ---------- pulihkan tenant ----------
  async function pulihkanTenant(t) {
    const db = supabase();
    const { error } = await db
      .from("tenants")
      .update({ is_active: true, deleted_at: null })
      .eq("id", t.id);
    if (error) { setMsg("Gagal: " + error.message); return; }
    setMsg("Tenant '" + t.name + "' dipulihkan.");
    await muatTenant();
  }

  // ---------- reset PIN tenant ----------
  async function resetPinTenant(t) {
    const adminPin = window.prompt("PIN admin untuk konfirmasi reset PIN tenant '" + t.name + "':");
    if (!adminPin) return;
    const baru = String(Math.floor(100000 + Math.random() * 900000));
    const h = await hashPin(baru);
    const adminHash = await hashPassword(adminPin.trim());
    const db = supabase();
    const { data: ok, error } = await db.rpc("monkas_admin_set_tenant_pin", {
      p_username: adminName,
      p_admin_hash: adminHash,
      p_tenant: t.id,
      p_new_hash: h,
    });
    if (error) {
      if (!/Could not find the function|does not exist/i.test(error.message || "")) {
        setMsg("Gagal: " + error.message); return;
      }
      const { data: adm } = await db.from("admins").select("id,password_hash").eq("username", adminName).maybeSingle();
      if (!adm || adm.password_hash !== adminHash) { setMsg("PIN admin salah."); return; }
      const { error: e2 } = await db.from("tenants").update({ pin_hash: h }).eq("id", t.id);
      if (e2) { setMsg("Gagal: " + e2.message); return; }
    } else if (!ok) { setMsg("PIN admin salah."); return; }
    setMsg("PIN baru tenant '" + t.name + "': " + baru + " (tidak bisa dibaca lagi, catat sekarang).");
    await muatTenant();
  }

  // ---------- ganti PIN admin ----------
  async function gantiPinAdmin(e) {
    e.preventDefault();
    const err = checkAdminPasswordPolicy(newPw);
    if (err) { setMsg(err); return; }
    if (newPw !== newPw2) { setMsg("Konfirmasi PIN tidak sama."); return; }
    const db = supabase();
    const cur = await hashPassword(curPw);
    const nh = await hashPassword(newPw);
    const { data: ok, error } = await db.rpc("monkas_admin_set_password", {
      p_username: adminName,
      p_old_hash: cur,
      p_new_hash: nh,
    });
    if (error) {
      if (!/Could not find the function|does not exist/i.test(error.message || "")) {
        setMsg("Gagal: " + error.message); return;
      }
      const { data: adm } = await db.from("admins").select("id,password_hash").eq("username", adminName).maybeSingle();
      if (!adm) { setMsg("Akun admin tidak ditemukan."); return; }
      if (cur !== adm.password_hash) { setMsg("PIN lama salah."); return; }
      const { error: e2 } = await db.from("admins").update({ password_hash: nh }).eq("id", adm.id);
      if (e2) { setMsg("Gagal: " + e2.message); return; }
    } else if (!ok) { setMsg("PIN lama salah."); return; }
    setCurPw(""); setNewPw(""); setNewPw2("");
    setMsg("PIN admin diganti. Pakai PIN baru di login berikutnya.");
  }

  // ---------- laporan ----------
  const laporan = tenants.map((t) => {
    const milik = orders.filter((o) => o.tenant_id === t.id && !o.voided);
    const omzet = milik.reduce((a, b) => a + (b.total_cents || 0), 0);
    return { tenant: t, jumlah: milik.length, omzet };
  }).filter((r) => r.jumlah > 0);

  // ---------- riwayat tenant ----------
  const riwayat = tenantOrang
    ? orders
        .filter((o) => o.tenant_id === tenantOrang.id)
        .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))
    : [];

  const ringkasItem = (items) =>
    (items || []).map((x) => x.product_name + (x.variant_name ? " " + x.variant_name : "") + (x.qty > 1 ? " x" + x.qty : "")).join(", ");

  // ---------- tutup hari ----------
  // WIB (UTC+7): paid_at disimpan UTC, jadi geser +7 jam sebelum ambil tanggalnya.
  const wib = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3);
  const hariIni = wib(new Date().toISOString()).toISOString().slice(0, 10);
  const hariIniOrders = orders.filter((o) => !o.voided && wib(o.paid_at).toISOString().slice(0, 10) === hariIni);
  const omzetHariIni = hariIniOrders.reduce((a, b) => a + (b.total_cents || 0), 0);

  function exportCsv() {
    // CSV "Tutup Hari" hanya berisi transaksi hari ini (bukan semua riwayat), agar rekap benar.
    const header = "tanggal,tenant,transaksi,omzet\n";
    const rekap = tenants
      .map((t) => {
        const milik = hariIniOrders.filter((o) => o.tenant_id === t.id);
        return { name: t.name, jumlah: milik.length, omzet: milik.reduce((a, b) => a + (b.total_cents || 0), 0) };
      })
      .filter((r) => r.jumlah > 0);
    const baris = rekap.map((r) => [hariIni, r.name, r.jumlah, r.omzet].join(",")).join("\n");
    const blob = new Blob([header + baris], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rekap-monkas-" + hariIni + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!siap) {
    return <main className="page"><p className="muted">Memuat...</p></main>;
  }

  const aktif = tenants.filter((t) => t.is_active !== false);
  const nonaktif = tenants.filter((t) => t.is_active === false);

  return (
    <main className="page page-wide">
      <header className="row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1>MONKAS Admin</h1>
          <p className="muted">Masuk sebagai {adminName}. Pilih kotak untuk membuka-fitur.</p>
        </div>
        <Link href="/" className="btn btn-sm">Kembali ke login</Link>
      </header>

      <div className="kotak-grid">
        <Kotak
          judul="Tenant"
          deskripsi="Daftar tenant, tambah tenant, nonaktifkan, reset PIN."
          meta={siap ? aktif.length + " aktif" + (nonaktif.length ? " - " + nonaktif.length + " nonaktif" : "") : "memuat..."}
          ikon={<IconTenant />}
          onClick={() => { setMsg(""); setPopup("tenant"); }}
        />
        <Kotak
          judul="Ganti PIN Admin"
          deskripsi="Ubah PIN admin yang dipakai untuk masuk."
          meta="6 angka"
          ikon={<IconPin />}
          onClick={() => { setMsg(""); setPopup("pin"); }}
        />
        <Kotak
          judul="Laporan"
          deskripsi="Omzet dan jumlah transaksi per tenant."
          meta={siap ? laporan.length + " tenant ada transaksi" : "memuat..."}
          ikon={<IconLaporan />}
          onClick={() => { setMsg(""); setPopup("laporan"); }}
        />
        <Kotak
          judul="Tutup Hari"
          deskripsi="Rekap hari ini, kunci, dan unduh rekap CSV."
          meta={siap ? hariIniOrders.length + " transaksi hari ini" : "memuat..."}
          ikon={<IconTutup />}
          onClick={() => { setMsg(""); setPopup("tutup"); }}
        />
      </div>

      {/* ---------- popup tenant ---------- */}
      <Popup open={popup === "tenant"} judul="Tenant" lebar onClose={() => setPopup(null)}>
        {msg && <p className="msg">{msg}</p>}

        {konfirmasi ? (
          <form onSubmit={nonaktifkanTenant} className="stack-sm">
            <p className="muted">
              Langkah 2 dari 3. Ketik ulang nama tenant persis, lalu masukkan PIN admin
              (6 angka) untuk mengonfirmasi.
            </p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Tenant yang akan dinonaktifkan</span>
              <span style={{ fontWeight: 650 }}>{konfirmasi.name}</span>
            </div>
            <input
              className="field"
              placeholder={"Ketik ulang: " + konfirmasi.name}
              value={konNama}
              onChange={(e) => setKonNama(e.target.value)}
              autoComplete="off"
            />
            <input
              className="field"
              placeholder="PIN admin (6 angka)"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={konPin}
              onChange={(e) => setKonPin(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-danger">
                Ya, nonaktifkan
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setKonfirmasi(null);
                  setKonNama("");
                  setKonPin("");
                }}
              >
                Batal
              </button>
            </div>
            <p className="muted">
              Data transaksi tidak dihapus. Tenant bisa dipulihkan kapan saja dari daftar
              nonaktif.
            </p>
          </form>
        ) : (
          <>
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Tenant aktif ({aktif.length})</h3>
          {!siap && <p className="muted">Memuat data tenant...</p>}
          {siap && aktif.length === 0 && <p className="muted">Belum ada tenant.</p>}
          <ul className="list">
            {aktif.map((t) => (
              <li key={t.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="muted">
                    {t.qris_photo_url ? "QRIS terpasang" : "QRIS belum"}
                    {t.created_at ? " - " + String(t.created_at).slice(0, 10) : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setTenantAktif(t); muatProduk(t.id); }}
                  >
                    Produk
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => resetPinTenant(t)}>
                    Reset PIN
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      setMsg("");
                      setKonNama("");
                      setKonPin("");
                      setKonfirmasi(t);
                    }}
                  >
                    Nonaktifkan
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {nonaktif.length > 0 && (
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Nonaktif ({nonaktif.length})</h3>
            <ul className="list">
              {nonaktif.map((t) => (
                <li key={t.id} className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-muted)" }}>{t.name}</div>
                  <button type="button" className="btn btn-sm" onClick={() => pulihkanTenant(t)}>
                    Pulihkan
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}

        {!konfirmasi && (
        <form onSubmit={tambahTenant} className="stack-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h3 style={{ fontSize: 15 }}>Tambah tenant</h3>
          <input className="field" placeholder="Nama tenant (kafe)" value={nama} onChange={(e) => setNama(e.target.value)} />
          <input className="field" placeholder="PIN tenant (4-6 angka)" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <input className="field" placeholder="URL foto QRIS (opsional)" value={qris} onChange={(e) => setQris(e.target.value)} />
          <button type="submit" className="btn btn-primary">Simpan Tenant</button>
        </form>
        )}
      </Popup>

      {/* ---------- popup ganti pin ---------- */}
      <Popup open={popup === "pin"} judul="Ganti PIN Admin" onClose={() => setPopup(null)}>
        {msg && <p className="msg">{msg}</p>}
        <p className="muted">PIN admin = 6 angka. Setelah diganti, PIN baru langsung dipakai di login berikutnya.</p>
        <form onSubmit={gantiPinAdmin} className="stack-sm">
          <input className="field" placeholder="PIN lama (6 angka)" type="password" inputMode="numeric" maxLength={6} value={curPw} onChange={(e) => setCurPw(e.target.value.replace(/\D/g, ""))} />
          <input className="field" placeholder="PIN baru (6 angka)" type="password" inputMode="numeric" maxLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value.replace(/\D/g, ""))} />
          <input className="field" placeholder="Ulangi PIN baru" type="password" inputMode="numeric" maxLength={6} value={newPw2} onChange={(e) => setNewPw2(e.target.value.replace(/\D/g, ""))} />
          <button type="submit" className="btn btn-primary">Simpan PIN Baru</button>
        </form>
      </Popup>

      {/* ---------- popup laporan ---------- */}
      <Popup open={popup === "laporan"} judul="Laporan omzet" lebar onClose={() => setPopup(null)}>
        {laporan.length === 0 ? (
          <p className="muted">Belum ada transaksi.</p>
        ) : (
          <ul className="list">
            {laporan.map((r) => (
              <li key={r.tenant.id} className="row" style={{ justifyContent: "space-between" }}>
                <button type="button" className="btn btn-sm" onClick={() => { setTenantOrang(r.tenant); setPopup("riwayat"); }}>
                  {r.tenant.name}
                </button>
                <span className="row" style={{ gap: 16 }}>
                  <span className="muted">{r.jumlah} transaksi</span>
                  <span className="price" style={{ fontWeight: 650 }}>{rupiah(r.omzet)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Total: {rupiah(laporan.reduce((a, b) => a + b.omzet, 0))}</p>
      </Popup>

      {/* ---------- popup riwayat tenant ---------- */}
      <Popup open={popup === "riwayat"} judul={"Riwayat: " + (tenantOrang?.name || "")} lebar onClose={() => { setPopup("laporan"); setTenantOrang(null); }}>
        {riwayat.length === 0 ? (
          <p className="muted">Belum ada transaksi.</p>
        ) : (
          <ul className="list">
            {riwayat.map((o) => (
              <li key={o.id}>
                {o.voided && <span className="muted" style={{ textDecoration: "line-through" }}>{ringkasItem(o.items)}</span>}
                {!o.voided && <span>{ringkasItem(o.items)}</span>}
                {(o.voided || null) && <span className="muted" style={{ marginLeft: 4 }}>dibatalkan</span>}
                {!o.voided && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {riwayat.length < 100 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          if (!window.confirm(`Batalkan (void) pesanan ${o.id.slice(-6).toUpperCase()}?`)) return;
                          const { error: err } = await db.from("orders").update({ voided: true }).eq("id", o.id);
                          if (err) { setMsg("Void gagal."); return; }
                          setMsg("Pesanan dibatalkan");
                          setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, voided: true } : x)));
                        }}
                      >
                        Void
                      </button>
                    )}
                  </span>
                )}
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted">{new Date(o.paid_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="price">{rupiah(o.total_cents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">{riwayat.filter((o) => !o.voided).length} transaksi aktif, total {rupiah(riwayat.filter((o) => !o.voided).reduce((a, b) => a + (b.total_cents || 0), 0))}</p>
      </Popup>

      {/* ---------- popup tutup hari ---------- */}
      <Popup open={popup === "tutup"} judul="Tutup hari" onClose={() => setPopup(null)}>
        {msg && <p className="msg">{msg}</p>}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Tanggal</span>
          <span className="price" style={{ fontWeight: 650 }}>{hariIni}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Transaksi hari ini</span>
          <span className="price" style={{ fontWeight: 650 }}>{hariIniOrders.length}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Omzet hari ini</span>
          <span className="price" style={{ fontWeight: 650 }}>{rupiah(omzetHariIni)}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={laporan.length === 0}>
          Unduh rekap CSV
        </button>
        <p className="muted">Kunci hari (tidak bisa edit transaksi yang sudah ditutup) menyusul di langkah berikutnya.</p>
      </Popup>

      {/* ---------- popup produk tenant ---------- */}
      <Popup
        open={tenantAktif !== null}
        judul={"Produk - " + (tenantAktif ? tenantAktif.name : "")}
        lebar
        onClose={() => { setTenantAktif(null); setProduk([]); }}
      >
        {produk.length === 0 ? (
          <p className="muted">Tenant ini belum punya produk.</p>
        ) : (
          <ul className="list">
            {produk.map((p) => (
              <li key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="muted"> - {p.category} - {rupiah(p.price_cents)}</span>
                </div>
                <span className="muted">{p.is_active === false ? "nonaktif" : "aktif"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Pengelolaan produk (tambah/edit/hapus) adalah urusan tenant, bukan admin.</p>
      </Popup>
    </main>
  );
}
