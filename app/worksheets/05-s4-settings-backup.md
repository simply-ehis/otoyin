# Worksheet — §5 S4 Settings Backup/Export

STATUS: COMPLETE (integrated into S3 SchemaSettingsPage)

## Changes
- SchemaSettingsPage.tsx: Added export/import buttons for settings backup/restore
- Export: Serializes settings.json (excluding hidden keys starting with `_`) to a downloadable JSON file
- Import: Reads JSON file, validates, and applies each setting via setSetting
- i18n keys added: settings.schema.title, settings.schema.description, settings.schema.export, settings.schema.import

## Gate: 11/11 ALL CHECKS PASSED

## Files changed (committed in commit 3c790771)
- app/src/features/settings/SchemaSettingsPage.tsx (modified - added export/import)
- app/src/i18n/locales/en/translation.json (modified - added schema.* keys)
