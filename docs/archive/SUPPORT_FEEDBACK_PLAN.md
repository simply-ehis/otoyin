# Otoyin Feedback and Support Plan

## Goals

Give core users a clear place to report defects, request improvements, and find
answers without exposing private marketplace operations or asking users to
publish logs that may contain personal audio or paths.

## First release

- Add a `/support` page to the public project site with three choices: report a
  bug, suggest a feature, or get help using Otoyin.
- Link bug reports and feature requests to issue forms in the public core
  repository. Ask for app version, operating system, reproduction steps,
  expected behavior, and optional screenshots.
- Route purchase, refund, license, and account questions to a separately
  configured private support address or form. Keep these reports out of public
  issues.
- Link the FAQ, troubleshooting guide, privacy policy, and release notes before
  asking a user to open a report.

## Privacy and abuse handling

- Tell users to remove API keys, access tokens, audio, model files, and personal
  paths from screenshots and logs. Do not request recordings by default.
- Make diagnostic attachments optional and explain where they will be visible.
  Provide a private contact path for security reports.
- Use issue forms and moderation labels; never ask for order numbers, license
  keys, or billing details in public issues.

## Delivery sequence

1. Create public bug and feature issue forms after the core repository exists.
2. Confirm the private purchase-support channel and response-time expectation.
3. Add the support page and footer link to the public website.
4. Check links, keyboard access, narrow layouts, and public/private routing.

Keep marketplace account, payment, license, and model-delivery support private.
