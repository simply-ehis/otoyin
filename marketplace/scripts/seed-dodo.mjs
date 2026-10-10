// Seed Dodo Payments catalog from Neon paid products.
// Run: DODO_API_KEY=<key> node scripts/seed-dodo.mjs [--live]
// Output: product_id map -> paste into MARKETPLACE_DODO_PRODUCT_MAP
//
// Creates all products with USD base price + localized prices for major currencies.
// Uses the Dodo REST API directly (no SDK dependency).

const API_BASE = process.argv.includes("--live")
  ? "https://live.dodopayments.com"
  : "https://test.dodopayments.com";

const API_KEY = process.env.DODO_API_KEY ?? "";
if (!API_KEY) {
  console.error("Set DODO_API_KEY environment variable");
  process.exit(1);
}

// product_id (Neon) -> price USD. Mirrors Neon products table 2026-09-24.
const CATALOG = [
  ["acestep-1-5-gguf", 43], ["bark-small", 5], ["fish-speech-s2-pro", 80],
  ["heartmula-3b", 37], ["llm-cloud-max", 50], ["llm-cloud-pro", 20],
  ["llm-cloud-starter", 10], ["neutts-2e-q4", 10], ["neutts-2e-q8", 15],
  ["neutts-air-q8", 10], ["openvoice-onnx-v2", 10], ["orpheus-q8-0", 80],
  ["parakeet-v3-f16", 12], ["parakeet-v3-q8", 12], ["parler-tts-mini-gguf", 18],
  ["planner-4b-v3", 20], ["planner-bonsai-2-27b", 80], ["planner-lfm2-8b-a1b", 40],
  ["planner-ling-tiny", 40], ["planner-spark-x2.5-4b", 20], ["pocket-tts", 8],
  ["pocket-tts-onnx", 8], ["qwen3-asr-0.6b-int4", 12], ["qwen3-asr-1.7b-int4", 34],
  ["qwen3-tts-1.7b", 40], ["rvc-onnx-an-v2", 14], ["rvc-onnx-coconut-v2", 14],
  ["rvc-onnx-default", 14], ["seed-vc", 20], ["stable-audio-3-small-sfx", 25],
  ["voxcpm2-q8", 40], ["whisper-large-v3", 30], ["whisper-large-v3-turbo", 20],
  ["whisper-medium-en", 12], ["whisper-small-en", 5], ["zonos-v0.1-gguf", 32],
];

// Approximate FX rates (USD -> local). Adjust as needed.
const LOCALIZED_PRICES = [
  { currency: "EUR", rate: 0.92 },
  { currency: "GBP", rate: 0.79 },
  { currency: "NGN", rate: 1550 },
  { currency: "INR", rate: 83 },
  { currency: "CAD", rate: 1.36 },
  { currency: "AUD", rate: 1.52 },
  { currency: "JPY", rate: 149 },
];

async function createProduct(name, priceUsd, productId) {
  const priceCents = Math.round(priceUsd * 100);
  const resp = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      price: {
        currency: "USD",
        price: priceCents,
        type: "one_time_price",
      },
      tax_category: "digital_products",
      description: `Otoyin model: ${name}`,
      metadata: { otoyin_product_id: productId, source: "otoyin-marketplace" },
      pricing_mode: "by_currency",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Create product ${name} failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data.product_id;
}

async function createLocalizedPrice(productId, currency, amountCents) {
  const resp = await fetch(`${API_BASE}/products/${productId}/localized-prices`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currency,
      amount: Math.round(amountCents),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Create localized price ${productId} ${currency} failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function main() {
  console.log(`Seeding Dodo catalog (${API_BASE})...\n`);
  const priceMap = {};

  for (const [pid, usd] of CATALOG) {
    try {
      const dodoProductId = await createProduct(pid, usd, pid);
      priceMap[pid] = dodoProductId;
      console.log(`${pid} -> ${dodoProductId}`);

      for (const { currency, rate } of LOCALIZED_PRICES) {
        const localCents = Math.round(usd * rate * 100);
        await createLocalizedPrice(dodoProductId, currency, localCents);
      }
      console.log(`  + ${LOCALIZED_PRICES.length} localized prices`);
    } catch (err) {
      console.error(`FAILED ${pid}: ${err.message}`);
    }
  }

  const outPath = "scripts/dodo-price-map.json";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outPath, JSON.stringify(priceMap, null, 2));
  console.log(`\nWrote ${outPath} — paste contents into MARKETPLACE_DODO_PRODUCT_MAP`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
