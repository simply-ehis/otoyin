/**
 * Schema-driven settings page.
 *
 * Renders all settings from SETTINGS_SCHEMA, grouped by their `group` field.
 * Each setting is rendered via SchemaSettingRow which handles the control
 * type (select, boolean, string, number), validation, clamping, and
 * persistence.
 *
 * Settings that differ from their default show a "modified" badge.
 */

import { useMemo } from "react";
import { SettingSection } from "@/features/settings/rows";
import { SchemaSettingRow } from "@/features/settings/SchemaSettingRow";
import { SETTINGS_SCHEMA } from "@/lib/settings/schema";

export function SchemaSettingsPage() {
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

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			{groups.map(([groupId, group]) => (
				<SettingSection key={groupId} title={group.label}>
					{group.keys.map((key) => (
						<SchemaSettingRow key={key} />
					))}
				</SettingSection>
			))}
		</div>
	);
}
