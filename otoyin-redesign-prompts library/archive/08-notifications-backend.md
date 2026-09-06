# Prompt: Push Notification Backend

## Context

Confirmed in the audit: **there is currently no push notification
infrastructure in this repo at all** — no FCM, no APNs, no web push,
no service worker. (Grep for "push notification", "webpush", "fcm", "apns",
"service.worker" across `.py`/`.ts`/`.tsx` returns nothing.) This is a
build-from-scratch prompt, not an audit-and-extend one, unlike most of the
others in this pack.

Your goal: be able to push a message/notification to installed apps without
it being bundled into an app update or release build — a simple backend
service that the desktop app polls or subscribes to.

## Scope

1. **Pick the simplest thing that works for a Tauri desktop app.** True OS
   push notifications (APNs/FCM) are built for mobile and add real
   complexity (device tokens, platform-specific certs) for comparatively
   little benefit on desktop. Two lighter options, in order of recommended
   simplicity:
   - **Polling.** The app already has a server it talks to
     (`getDefaultServerUrl()` in `serverStore.ts`) — add a lightweight
     `/announcements` or `/notifications` endpoint (there's already
     `backend/services/announcements.py` — **check this first**, it may
     already be exactly this, just not wired to a remote source) that the
     app polls on an interval (e.g. every few hours, or on app launch).
     Simplest to build, simplest to reason about, no persistent connection
     needed.
   - **SSE, reusing the pattern already in the codebase.** You already have
     a working SSE pattern in `backend/routes/events.py` (with heartbeat
     pings for exactly the idle-proxy-timeout problem). A `/events/notices`
     stream following the same shape would let you push in near-real-time
     instead of polling, at the cost of a persistent connection.
2. **Where does this content live remotely?** It should be a small,
   independently-updatable data source — could live in the same
   `marketplace/marketplace_server` service (it's already the "remote,
   updatable without a rebuild" service in this architecture — see 07) as a
   simple notices table/endpoint, rather than standing up a fully separate
   service for this alone. Reuse infrastructure where it already exists.
3. **Content model:** message, severity (info/update-available/promo),
   optional link/deep-link into the app, target audience (all users /
   specific version range / specific platform), expiry. Keep it minimal —
   this doesn't need a CMS, just a table and a couple of admin routes.
4. **Client-side:** a small, unobtrusive notification surface — **not a
   floating toast that overlays content** (per the ground rules in
   00/04) — a dismissible entry in a real notification panel/inbox area
   instead, consistent with the design system from 04.
5. **Respect offline-first.** If the poll/stream fails (no internet), the
   app should degrade silently — no error state for a notification check
   failing, this is a "nice to have," not a "must have" data source.

## Deliverable

A minimal backend (reusing `announcements.py` and/or the marketplace service
if they already fit) + a small in-app notification inbox UI, both able to
ship and update independently of app releases.
