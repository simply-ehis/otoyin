# Prompt: Release Integrity — Code Signing & Notarization

## Context

Confirmed in the audit: `tauri/src-tauri/tauri.conf.json` has no
`signingIdentity`, `certificateThumbprint`, or notarization configuration
found. This matters for two concrete reasons, not just polish:

1. **Unsigned installers trigger scary OS warnings.** macOS Gatekeeper will
   block or heavily warn on an unsigned/un-notarized `.app`; Windows
   SmartScreen does the same for an unsigned `.exe`/`.msi`. For an app
   whose whole redesign goal is "looks and feels like real professional
   software," an OS-level "unknown developer, this might harm your
   computer" dialog undercuts that on first launch, before a user sees any
   of the actual UI.
2. **It weakens the updater's trust model (09).** The Tauri updater plugin
   verifies update *packages* against a public key, but if the base
   installer itself isn't signed/notarized, the chain of trust starts
   weaker — a user has less assurance the copy they installed was really
   the one you shipped.

## Scope

1. **macOS:** set up an Apple Developer ID signing certificate and
   notarization (Tauri has built-in support for this via
   `tauri.conf.json`'s `bundle.macOS` config + `notarize` step in CI). This
   requires an active Apple Developer Program membership — confirm you have
   one before starting the engineering work, this is an account/cost
   decision as much as a technical one.
2. **Windows:** set up code signing (Authenticode cert — can be a
   standard OV cert or, if reputation matters at launch, an EV cert which
   avoids the SmartScreen reputation-building period). Confirm cost/vendor
   before an agent starts, same reasoning as macOS.
3. **Wire signing into CI** (`.github/workflows/build.yml`) so every
   release build is signed automatically — not a manual step someone has
   to remember before publishing a release.
4. **Coordinate with 02 (rebrand) and 09 (updater).** If the bundle
   identifier or product name changes as part of the rebrand, the signing
   certificate's identity and the updater's manifest matching both need to
   agree with the new identity — sequence this after the rebrand's
   `tauri.conf.json` changes land, not before.

## Deliverable

Signed, notarized (macOS) and Authenticode-signed (Windows) release builds,
produced automatically by CI, with no OS-level "unknown publisher" warning
on a fresh install on either platform.
