# Notifications / Announcements

PURPOSE: Push-style notices shipped to installed apps without an app release,
merged into the existing in-app announcement/bell surface.
OWNS: backend/services/announcements.py, marketplace/marketplace_server/routes/notices.py
READ-WHEN: You touch the announcement banner, notification bell, or want to send a message to users.
KEY-FILES: backend/routes/content.py, app/src/components/Banner/AnnouncementBanner.tsx, app/src/components/Notifications/NotificationBell.tsx
INVARIANTS: Offline-first — any fetch failure is silent; bundled content always works.
GOTCHAS: Remote items must match the frontend `Announcement` type shape (id, title, message, severity, cta, starts_at, ends_at).

## Agent Callable

| Action | Endpoint / Env | Key Files |
|--------|----------------|-----------|
| List in-app announcements (bundled + remote) | `GET /content/announcements` | `backend/routes/content.py`, `backend/services/announcements.py` |
| List remote notices (app polls on launch) | `GET /v1/notices` (marketplace service) | `marketplace/marketplace_server/routes/notices.py` |
| Create/update a notice (admin) | `POST /v1/notices/admin` — Bearer `MARKETPLACE_ADMIN_KEY` | `marketplace/marketplace_server/routes/notices.py` |
| Configure the remote source | env `OTOYIN_NOTICES_URL` (disabled when unset) | `backend/services/announcements.py` |
| Changelog | `GET /content/whats-new` | `backend/services/announcements.py` |
| Offers | `GET /content/offers` | `backend/services/announcements.py` |

## How it works

1. Bundled content (`backend/data/content.json`: `whats_new`, `announcements`,
   `offers`) is the offline floor — the app always has announcements.
2. At startup, a background task (`backend/app.py` `_bg_refresh_remote_notices`)
   fetches `OTOYIN_NOTICES_URL` (the marketplace service's `GET /v1/notices`),
   and `refresh_remote_announcements()` merges items by `id` (remote wins;
   remote-only ids append). Any failure keeps bundled content — invisible to
   the user, logged at debug.
3. The frontend consumes the merged list through the existing
   `useAnnouncements` hook → `AnnouncementBanner` (top-of-content banner) and
   `NotificationBell` (header bell: downloads, recommended models, offers,
   what's-new). No frontend change was needed for remote notices.

## Notice model (marketplace service)

`Notice` table: `id`, `title`, `message`, `severity` (info|success|warning|promo),
`cta_label`/`cta_to` (optional deep link), `scope` (global|update|promo),
`starts_at`/`ends_at` (visibility window), `active`.

- `GET /v1/notices` returns only active, in-window notices.
- `POST /v1/notices/admin` upserts by `id`; requires
  `Authorization: Bearer $MARKETPLACE_ADMIN_KEY`.

## Content model conventions

- Severity scale: `info` → `success` → `warning` → `promo` (matches the design
  system's status tokens; the banner maps them to colors).
- `cta.to` is a TanStack Router path (e.g. `/store`, `/settings`) — deep links
  into the app, not external URLs.
- Keep messages short; banners reserve ~30-40% width headroom for translation.
- Respect expiry (`ends_at`) for anything time-sensitive; never auto-dismiss a
  persistent condition (design: banners persist until resolved/dismissed).