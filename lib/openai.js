// Gateway OpenAI untuk server (Node runtime).
// Hanya boleh diimpor dari server (route handler / server action).
//
// Filosofi: "panggil OpenAI tiap request" tanpa bikin tagihan meledak.
// Setiap request lewat sini, tapi panggilan ke OpenAI hanya terjadi kalau:
//   1. belum ada di cache (input identik -> 0 rupiah),
//   2. belum kena batas budget (per jam / total spend),
//   3. request-nya memang beda (dedupe in-flight).
// Kalau OpenAI error / timeout / key kosong, request tetap dilayani (degraded).
//
// API: Responses API (https://api.openai.com/v1/responses)
// Sumber harga: https://platform.openai.com/docs/pricing (diakses 2026-10-20)

import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5-nano";

// Harga per 1M token, context pendek (<=272K). Long context punya tarif berbeda,
// tapi request kita jauh di bawah batas itu.
const PRICES = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

const cache = new Map(); // cacheKey -> { text, ts, usage, model, costUsd }
const inflight = new Map(); // cacheKey -> Promise (dedupe request paralel)

const counters = {
  requests: 0,
  upstreamCalls: 0,
  cacheHits: 0,
  deduped: 0,
  skipped: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  spendUsd: 0,
  hourCalls: 0,
  hourResetAt: Date.now() + 3600_000,
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function aiConfig() {
  return {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    baseUrl: (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    timeoutMs: num(process.env.OPENAI_TIMEOUT_MS, 8000),
    maxRetries: num(process.env.OPENAI_MAX_RETRIES, 2),
    cacheTtlMs: num(process.env.OPENAI_CACHE_TTL_MS, 600_000),
    maxCacheEntries: num(process.env.OPENAI_MAX_CACHE_ENTRIES, 200),
    maxCallsPerHour: num(process.env.OPENAI_MAX_CALLS_PER_HOUR, 60),
    maxSpendUsd: num(process.env.OPENAI_MAX_SPEND_USD, 1),
    maxOutputTokens: num(process.env.OPENAI_MAX_OUTPUT_TOKENS, 300),
    hasKey: Boolean(process.env.OPENAI_API_KEY),
  };
}

function hashKey(parts) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function estimateCost(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return { usd: null, known: false };
  const usd =
    (Number(usage.input_tokens || 0) * price.input +
      Number(usage.output_tokens || 0) * price.output) /
    1e6;
  return { usd: Number(usd.toFixed(8)), known: true };
}

// Teks output tidak selalu di output[0].content[0].text, jadi kumpulkan semua output_text.
function extractText(data) {
  const parts = [];
  for (const item of data?.output || []) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const chunk of item.content) {
      if (chunk && chunk.type === "output_text" && typeof chunk.text === "string") {
        parts.push(chunk.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function cacheSet(key, value, maxEntries) {
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function budgetState(config) {
  if (Date.now() > counters.hourResetAt) {
    counters.hourCalls = 0;
    counters.hourResetAt = Date.now() + 3600_000;
  }
  return {
    hourCalls: counters.hourCalls,
    maxCallsPerHour: config.maxCallsPerHour,
    spendUsd: Number(counters.spendUsd.toFixed(6)),
    maxSpendUsd: config.maxSpendUsd,
  };
}

function budgetOk(config) {
  const state = budgetState(config);
  if (state.hourCalls >= state.maxCallsPerHour) return false;
  if (state.maxSpendUsd > 0 && state.spendUsd >= state.maxSpendUsd) return false;
  return true;
}

function log(record) {
  console.log("[ai] " + JSON.stringify(record));
}

function skipped(reason, config, extra = {}) {
  counters.skipped += 1;
  const record = { purpose: extra.purpose, source: "skipped", reason, model: config.model };
  log(record);
  return {
    ok: false,
    text: "",
    source: "skipped",
    reason,
    model: config.model,
    usage: null,
    costUsd: 0,
    costKnown: true,
    ms: 0,
    ...extra,
  };
}

async function callOpenAI({ config, instructions, input, maxOutputTokens, purpose }) {
  const started = Date.now();
  const body = {
    model: config.model,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    store: false, // jangan disimpan di server OpenAI (stateless)
  };
  const effort = process.env.OPENAI_REASONING_EFFORT;
  if (effort) body.reasoning = { effort };

  let lastError = "unknown";
  let lastStatus = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(config.baseUrl + "/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 429 || res.status >= 500) {
        lastStatus = res.status;
        lastError = res.status === 429 ? "rate-limited" : "upstream-" + res.status;
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5000)
          : Math.min(300 * 2 ** attempt, 4000);
        await res.text().catch(() => "");
        if (attempt < config.maxRetries) {
          log({ purpose, source: "retry", status: res.status, attempt: attempt + 1, waitMs });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        lastStatus = res.status;
        lastError = res.status === 401 || res.status === 403 ? "invalid-api-key" : "upstream-" + res.status;
        log({ purpose, source: "error", status: res.status, body: raw.slice(0, 200) });
        return {
          ok: false,
          text: "",
          source: "error",
          reason: lastError,
          model: config.model,
          usage: null,
          costUsd: 0,
          costKnown: true,
          ms: Date.now() - started,
        };
      }

      const data = await res.json();
      const usage = data?.usage || null;
      const cost = estimateCost(config.model, usage);
      counters.upstreamCalls += 1;
      counters.hourCalls += 1;
      if (usage) {
        counters.inputTokens += Number(usage.input_tokens || 0);
        counters.outputTokens += Number(usage.output_tokens || 0);
      }
      if (cost.known && cost.usd != null) counters.spendUsd += cost.usd;

      let text = extractText(data);
      if (data?.status === "incomplete" && !text) {
        lastError = "incomplete:" + (data?.incomplete_details?.reason || "unknown");
        log({ purpose, source: "error", reason: lastError, usage });
        return {
          ok: false,
          text: "",
          source: "error",
          reason: lastError,
          model: config.model,
          usage,
          costUsd: cost.usd ?? 0,
          costKnown: cost.known,
          ms: Date.now() - started,
        };
      }

      log({
        purpose,
        source: "openai",
        model: config.model,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        costUsd: cost.usd,
        costKnown: cost.known,
        ms: Date.now() - started,
      });

      return {
        ok: true,
        text,
        source: "openai",
        reason: null,
        model: config.model,
        usage,
        costUsd: cost.usd ?? 0,
        costKnown: cost.known,
        partial: data?.status === "incomplete",
        ms: Date.now() - started,
      };
    } catch (err) {
      const aborted = err?.name === "AbortError";
      lastError = aborted ? "timeout" : "network-error";
      lastStatus = 0;
      if (attempt < config.maxRetries) {
        log({ purpose, source: "retry", reason: lastError, attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** attempt, 4000)));
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  counters.errors += 1;
  log({ purpose, source: "error", reason: lastError, status: lastStatus, ms: Date.now() - started });
  return {
    ok: false,
    text: "",
    source: "error",
    reason: lastError,
    model: config.model,
    usage: null,
    costUsd: 0,
    costKnown: true,
    ms: Date.now() - started,
  };
}

// Entry point: dipanggil setiap kali butuh teks dari model.
export async function aiText({
  instructions,
  input,
  purpose = "umum",
  maxOutputTokens,
}) {
  const config = aiConfig();
  counters.requests += 1;

  if (!config.hasKey) {
    return skipped("no-key", config, { purpose });
  }

  const key = hashKey([config.model, instructions, input, String(maxOutputTokens || config.maxOutputTokens)]);
  const hit = cacheGet(key, config.cacheTtlMs);
  if (hit) {
    counters.cacheHits += 1;
    log({ purpose, source: "cache", model: config.model, ageMs: Date.now() - hit.ts });
    return {
      ok: true,
      text: hit.text,
      source: "cache",
      reason: null,
      model: hit.model,
      usage: hit.usage,
      costUsd: 0,
      costKnown: true,
      ms: 0,
    };
  }

  if (!budgetOk(config)) {
    const state = budgetState(config);
    return skipped("budget", config, { purpose, budget: state });
  }

  if (inflight.has(key)) {
    counters.deduped += 1;
    const shared = await inflight.get(key);
    log({ purpose, source: shared.source, deduped: true });
    return { ...shared, deduped: true };
  }

  const promise = callOpenAI({
    config,
    instructions,
    input,
    maxOutputTokens: maxOutputTokens || config.maxOutputTokens,
    purpose,
  })
    .then((result) => {
      if (result.ok && result.text) {
        cacheSet(key, { text: result.text, ts: Date.now(), usage: result.usage, model: result.model }, config.maxCacheEntries);
      }
      return result;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function aiStats() {
  const config = aiConfig();
  return {
    counters: { ...counters },
    cache: { entries: cache.size, ttlMs: config.cacheTtlMs, maxEntries: config.maxCacheEntries },
    budget: budgetState(config),
    config: {
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      maxCallsPerHour: config.maxCallsPerHour,
      maxSpendUsd: config.maxSpendUsd,
      maxOutputTokens: config.maxOutputTokens,
      hasKey: config.hasKey,
    },
    pricesPerMTok: PRICES[config.model] || null,
  };
}
