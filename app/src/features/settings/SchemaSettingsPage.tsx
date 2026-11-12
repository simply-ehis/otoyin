/**
 * Schema-driven settings page.
 *
 * Renders all settings from SETTINGS_SCHEMA, grouped by their `group` field.
 * Each setting is rendered via SchemaSettingRow which handles the control
 * type (select, boolean, string, number), validation, clamping, and
 * persistence.
 *
 * Settings that differ from their default show a "modified" badge.
 * Includes export/import for backup/restore (keys are excluded from export).
 */

import {
	ArrowDownTrayIcon as DownloadIcon,
	ArrowUpTrayIcon as UploadIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingSection } from "@/features/settings/rows";
import { SchemaSettingRow } from "@/features/settings/SchemaSettingRow";
import { SETTINGS_SCHEMA } from "@/lib/settings/schema";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/ui/button";

export function SchemaSettingsPage() {
	const { t } = useTranslation();
	const store = useSettingsStore();

	const groups = useMemo(() => {
		const grouped = new Map<string, { label: string; keys: string[] }>();
		for (const def of SETTINGS_SCHEMA) {
			if (!grouped.has(def.group)) {
				grouped.set(def.group, {
					label: def.group.charAt(0).toUpperCase() + def.group.slice(1),
					keys: [],
				});
			}
			grouped.get(def.group)?.keys.push(def.key);
		}
		return Array.from(grouped.entries());
	}, []);

	const handleExport = async () => {
		const values = store.values;
		const exportable = Object.fromEntries(
			Object.entries(values).filter(([k]) => !k.startsWith("_")),
		);
		const blob = new Blob([JSON.stringify(exportable, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `otoyin-settings-${new Date()
			.toISOString()
			.slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleImport = async (file: File) => {
		const text = await file.text();
		try {
			const values = JSON.parse(text);
			if (typeof values !== "object" || values === null) {
				throw new Error("Invalid settings file");
			}
			for (const [key, value] of Object.entries(values)) {
				if (key.startsWith("_")) {
					continue;
				}
				await store.setSetting(key, value);
			}
		} catch (err) {
			throw new Error(`Failed to import settings: ${err}`);
		}
	};

	const handleImportFile = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (file) {
				handleImport(file).catch((err) => {
					console.error(err);
				});
			}
		};
		input.click();
	};

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold text-foreground">
						{t("settings.schema.title")}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t("settings.schema.description")}
					</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={handleExport} variant="outline" size="sm">
						<DownloadIcon className="mr-1.5 size-3.5" />
						{t("settings.schema.export")}
					</Button>
					<Button onClick={handleImportFile} variant="outline" size="sm">
						<UploadIcon className="mr-1.5 size-3.5" />
						{t("settings.schema.import")}
					</Button>
				</div>
			</div>
			{groups.map(([groupId, group]) => (
				<SettingSection key={groupId} title={group.label}>
					{group.keys.map((key) => (
						<SchemaSettingRow key={key} settingKey={key} />
					))}
				</SettingSection>
			))}
		</div>
	);
}
