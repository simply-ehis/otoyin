# Otoyin Marketplace Plan — Plugins, Models \& Trading Center

> PURPOSE: How Otoyin makes money. App free; revenue from model licenses,
> voice packs, plugins and a marketplace trading center. Pay-once-own-forever,
> fully offline after purchase. This plan gates all plugin-ecosystem and
> assistant-refactor work.
> OWNS: product owner. READ-WHEN: before building any marketplace code,
> before pricing decisions, before the plugin architecture slice.
> KEY-FILES: FEATURES.md, backend/routes/models/download.py (download pipeline),
> backend/services/plugins.py (plugin registry), backend/database/models.py
> (schema home for licenses), backend/mcp\\\\\\\_server (plugin execution seam),
> backend/services/telemetry.py (analytics seam).
> DECISIONS (locked with user 2026-08-16): app free + marketplace revenue ·
> open market (any manifest) · pay once own forever · offline forever ·
> payments via PayProGlobal (Nigeria-friendly MoR) · Kokoro engine + starter
> voices FREE, additional Kokoro voices are paid · per-model prices with
> discount packs, all prices -20% · marketplace is a TRADING CENTER (third
> parties sell, 80/20 split) · multilingual + int8 quantization features ·
> MONETIZATION RULE (locked 2026-08-16): ONLY MODELS ARE PAID — the app,
> instruments, and every procedural item (effects, presets, editing, tools)
> are free forever · spatial sound (Steam Audio engine) is model-based → paid.
> REVERIFY (2026-08-16, 2nd pass): LFM Open License = Apache-based, sellable
> under $10M revenue (user was right) · NeuTTS Open License = Apache-based,
> sellable under $5M · Stable Audio = sellable under $1M w/ registration ·
> Stripe NOT available in Nigeria (Paystack only, NGN payouts) · Spark-TTS
> weights flipped to CC-BY-NC-SA (ruled out) · new sellable additions:
> CosyVoice2/Fun-CosyVoice3, Dia2, IndexTTS2, YuE · Qwen3-4B replaces LFM.
> UPDATED: 2026-08-16

\---

## 0\. Executive summary

1. **Only models are paid.** The app, instruments, and every procedural item
(effects, presets, editing, tools) are free forever. The paid line is AI
models — and spatial sound counts: Steam Audio (binaural/convolution/
doppler, `routes/spatial.py` + `services/steam\\\\\\\_audio.py`) is SDK/model-
based, not procedural, so it is a paid product.
2. **Sell licenses, packs, voices and plugins — not the app.** App stays free
to maximize installs; the marketplace is the revenue seam.
3. **License gate first — now verified.** Every engine's license was checked
against its repo/model card on 2026-08-16 (§1.1). Two premium engines
(Zonos, Orpheus) that were believed non-commercial are actually sellable.
Non-commercial engines ship free, visibly flagged.
4. **Kokoro is the free anchor.** Engine + starter voices are free so the
first-run magic never hits a paywall. The paid layer is **additional Kokoro
voices** and other premium engines/voices.
5. **Pricing: per-model prices, then discount packs, all -20%** from the
original proposal (§5). Packs are bundles priced below the à la carte sum.
6. **The marketplace is a trading center**, not just a store: third-party
developers and creators list voices, model bundles, presets and plugins.
80/20 split; manual quarterly payouts in v1, automated split under research.
7. **Offline licensing is solved by signed entitlements.** A locally-verified
Ed25519-signed license file per product + device binding. Purchase once,
verify forever with zero phone-home.
8. **Plugins are MCP-server bundles.** The app already runs 111 MCP tools and
speaks MCP — a plugin is a signed bundle containing a manifest + an MCP
server. This makes the assistant's 128 tools automatically extendable
(closes issue I7).
9. **Phased:** P0 license audit (done in §1.1) + payment setup → P1 offline
licensing + model packs → P2 storefront → P3 trading center.

\---

## 1\. The license reality check

