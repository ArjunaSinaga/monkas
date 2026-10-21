"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getSession, clearSession } from "../../lib/pin";

export default function KasirPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [ai, setAi] = useState(null);
  const [q, setQ] = useState("");
  const [kat, setKat] = useState("Semua");

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/");
      return;
    }
    (async () => {
      // setState di dalam callback async (aturan react-hooks/set-state-in-effect Next 16)
      setTenant(s);
      const { data, error } = await supabase()
        .from("products")
        .select("id, name, price_cents, is_active, variants(id, name, price_delta_cents)")
        .eq("tenant_id", s.id)
        .eq("is_active", true)
        .order("name");
      if (!error && data) setProducts(data);
      setLoading(false);
    })();
  }, [router]);

  // Saran AI: dipanggil tiap request, debounce 1,2 detik (hemat token + tagihan)
  useEffect(() => {
    if (!tenant) return undefined;
    const items = cart
      .map((x) => `${x.product_name}${x.variant_name ? " " + x.variant_name : ""} x${x.qty}`)
      .join(", ");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ intent: "kasir", tenant: tenant.name || "", items });
        const res = await fetch("/api/ai?" + qs.toString(), { signal: controller.signal });
        if (!res.ok) return;
        setAi(await res.json());
      } catch (err) {
        if (err?.name !== "AbortError") console.error("AI gagal:", err);
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tenant, cart]);

  const vkey = (pid, vid) => pid + "::" + (vid || "none");

  const addToCart = (product, variant) => {
    const key = vkey(product.id, variant?.id);
    setCart((c) => {
      const i = c.findIndex((x) => x.key === key);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...c,
        {
          key,
          product_id: product.id,
          product_name: product.name,
          variant_id: variant?.id || null,
          variant_name: variant?.name || null,
          unit_cents: product.price_cents + (variant?.price_delta_cents || 0),
          qty: 1,
        },
      ];
    });
  };

  const setQty = (key, qty) => {
    setCart((c) =>
      qty <= 0 ? c.filter((x) => x.key !== key) : c.map((x) => (x.key === key ? { ...x, qty } : x))
    );
  };

  const totalCents = cart.reduce((t, x) => t + x.unit_cents * x.qty, 0);
  const fmt = (c) => "Rp" + Number(c || 0).toLocaleString("id-ID");

  const pay = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    const { data: order, error } = await supabase()
      .from("orders")
      .insert({
        tenant_id: tenant.id,
        items: cart.map(({ key, ...item }) => item),
        total_cents: totalCents,
      })
      .select("id, paid_at, total_cents")
      .single();
    setSaving(false);
    if (error) {
      setCheckout({ error: "Gagal menyimpan pesanan." });
      console.error(error);
      return;
    }
    setCart([]);
    setCheckout(order);
  };

  const aiLabel = (x) => {
    if (!x) return "";
    if (x.tip) return x.tip;
    if (x.reason) return x.reason;
    return "Saran: " + (x.intent || "umum");
  };

  const kategori = ["Semua", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const tampil = products.filter(
    (p) =>
      (kat === "Semua" || p.category === kat) &&
      p.name.toLowerCase().includes(q.toLowerCase())
  );

  if (!tenant) {
    return (
      <main className="page">
        <p className="muted">Memeriksa sesi...</p>
      </main>
    );
  }

  return (
    <main className="page page-wide kasir-page">
      <header className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1>Kasir - {tenant.name}</h1>
          <p className="muted">Klik produk untuk menambah ke keranjang.</p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            clearSession();
            router.replace("/");
          }}
        >
          Keluar
        </button>
      </header>

      {ai && aiLabel(ai) && (
        <div className="card" style={{ marginBottom: 16, background: "var(--surface-sunken)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>{aiLabel(ai)}</span>
            <span className="muted" style={{ whiteSpace: "nowrap" }}>
              {ai.source}
              {ai.costUsd ? " - $" + ai.costUsd : ""}
            </span>
          </div>
        </div>
      )}

      <div className="kasir-grid">
        {/* ---- daftar produk ---- */}
        <section>
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              className="field"
              style={{ maxWidth: 240 }}
              placeholder="Cari produk..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="row" style={{ gap: 6 }}>
              {kategori.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setKat(k)}
                  style={
                    kat === k
                      ? { background: "var(--cta)", color: "#fff", borderColor: "var(--cta)" }
                      : undefined
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="muted">Memuat produk...</p>
          ) : tampil.length === 0 ? (
            <p className="muted">Belum ada produk aktif.</p>
          ) : (
            <div className="kotak-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {tampil.map((p) => (
                <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{p.name}</div>
                    <div className="price" style={{ color: "var(--accent)", fontWeight: 650, marginTop: 2 }}>
                      {fmt(p.price_cents)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: "auto" }}>
                    {p.variants && p.variants.length > 0 ? (
                      p.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addToCart(p, v)}
                        >
                          {v.name}
                          {v.price_delta_cents ? " (+" + fmt(v.price_delta_cents) + ")" : ""}
                        </button>
                      ))
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => addToCart(p, null)}
                      >
                        + Tambah
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---- keranjang ---- */}
        <aside className="kasir-keranjang">
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Keranjang</h2>
            {cart.length === 0 ? (
              <p className="muted">Keranjang masih kosong.</p>
            ) : (
              <>
                <ul className="list">
                  {cart.map((x) => (
                    <li key={x.key} className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{x.product_name}</div>
                        <div className="muted price">
                          {x.variant_name ? x.variant_name + " - " : ""}
                          {fmt(x.unit_cents)} x {x.qty}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => setQty(x.key, x.qty - 1)}
                          aria-label="Kurangi"
                        >
                          -
                        </button>
                        <span className="price" style={{ minWidth: 22, textAlign: "center" }}>
                          {x.qty}
                        </span>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => setQty(x.key, x.qty + 1)}
                          aria-label="Tambah"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div
                  className="row"
                  style={{ justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}
                >
                  <strong className="price">Total {fmt(totalCents)}</strong>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={pay}
                    disabled={saving}
                  >
                    {saving ? "Menyimpan..." : "Bayar"}
                  </button>
                </div>
                {checkout?.error && <p className="msg msg-error" style={{ marginTop: 12 }}>{checkout.error}</p>}
              </>
            )}
          </div>
        </aside>
      </div>

      {checkout && checkout.id && (
        <div className="card msg-ok" style={{ marginTop: 16 }}>
          <strong>Pesanan #{checkout.id.slice(-6).toUpperCase()} tersimpan.</strong>
          <div className="price">Total {fmt(checkout.total_cents)}</div>
          <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setCheckout(null)}>
            Tutup
          </button>
        </div>
      )}
    </main>
  );
}
