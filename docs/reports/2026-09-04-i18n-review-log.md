# i18n human-review log

**Date:** 2026-09-04
**Status:** IN PROGRESS — living review log; `es fr de pt-BR ko` ship as English
mirrors until a human reviewer replaces every value.
**Last verified:** 2026-09-05

New locales (`es fr de pt-BR ko`) ship as English-valued structural
mirrors — never machine translation. A locale leaves this queue when a
human reviewer replaces every value, spot-checks interpolation
(`{{var}}`) and plural behavior in-app, and the `_meta` block is removed.

| Locale | Reviewer | Date | Notes |
|---|---|---|---|
| es | — | — | |
| fr | — | — | |
| de | — | — | |
| pt-BR | — | — | |
| ko | — | — | |

Existing-locale backlog (keys showing English via fallback):
`docs/reports/2026-09-04-i18n-backlog.md` (123 keys × ja/zh-CN/zh-TW).

Regenerate mirrors after en changes: `python scripts/build-locale-mirrors.py`.
Check drift: `python scripts/check-i18n-parity.py`.