The actual risk is narrow and sharp: **several models in the app are
non-commercial and cannot be sold at all.** Selling them would be a license
violation, not a gray area. This matrix was verified against each project's
repo LICENSE and Hugging Face model card on 2026-08-16.

### 1.1 Verified license status of bundled engines (audit complete 2026-08-16)

**🟢 Sellable (permissive — commercial + redistribution allowed):**

|Engine|License|Notes|
|-|-|-|
|Kokoro 82M|Apache-2.0|Engine free; voice packs monetize it|
|Qwen3-TTS (0.6B/1.7B)|Apache-2.0|Multilingual|
|Qwen3-TTS CustomVoice|Apache-2.0|Cloning money-maker|
|**CosyVoice 2 0.5B / Fun-CosyVoice3**|Apache-2.0|NEW: 9 langs (zh/en/fr/es/ja/ko/it/ru/de), streaming 150ms, zero-shot cloning, 30–50% fewer pronunciation errors. Maintainer-confirmed commercial OK|
|**Dia2 (1B/2B)**|Apache-2.0|NEW: dialogue TTS with nonverbals (laughter/cough), realtime streaming, English, ≤2 min. Maintainer-confirmed commercial OK. NOTE: Nari Labs shut down — community-maintained|
|**IndexTTS2**|Apache-2.0|NEW: emotion + duration control, zero-shot cloning, multilingual (verify weights page in P0)|
|StyleTTS2|MIT||
|Parler-TTS Mini|Apache-2.0|Weights AND datasets permissive (explicit "fully open-source")|
|Whisper (STT)|MIT|tiny/base free; large-v3 gated|
|Moonshine **EN** (STT)|MIT|New addition; free fast STT. Non-EN models are threshold (below)|
|DeepFilterNet (denoise)|MIT|Free|
|LavaSR (enhance)|Apache-2.0|Free|
|Bark (non-verbals)|MIT||
|ACE-Step 1.5 (music)|MIT|Weights verified MIT (2B + 4B XL)|
|**YuE s1-7B + s2-1B (music)**|Apache-2.0|NEW: full-song generation, weights included; attribution "YuE by HKUST/M-A-P" requested|
|Zonos|Apache-2.0|✅ CORRECTION: was marked NC — premium expressive cloning, sellable|
|Orpheus 3B|Apache-2.0 code; **Llama license weights**|✅ CORRECTION: was marked NC — commercial OK under Llama terms|
|KittenTTS (nano 5MB / micro 40M / mini 80M)|Apache-2.0|Free-tier small engines exist|
|MOSS-TTS-Nano (\~100M)|Apache-2.0|Multilingual zh/en; official ONNX int8 CPU build|
|Step-Audio-EditX (3B)|Apache-2.0|Audio *editing* — Studio-pack candidate|
|**Qwen3-4B (LLM)**|Apache-2.0|NEW: replaces LFM2.5 as the assistant LLM (per user removal plan). Free download|
|RVC (conversion)|MIT framework|Packs need pack-owner voice-rights attestation|

**🟡 Threshold-licensed — SELLABLE while Otoyin revenue stays under the cap**
(reverify corrections — these are Apache-based "open" licenses, NOT hard NC):

|Engine|License|Cap|Notes|
|-|-|-|-|
|LFM2.5 (assistant LLM)|LFM Open License v1.0 (Apache-based)|**$10M** annual revenue|✅ CORRECTION: commercial use (incl. selling) IS allowed until Otoyin exceeds $10M; must include license + attribution. User plans REMOVAL → replaced by Qwen3-4B|
|NeuTTS-Nano / NeuTTS-2E|NeuTTS Open License v1.0 (Apache-based)|**$5M** annual revenue|✅ CORRECTION: sellable under $5M. User plans REMOVAL|
|NeuTTS-Air|Apache-2.0 card (Emilia provenance)|—|User plans REMOVAL|
|Stable Audio Open (SFX)|Stability AI Community License|**$1M**, must register + "Powered by Stability AI" attribution|Practical call: keep free — registration + attribution overhead not worth gating a low-value engine|
|Moonshine non-EN (STT)|Moonshine Community License (Apache-based)|**$1M**, register|Keep free; only EN Moonshine is plain MIT|

