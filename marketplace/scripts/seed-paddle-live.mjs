// Seed LIVE Paddle catalog from Neon paid products.
// Run: PADDLE_API_KEY=<live_key> node scripts/seed-paddle-live.mjs
// Requires: npm i -g @paddle/paddle-node-sdk  OR  npm i @paddle/paddle-node-sdk
// Output: product_id/price_id map -> paste into Vercel MARKETPLACE_PADDLE_PRICE_MAP
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { writeFileSync } from "node:fs";

// product_id (Neon) -> price USD. Mirrors Neon products table 2026-09-24.
const CATALOG = [
  ["acestep-1-5-gguf", 43], ["bark-small", 5], ["fish-speech-s2-pro", 80],
  ["heartmula-3b", 37], ["llm-cloud-max", 50], ["llm-cloud-pro", 20],
  ["llm-cloud-starter", 10], ["neutts-2e-q4", 10], ["neutts-2e-q8", 15],
  ["neutts-air-q8", 10], ["openvoice-onnx-v2", 10], ["orpheus-q8-0", 80],
  ["parakeet-v3-f16", 12], ["parakeet-v3-q8", 12], ["parler-tts-mini-gguf", 18],
  ["planner-4b-v3", 20], ["planner-bonsai-2-27b", 80], ["planner-lfm2-8b-a1b", 40],
  ["planner-ling-tiny", 40], ["planner-spark-x-2.5-4b", 20], ["pocket-tts", 8],
  ["pocket-tts-onnx", 8], ["qwen3-asr-0.6b-int4", 12], ["qwen3-asr-1.7b-int4", 34],
  ["qwen3-tts-1.7b", 40], ["rvc-onnx-an-v2", 14], ["rvc-onnx-coconut-v2", 14],
  ["rvc-onnx-default", 14], ["seed-vc", 20], ["stable-audio-3-small-sfx", 25],
  ["voxcpm2-q8", 40], ["whisper-large-v3", 30], ["whisper-large-v3-turbo", 20],
  ["whisper-medium-en", 12], ["whisper-small-en", 5], ["zonos-v0.1-gguf", 32],
];

const paddle = new Paddle(process.env.PADDLE_API_KEY ?? "", {
  environment: Environment.production, // LIVE — never sandbox here
});

const priceMap = {};
for (const [pid, usd] of CATALOG) {
  const product = await paddle.products.create({
    name: pid,
    taxCategory: "saas",
    description: `Otoyin model: ${pid}`,
    customData: { otoyin_product_id: pid, source: "otoyin-marketplace" },
  });
  const price = await paddle.prices.create({
    productId: product.id,
    description: `${pid} USD ${usd}`,
    unitPrice: { amount: String(Math.round(usd * 100)), currencyCode: "USD" },
  });
  priceMap[pid] = price.id;
  console.log(`${pid} -> ${product.id} / ${price.id}`);
}

writeFileSync("scripts/paddle-live-price-map.json", JSON.stringify(priceMap, null, 2));
console.log("\nWrote scripts/paddle-live-price-map.json — paste contents into Vercel MARKETPLACE_PADDLE_PRICE_MAP");
