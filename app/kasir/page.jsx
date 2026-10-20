'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getSession, clearSession } from '../../lib/pin';

export default function KasirPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [ai, setAi] = useState(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/');
      return;
    }
    setTenant(s);
    (async () => {
      const { data, error } = await supabase()
        .from('products')
        .select('id, name, price_cents, is_active, variants(id, name, price_delta_cents)')
        .eq('tenant_id', s.id)
        .eq('is_active', true)
        .order('name');
      if (!error && data) setProducts(data);
      else if (error) console.error(error);
      setLoading(false);
    })();
  }, [router]);

  // Panggil AI tiap request. Debounce 1,2 detik supaya perubahan keranjang
  // yang beruntun tidak memicu banyak panggilan (hemat token + tagihan).
  useEffect(() => {
    if (!tenant) return undefined;
    const items = cart
      .map((x) => `${x.product_name}${x.variant_name ? ' ' + x.variant_name : ''} x${x.qty}`)
      .join(', ');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ intent: 'kasir', tenant: tenant.name || '', items });
        const res = await fetch('/api/ai?' + qs.toString(), { signal: controller.signal });
        if (!res.ok) return;
        setAi(await res.json());
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('AI gagal:', err);
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tenant, cart]);

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

  const pay = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    const { data: order, error } = await supabase()
      .from('orders')
      .insert({
        tenant_id: tenant.id,
        items: cart.map(({ key, ...item }) => item),
        total_cents: totalCents,
      })
      .select('id, paid_at, total_cents')
      .single();
    setSaving(false);
    if (error) {
      setCheckout({ error: 'Gagal menyimpan pesanan.' });
      console.error(error);
      return;
    }
    setCart([]);
    setCheckout(order);
  };

  const fmt = (c) => 'Rp' + (c / 100).toLocaleString('id-ID');

  // Ponytail: cloud QRIS render handled in admin; kasir shows static placeholder notice.
  if (!tenant) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Memeriksa sesi…</div>;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Kasir — {tenant.name}</h1>
          <p style={{ color: '#666', margin: '4px 0 0' }}>Klik produk untuk menambah ke keranjang.</p>
        </div>
        <button
          onClick={() => {
            clearSession();
            router.replace('/');
          }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
        >
          Keluar
        </button>
      </header>

      {ai && (
        <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#f9fafb', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ color: '#374151' }}>{aiLabel(ai)}</span>
            <span style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>
              {ai.source}
              {ai.costUsd ? ' - $' + ai.costUsd : ''}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <p>Memuat produk…</p>
      ) : products.length === 0 ? (
        <p style={{ marginTop: 16 }}>Belum ada produk aktif. Kelola produk di panel admin.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          {products.map((p) => (
            <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{p.name}</strong>
                  <div style={{ color: '#666', fontSize: 13 }}>{fmt(p.price_cents)}</div>
                </div>
                <button
                  onClick={() => addToCart(p, null)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#154c57', color: '#fff', cursor: 'pointer' }}
                >
                  + Tanpa Varian
                </button>
              </div>
              {p.variants?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {p.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => addToCart(p, v)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #154c57', background: '#fff', cursor: 'pointer' }}
                    >
                      {v.name} {v.price_delta_cents ? `(+${fmt(v.price_delta_cents)})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div style={{ marginTop: 32, border: '2px solid #154c57', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Keranjang</h2>
          {cart.map((x) => (
            <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                {x.product_name}
                {x.variant_name ? ` — ${x.variant_name}` : ''} × {fmt(x.unit_cents)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setQty(x.key, x.qty - 1)} style={{ width: 28, borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>−</button>
                <span style={{ minWidth: 20, textAlign: 'center' }}>{x.qty}</span>
                <button onClick={() => setQty(x.key, x.qty + 1)} style={{ width: 28, borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>+</button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #ddd' }}>
            <strong>Total: {fmt(totalCents)}</strong>
            <button
              onClick={pay}
              disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: saving ? '#888' : '#154c57', color: '#fff', cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? 'Menyimpan…' : 'Bayar'}
            </button>
          </div>
          {checkout?.error && <p style={{ color: '#b91c1c', marginBottom: 8 }}>{checkout.error}</p>}
        </div>
      )}

      {checkout && checkout.id && (
        <div style={{ marginTop: 24, border: '1px solid #ccc', borderRadius: 12, padding: 16, background: '#f4fafb' }}>
          <strong>Pesanan #{checkout.id.slice(-6).toUpperCase()} tersimpan.</strong>
          <div>Total {fmt(checkout.total_cents)}</div>
          <button onClick={() => setCheckout(null)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}

function vkey(pid, vid) {
  return pid + (vid ? '::' + vid : '');
}

function aiLabel(ai) {
  if (ai.tip) return 'Saran AI: ' + ai.tip;
  if (ai.reason === 'no-key') return 'AI belum aktif. Set OPENAI_API_KEY di .env.local.';
  if (ai.reason === 'budget') return 'Batas budget AI tercapai, panggilan dilewati.';
  return 'Panggilan AI gagal (' + (ai.reason || 'error') + '). Kasir tetap normal.';
}