**🔴 NOT sellable (hard non-commercial — free forever in-app, visibly flagged):**

|Engine|Why|
|-|-|
|F5-TTS weights|CC-BY-NC-4.0 (Emilia training data) — verified on their SHARED.md; code is MIT|
|ChatTTS|Weights CC-BY-NC-4.0 AND code AGPLv3 — double no|
|Fish Speech S1-mini|CC-BY-NC-SA-4.0; commercial = separate paid license from Fish Audio|
|**Spark-TTS 0.5B**|NEW FIND: code Apache-2.0 but **weights flipped to CC-BY-NC-SA** — ruled out, don't add|
|Pocket-TTS|Code MIT, but bundled reference voices = Expresso/EARS CC-BY-NC — voices free-only; user-cloned voices fine|
|Aya Expanse (LLM)|CC-BY-NC-4.0 (verified) — ruled out as LFM replacement despite best-in-class multilingual|
|Celebrity reference voices|Publicity rights — never sell|

> \\\\\\\*\\\\\\\*Rule:\\\\\\\*\\\\\\\* a model is sellable only if its license explicitly permits
> commercial use AND redistribution. Everything else ships free in the app,
> visibly flagged "non-commercial — can't be resold" so nobody tries.

### 1.2 Other legal gates

* **Reference voice library (Twenty One Pilots etc.) — never sell.** Publicity
rights. Free feature only. Locked with user.
* **Marketplace plugin names/logos:** disallow trademarked names in plugin
manifests; keep a blocklist.
* **RVC packs / cloned voices:** sellers must attest they own the voice rights
(checkbox in the publish flow — same as ElevenLabs policy).
* **Paid voice-pack supply:** paid packs cannot use celebrity references. Sources:
curated CC0/CC-BY voice sets (e.g. kyutai CC0 voices), user-submitted packs
via the trading center (with attestation), commissioned original voices.

\---

## 2\. Product definition

### 2.1 Model licenses + voice packs (Phase 1 — highest value, lowest risk)

Pricing model (locked): **per-model price first, discount packs second, all
prices -20%** from the original proposal. Kokoro engine + starter voices are
**free**; what's paid is **additional Kokoro voices** and the premium engines.
**Rule: only models are paid — the app, instruments, and everything procedural
(effects, presets, editing, tools) stays free forever. Spatial sound is the
one non-engine paid item (Steam Audio is SDK/model-based).**

|Product|Price|Contents|
|-|-|-|
|**Starter Voice** (free)|$0|Kokoro engine + starter voices, KittenTTS nano/micro, MOSS-TTS-Nano, Parler-TTS Mini, Pocket-TTS, Whisper tiny/base, Moonshine EN, DeepFilterNet, LavaSR, assistant + Qwen3-4B, Bark, + all NC engines (F5, ChatTTS, Fish, Stable Audio, Spark-TTS)|
|**Kokoro Voice Pack**|**$15**|Additional Kokoro voices + emotion presets (the headline paid product)|
|StyleTTS2|**$7**||
|Qwen3-TTS 0.6B|**$12**|Multilingual|
|Qwen3-TTS 1.7B|**$20**||
|Qwen CustomVoice|**$23**|Voice cloning|
|**CosyVoice 2 / Fun-CosyVoice3**|**$15**|NEW: streaming 9-language cloning|
|**Dia2** (Dialogue Pack)|**$19**|NEW: dialogue + nonverbals for Stories/podcasts|
|**IndexTTS2**|**$15**|NEW: emotion + duration control|
|Zonos|**$15**|Premium expressive + cloning|
|Orpheus 3B|**$15**||
|Step-Audio-EditX|**$20**|Audio editing|
|ACE-Step|**$23**|Music generation|
|**YuE** (music, full-song)|**$23**|NEW: Apache-2.0, weight-inclusive; in Music Pack|
|Whisper large-v3|**$7**|Premium transcription (multilingual 99 langs); tiny/base stay free|
|**Spatial Sound Engine** (Steam Audio)|**$9**|3D Spatializer: binaural + convolution + doppler + soundstage presets — model-based, so paid|

