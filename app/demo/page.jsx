'use client';

// Mode demo: POS MONKAS dengan data seed, TANPA Supabase.
// Tujuannya: bisa dicek di Vercel (preview ke merchant) sebelum project live siap.
// Route: /demo

import { useRef, useState } from "react";

const TENANT = { id: "demo", name: "Kopi Senja" };

const PRODUCTS = [
  { id: "p1", name: "Kopi Susu Gula Aren", price_cents: 22000, category: "Minuman", variants: [
    { id: "v1", name: "Hot", price_delta_cents: 0 },
    { id: "v2", name: "Iced", price_delta_cents: 0 },
    { id: "v3", name: "Less Ice", price_delta_cents: -1000 },
  ]},
  { id: "p2", name: "Espresso", price_cents: 18000, category: "Minuman", variants: [
    { id: "v4", name: "Single", price_delta_cents: 0 },
    { id: "v5", name: "Double", price_delta_cents: 6000 },
  ]},
  { id: "p3", name: "Roti Bakar Cokelat", price_cents: 24000, category: "Makanan", variants: [
    { id: "v6", name: "Original", price_delta_cents: 0 },
  ]},
  { id: "p4", name: "Nasi Goreng", price_cents: 28000, category: "Makanan", variants: [
    { id: "v7", name: "Ayam", price_delta_cents: 5000 },
    { id: "v8", name: "Seafood", price_delta_cents: 9000 },
  ]},
  { id: "p5", name: "Air Mineral", price_cents: 8000, category: "Minuman", variants: [
    { id: "v9", name: "Regular", price_delta_cents: 0 },
  ]},
];

const rupiah = (c) => "Rp" + (c / 100).toLocaleString("id-ID");

export default function DemoKasir() {
  const [cart, setCart] = useState([]);
  const [cat, setCat] = useState("Semua");
  const [paid, setPaid] = useState(0);
  const [done, setDone] = useState(null);
  const [query, setQuery] = useState("");
  const [popId, setPopId] = useState(null);
  const popTimer = useRef(null);

  const cats = ["Semua", ...Array.from(new Set(PRODUCTS.map((p) => p.category)))];
  const list = PRODUCTS.filter(
    (p) => (cat === "Semua" || p.category === cat) &&
      p.name.toLowerCase().includes(query.toLowerCase())
  );

  const total = cart.reduce((a, b) => a + b.price_cents * b.qty, 0);

  function add(p, v) {
    const key = p.id + "-" + v.id;
    setPopId(p.id);
    clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPopId(null), 300);
    setCart((c) => {
      const found = c.find((x) => x.key === key);
      if (found) return c.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { key, product_id: p.id, product_name: p.name, variant_name: v.name, price_cents: p.price_cents + v.price_delta_cents, qty: 1 }];
    });
  }
  function changeQty(key, d) {
    setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0));
  }
  function checkout() {
    setDone({ total, items: cart, at: new Date().toLocaleString("id-ID") });
    setCart([]);
    setPaid(0);
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#f5f1e8", color: "#2b2118", minHeight: "100vh", padding: 16 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>MONKAS - Mode Demo</h1>
            <p style={{ margin: "4px 0 0", color: "#6f6252", fontSize: 14 }}>
              Tenant: {TENANT.name} - data contoh, tanpa Supabase. Alur nyata: pilih produk, masukkan keranjang, bayar, struk.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk..."
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e8e0cf", background: "#fff", minWidth: 180 }}
            />
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{
                  padding: "8px 12px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${cat === c ? "#3d2c1e" : "#e8e0cf"}`,
                  background: cat === c ? "#3d2c1e" : "#fff",
                  color: cat === c ? "#fff" : "#2b2118",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {list.map((p) => (
              <div key={p.id} className={"menu-card" + (popId === p.id ? " menu-card-pop" : "")} style={{ background: "#fff", border: "1px solid #e8e0cf", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                <div style={{ color: "#9a6a2f", fontWeight: 600, margin: "4px 0 8px" }}>{rupiah(p.price_cents)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => add(p, v)}
                      style={{
                        padding: "6px 10px", borderRadius: 999, cursor: "pointer",
                        border: "1px solid #e8e0cf", background: "#faf7ef", color: "#2b2118", fontSize: 13,
                      }}
                    >
                      {v.name}{v.price_delta_cents ? " (+" + rupiah(v.price_delta_cents) + ")" : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside style={{ background: "#fff", border: "1px solid #e8e0cf", borderRadius: 12, padding: 12, position: "sticky", top: 16 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Struk</h2>
            {cart.length === 0 && <div style={{ color: "#6f6252", fontSize: 14 }}>Keranjang masih kosong.</div>}
            {cart.map((it) => (
              <div key={it.key} className="baris-keranjang" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0ebe0", fontSize: 14 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                  <div style={{ color: "#6f6252" }}>{it.variant_name} x{it.qty} - {rupiah(it.price_cents * it.qty)}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => changeQty(it.key, -1)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e8e0cf", background: "#faf7ef", cursor: "pointer" }}>-</button>
                  <button onClick={() => changeQty(it.key, 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e8e0cf", background: "#faf7ef", cursor: "pointer" }}>+</button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontWeight: 700 }}>
              <span>Total</span><span>{rupiah(total)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
              <input
                value={paid}
                onChange={(e) => setPaid(Number(e.target.value) || 0)}
                placeholder="Uang diterima"
                type="number"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e8e0cf" }}
              />
              <button
                onClick={checkout}
                disabled={cart.length === 0}
                style={{
                  padding: "10px 14px", borderRadius: 10, border: "none", cursor: cart.length ? "pointer" : "not-allowed",
                  background: "#3d2c1e", color: "#fff", fontWeight: 600,
                }}
              >
                Bayar
              </button>
            </div>
            {paid > 0 && cart.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 14, color: paid >= total ? "#1f6b4a" : "#b42318" }}>
                Kembali {rupiah(paid - total)}
              </div>
            )}
            {done && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#f0f6f2", border: "1px solid #cfe3d7", fontSize: 14 }}>
                <div style={{ fontWeight: 700, color: "#1f6b4a" }}>Transaksi tersimpan (demo)</div>
                <div>{done.items.length} item - {rupiah(done.total)}</div>
                <div style={{ color: "#6f6252" }}>{done.at}</div>
              </div>
            )}
          </aside>
        </div>

        <p style={{ marginTop: 20, color: "#6f6252", fontSize: 13 }}>
          Ini mode demo tanpa database. Versi live (login tenant, RLS, tutup hari, QRIS) ada di app utama setelah Supabase +
          Vercel terhubung. Sumber: repo ArjunaSinaga/monkas.
        </p>
      </div>
    </main>
  );
}
