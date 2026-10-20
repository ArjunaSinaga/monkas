// Endpoint AI untuk app kasir.
// Setiap request ke endpoint ini = 1 percobaan panggilan OpenAI
// (dijaga cache + budget di lib/openai.js, jadi request berulang tidak
// menambah tagihan).
//
// GET /api/ai?intent=kasir&tenant=Nama&items=Kopi x2,Susu
// GET /api/ai?stats=1            -> ringkasan pemakaian + biaya

import { aiText, aiStats } from "../../../lib/openai";

export const dynamic = "force-dynamic";

const MAX_INPUT = 600;

const INTENTS = {
  kasir: {
    purpose: "kasir",
    instructions:
      "Kamu asisten kasir untuk aplikasi kasir Indonesia. Balas 1 kalimat singkat (maks 20 kata) berisi saran upsell atau layanan berdasarkan isi keranjang. Jangan mengarang harga dan jangan menyebut produk yang tidak ada di daftar. Balas Bahasa Indonesia.",
  },
  admin: {
    purpose: "admin",
    instructions:
      "Kamu asisten operasional untuk aplikasi kasir Indonesia. Balas 1 kalimat singkat (maks 20 kata) yang membantu admin mengelola produk dan transaksi. Balas Bahasa Indonesia.",
  },
};

function clean(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function buildInput(tenant, items) {
  const lines = [];
  if (tenant) lines.push("Toko: " + tenant);
  if (items) lines.push("Keranjang: " + items);
  if (lines.length === 0) lines.push("Keranjang masih kosong.");
  return lines.join("\n");
}

export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (params.get("stats") === "1") {
    return Response.json({ ok: true, stats: aiStats() });
  }

  const intentKey = params.get("intent") === "admin" ? "admin" : "kasir";
  const intent = INTENTS[intentKey];
  const tenant = clean(params.get("tenant"), 80);
  const items = clean(params.get("items"), MAX_INPUT);
  const input = buildInput(tenant, items);

  const result = await aiText({
    instructions: intent.instructions,
    input,
    purpose: intent.purpose,
  });

  return Response.json({
    ok: result.ok,
    tip: result.text,
    source: result.source, // openai | cache | skipped | error
    reason: result.reason,
    model: result.model,
    costUsd: result.costUsd,
    costKnown: result.costKnown,
    usage: result.usage,
    ms: result.ms,
    deduped: result.deduped || false,
    partial: result.partial || false,
  });
}