**Discount packs** (each priced below the à la carte sum of its parts):

|Pack|Contents|À la carte|Pack price|
|-|-|-|-|
|**Pro Voice Pack**|Kokoro Voice Pack + StyleTTS2 + Qwen3-TTS 0.6B + 20 presets|$34|**$31**|
|**Studio Pack**|Pro Voice Pack + Qwen3-TTS 1.7B + CustomVoice + CosyVoice2 + IndexTTS2 + Dia2 + Zonos + Orpheus + Step-Audio-EditX + ACE-Step + **Spatial Sound Engine** + all presets|\~$218|**$71**|
|**Music Pack**|ACE-Step + **YuE** + drum kits + SFX + loop presets|$46+|**$31**|
|**Creator Bundle**|Everything sellable in one|\~$223|**$103**|

Supporting policies: **30% student/indie discount** (costs nothing, buys
goodwill where word-of-mouth lives). "Own forever · no subscription · works
offline" is the headline on every listing.

Each paid product ships: models (from marketplace CDN or gated HF repo),
verified checksums, **license documentation (the actual license text — this is
what makes selling legal)**, tuned engine defaults, preset voices/effects, and
a signed entitlement.

### 2.2 Plugins (Phase 2–3)

**Plugin = a signed bundle (.Otoyin file) containing:**

```
my-plugin.Otoyin/
├── manifest.json        # schema v1 (below)
├── server/              # optional MCP server (any language, started as subprocess)
│   └── ...              #   — the app already speaks MCP, this is the execution seam
├── ui/                  # optional webview panel (React component bundle)
├── models/              # optional bundled model files (or model-pack reference)
├── presets/             # optional effect presets / voices
└── LICENSE.md           # seller's license text for THEIR plugin code
```

**manifest.json (schema v1, draft):**

```json
{
  "id": "devhandle.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "kind": "mcp-server | model-pack | voice-pack | effects | instruments | ui-panel",
  "developer": { "name": "...", "pubkey": "ed25519:..." },
  "entry": { "type": "mcp", "command": "python", "args": \\\\\\\["server/main.py"], "transport": "stdio" },
  "tools": \\\\\\\["Otoyin.myplugin.\\\\\\\*"],           // assistant tools auto-registered
  "models": \\\\\\\["qwen3-tts-1.7b"],             // references catalog IDs
  "permissions": \\\\\\\["read\\\\\\\_captures", "write\\\\\\\_generations"],  // declared, shown at install
  "min\\\\\\\_version": "0.1.0",
  "checksums": { "server/main.py": "sha256:..." }
}
```

**Why MCP as the plugin unit:** the app already runs an MCP server, has client
bindings (`mcp\\\\\\\_bindings`), 111 registered tools, and the assistant tool
machinery. A plugin that is an MCP server gets: tool discovery, voice bindings,
capture access, and assistant integration **for free**. No new plugin runtime
in v1 — same trust model as connecting any MCP server today, with a permission
declaration screen at install.

### 2.3 The trading center (Phase 3 — locked direction)

The marketplace is a **venue, not just a store**. Third-party developers and
creators list and sell:

* **Voice packs** (RVC voice packs with rights attestation, curated CC0/CC-BY
voice sets, original commissioned voices)
* **Model bundles** (permissive-licensed engines and fine-tunes)
* **Presets \& instruments** (effects chains, drum kits, UI packs)
* **Plugins** (MCP-server bundles, §2.2)

**Terms:** 80/20 developer/marketplace split (industry standard; the 20% covers
hosting, payments, trust infrastructure). **Payouts: manual quarterly in v1**
(you hold the PayProGlobal account and pay out); automated split-payouts are a
P0 research item (§7). **License gate in the publish flow:** the pipeline
refuses manifests that reference non-commercial catalog IDs — no NC laundering.

