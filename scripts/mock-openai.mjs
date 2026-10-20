// Mock server OpenAI-compatible untuk verifikasi lokal (tanpa API key).
//   node scripts/mock-openai.mjs
// Env:
//   MOCK_PORT=8787        port
//   MOCK_MODE=ok|500|429|slow
// Endpoint:
//   POST /v1/responses  -> baleks bentuk respons OpenAI Responses API
//   GET  /v1/stats      -> jumlah panggilan yang diterima
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT || 8787);
const mode = process.env.MOCK_MODE || "ok";
let calls = 0;
const seen = [];

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v1/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ calls, mode, seen }));
    return;
  }

  if (req.method !== "POST" || !req.url.startsWith("/v1/responses")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    calls += 1;
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      body = {};
    }
    seen.push({ call: calls, model: body.model, max_output_tokens: body.max_output_tokens, input: String(body.input || "").slice(0, 160) });
    console.log("[mock] call #" + calls + " model=" + body.model + " input=" + String(body.input || "").slice(0, 80));

    if (mode === "slow") {
      await new Promise((r) => setTimeout(r, 15000));
    }
    if (mode === "500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "mock upstream failure" } }));
      return;
    }
    if (mode === "429") {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "1" });
      res.end(JSON.stringify({ error: { message: "mock rate limited" } }));
      return;
    }

    const text = "Saran mock: tawarkan minuman hangat untuk pesanan ini.";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "resp_mock_" + calls,
        object: "response",
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          {
            id: "msg_mock_" + calls,
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text, annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 180,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 24,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 204,
        },
      })
    );
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("[mock] OpenAI-compatible mock jalan di http://127.0.0.1:" + port + "/v1/responses (mode=" + mode + ")");
});