### 2.4 Trust model for the open market

|Threat|Mitigation (v1)|
|-|-|
|Malicious plugin code|Plugins are MCP subprocesses — same trust as any MCP server. Install screen shows declared permissions + dev identity. No sandbox in v1 (documented), OS-level sandboxing later|
|Tampered bundles|Ed25519 developer signature over the whole bundle; app verifies against published dev pubkey before install|
|Bad developer|Reputation: install counts, ratings, "flag" flow; marketplace revokes dev pubkeys in catalog updates|
|Pay-once piracy|Device-bound licenses (see §3). Accept residual piracy — every desktop app does. No DRM theater|
|License laundering (selling NC models)|Publishing pipeline refuses manifests that reference non-commercial catalog IDs|
|Celebrity voice packs|Attestation checkbox + blocklist; reference voices stay free-only|

\---

## 3\. Offline licensing (the heart of "pay once, own forever, offline forever")

**Design: locally-verified signed entitlements.**

1. User buys a product on the storefront (Phase 1: payment link + license file
download; Phase 2: in-app purchase → license issued automatically).
2. Marketplace's license server signs a license with its Ed25519 private key:

```json
   {
     "product": "studio-pack",
     "device\\\\\\\_id": "sha256(machine-id)",     // bound to this machine
     "purchaser": "order\\\\\\\_abc123",
     "entitlements": \\\\\\\["models:qwen3-tts-1.7b", "voices:kokoro-premium", "plugins:\\\\\\\*"],
     "issued\\\\\\\_at": "...", "expires\\\\\\\_at": null,   // null = forever
     "sig": "ed25519:<signature>"
   }
   ```

3. App stores the license locally; on model/voice load it verifies the signature
against the embedded marketplace public key — **no network required**.
4. Offline verification works because the public key ships inside the app.
Verification is pure local crypto (Ed25519, \~50 lines, no dependencies).
5. Refunds/chargebacks → marketplace adds the device\_id to a revocation list
that ships inside signed catalog updates (the only online moment, and it's
optional — users can decline updates and keep their purchase).
6. New device → license re-issued from the storefront order page ("you have
this on your other machine? re-download"). No DRM hostility.

**Entitlement enforcement points (backend):**

* `routes/models/download.py` — model download allowed if model is free OR
license grants it (extend the existing download pipeline with a license check).
* Plugin install — manifest's `models`/`permissions` checked against licenses.
* `services/plugins.py` registry — extended with an entitlement flag.
* New DB tables: `licenses`, `entitlements`, `installed\\\\\\\_plugins`,
`marketplace\\\\\\\_meta` (schema additions in `database/models.py`).

\---

## 4\. Marketplace infrastructure

### Phase 1 (minimal, \~1 sprint of work, no server)

* **Catalog:** a signed `catalog.json` bundled with the app (product list,
prices, model manifests, checksums, dev pubkeys). Updates ship with app
updates. Zero hosting cost, zero ops.
* **Payments: PayProGlobal** (Merchant of Record — they handle global tax/VAT;
Nigeria-friendly, fast approval for Nigerian founders, local bank payouts).
Fallback if PayProGlobal stalls: **Paddle** (explicitly lists Nigeria, better
brand, heavier KYC). **Stripe: NOT available to Nigerian merchants** (verified
2026. — Nigeria is "extended network" via Paystack only, which is a separate
platform with its own dashboard and **NGN-only payouts**; no Stripe payouts to
Nigerian banks. Lemon Squeezy likewise Stripe-gated post-acquisition. Stripe
Atlas (US LLC) is the only Stripe route and brings ongoing US tax obligations.
**Paystack** (NGN checkout for African users) arrives in Phase 3.
* **License issuance:** a single tiny endpoint or manual issue from the payment
dashboard (PayProGlobal webhooks → sign + email license file).
* **In-app surface:** Models tab gets a "Marketplace" section listing products;
"Install" = download + checksum verify + entitlement verify + load.

### Phase 2 (public catalog)

* `marketplace.Otoyin.app` storefront (landing page becomes the storefront).
* Catalog API + license server (sign/issue/revoke).
* In-app Marketplace tab; plugin install from URL or file.

### Phase 3 (trading center + dev program)

* Developer dashboard: upload plugin/voice-pack → manifest validation (schema,
license gate, checksums) → dev signature → listing.
* **Payouts to third-party sellers:** manual quarterly in v1; automated
split-payout research in P0 (see §7).
* Ratings/reviews, install telemetry (extend `services/telemetry.py`).
* **Paystack integration** for Naira checkout (local rails, NGN pricing) —
significant for the African creator audience.
* Revenue split: **80/20 developer/marketplace** for third-party listings;
100% to you for first-party packs (you're the pack curator).

\---

## 5\. Pricing principles (pay-once market) — locked 2026-08-16

* **Only models are paid.** The app, instruments, and every procedural item
(effects, presets, editing, tools) are free forever. The paid line is AI
models + spatial sound (Steam Audio is model-based, not procedural). This
rule is the whole pitch: "the studio is free, the brains cost money."
* **Per-model price first, discount packs second.** Singles: $7–$23 (all -20%
from the original proposal). Packs are bundles priced below the à la carte
sum and always look like a deal.
* **Kokoro engine + starter voices are free** — it is the funnel. The paid
layer is additional Kokoro voices and premium engines.
* Free tier must be genuinely useful: Kokoro starter voices + KittenTTS
nano/micro + MOSS-TTS-Nano + Parler Mini + Whisper tiny/base + Moonshine EN +
DeepFilterNet + LavaSR + assistant (LFM2.5) + all NC engines, flagged.
* "Own forever" is the headline; "no subscription" is the second line;
"works offline" is the third. All three on every listing.
* Student/indie discount (30%) — costs nothing, buys goodwill in the
creator community where word-of-mouth lives.
* Trading center: sellers price their own listings; marketplace takes 20%.

\---

## 6\. Multilingual + quantization features (locked additions)

The STT stack gains light, multilingual, quantizable models so language
coverage matches the TTS engines (Qwen3-TTS multilingual, MOSS-TTS-Nano
zh/en + broad multilingual, Whisper 99 languages):

* **Add Moonshine (EN)** as the free fast STT — MIT, \~1MB-class, runs on weak
hardware. Non-EN Moonshine models stay free too (Community license, can't sell).
* **Gate Whisper large-v3** as premium transcription ($7) — MIT, 99 languages,
the multilingual anchor. Whisper tiny/base stay free.
* **int8 quantization for TTS and other models** on low-end hardware:

  * MOSS-TTS-Nano ships an official **ONNX int8 CPU build** (2x faster than
PyTorch, single-core runnable) — bundle the int8 variant.
  * whisper.cpp **int8 GGUF** variants for the big Whisper models.
  * KittenTTS nano has an int8 variant (5MB-class) — bundle it.
  * Future: quantized variants selectable per model in the download pipeline
(progress, retry, cancel — reuse the existing download UX).
* STT language parity rule: any language a TTS engine speaks must be
transcribable by at least one bundled STT engine (free tier: Moonshine EN +
Whisper tiny/base; paid: Whisper large-v3).

\---

## 7\. What the plan unlocks (synergy)

* **Assistant refactor (I7):** the assistant's 128 tools become *generated*
from the plugin registry — built-in tools + installed plugin tools, one
registry. Plugins automatically extend the assistant and the MCP surface.
* **UX hardening:** marketplace install flow reuses the model-download
pipeline (progress, retry, cancel) — the UX work lands on the marketplace
screens first (that's where money is made).
* **Landing page:** becomes the storefront; the current static feature grid
gets a "pricing" section.
* **Multilingual positioning:** "speaks your language" becomes a headline
feature — TTS and STT language coverage is a selling point, not a detail.

\---

## 8\. Phased execution plan

|Phase|Scope|Exit criteria|
|-|-|-|
|**P0 — Foundations** (1–2 days)|License audit (DONE — §1.1 verified, 2 passes); PayProGlobal account setup; RESEARCH: (a) PayProGlobal split-payouts to third-party sellers (fallback: manual quarterly), (b) paid voice-pack supply (CC0/CC-BY curation + commissioning + trading-center submissions); draft manifest schema v1; **REMOVE LFM2.5 + NeuTTS-Air + NeuTTS-2E from app** (configs, routes, frontend lists, docs); **swap assistant LLM to Qwen3-4B** (Apache-2.0)|PayProGlobal account live; schema doc; supply plan; removals done + Qwen3 in|
|**P1 — Offline licensing + model packs** (1–2 sprints)|Ed25519 license module + tests; license check in model download; catalog.json v1; Kokoro Voice Pack + Pro Voice + Studio + Music listed; in-app Marketplace section; Moonshine + Whisper large + MOSS int8 added to stack; **integrate new engines: CosyVoice2/Fun-CosyVoice3, Dia2, IndexTTS2, YuE**|Buy a pack on a fresh machine → install → generate → export with airplane mode on|
|**P2 — Storefront + public catalog** (1 sprint)|marketplace.Otoyin.app; catalog API; license server; in-app Marketplace tab; plugin install from file/URL|Third party installs a .Otoyin bundle; assistant sees its tools|
|**P3 — Trading center** (1–2 sprints)|Dev dashboard; publish flow with license gate; ratings; 80/20 payouts (manual quarterly v1, auto-split if P0 research clears); revocation list; Paystack NGN checkout|An external dev publishes a plugin/voice pack; users buy and rate it; seller gets paid|

## 9\. Resolved decisions (locked 2026-08-16) + remaining research

**Locked with user:**
0. **Monetization rule: ONLY models are paid.** App, instruments, and all
procedural items are free forever. Spatial sound (Steam Audio engine) is
model-based → paid ($9, in Studio Pack).

1. Payments: **PayProGlobal primary**; Paddle fallback; Paystack (NGN) in P3.
**Stripe confirmed NOT available to Nigerian merchants** (Paystack-only,
NGN payouts); Lemon Squeezy dropped (Stripe-gated payouts).
2. Kokoro: engine + starter voices **free**; **additional Kokoro voices are
the paid product** (Kokoro Voice Pack $15).
3. Pricing: per-model first, discount packs second; **all prices -20%**;
30% student/indie discount.
4. Marketplace = **trading center** (third-party sellers, 80/20, payouts).
5. Distribution: gated HF repos + other sources (CDN later).
6. Sandboxing: v1 trusts MCP-subprocess plugins with declared permissions;
OS-level sandboxing in v2.
7. Repo stays open-source; marketplace is the closed commercial layer.
8. Celebrity reference voices stay free-only (publicity rights).
9. Multilingual STT parity + int8 quantization of TTS/STT models (new features).
10. **REMOVE LFM2.5 + NeuTTS-Air + NeuTTS-2E** from the app; assistant LLM
becomes Qwen3-4B (Apache-2.0, verified). LFM/NeuTTS were found
sellable-under-threshold ($10M/$5M) but removal was already planned.

**Reverify corrections (2nd pass, 2026-08-16):**

* LFM Open License (Apache-based): commercial use INCLUDING sales is licensed
until Otoyin exceeds $10M annual revenue — my earlier "free distribution
only" claim was wrong.
* NeuTTS Open License (Apache-based): same structure at $5M — sellable.
* Stability AI Community License: commercial free under $1M + registration.
* Moonshine Community License: same $1M structure for non-EN models.
* Hard-NC list shrunk to: F5 weights, ChatTTS, Fish S1-mini, Spark-TTS
weights, Pocket-TTS voices, Aya Expanse, celebrity voices.

**Remaining research (P0):**

* PayProGlobal automated split-payouts to third-party sellers (fallback:
manual quarterly payouts).
* Paid voice-pack supply chain: CC0/CC-BY voice curation, commissioned voices,
trading-center submissions with rights attestation.
* IndexTTS2 weights-page license confirmation (site claims Apache-2.0).

