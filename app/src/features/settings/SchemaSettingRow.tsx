/**
 * Schema-driven setting row.
 *
 * Renders a single setting row based on its schema definition. The control
 * type is chosen from the schema `type` field: select → Select, boolean →
 * Switch, string → Input, number → Slider.
 *
 * Reads/writes through useSettingsStore so values are validated, clamped,
 * and persisted to settings.json via Tauri commands.
 */

import { useCallback } from "react";
import { SettingRow } from "@/features/settings/rows";
import { settingDef } from "@/lib/settings/schema";
import { useSettingsStore } from "@/stores/settingsStore";
import { Switch } from "@/ui/controls";
import { Input } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";

interface SchemaSettingRowProps {
	settingKey: string;
}

export function SchemaSettingRow({ settingKey }: SchemaSettingRowProps) {
	const store = useSettingsStore();
	const def = settingDef(settingKey);

	const handleChange = useCallback(
		(value: unknown) => {
			if (def) {
				void store.setSetting(def.key, value);
			}
		},
		[store, def],
	);

	if (!def) {
		return null;
	}

	const current = store.getSetting(def.key);
	const isModified = store.isModified(def.key);

	return (
		<SettingRow
			title={def.label}
			description={def.description}
			action={
				<>
					{isModified && (
						<Badge tone="accent" className="text-xs">
							modified
						</Badge>
					)}
					{def.type === "select" ? (
						<Select
							value={String(current ?? def.default)}
							onValueChange={(v) => handleChange(v)}
						>
							<SelectTrigger className="h-7 w-48 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{def.options?.map((opt) => (
									<SelectItem key={opt} value={opt}>
										{opt}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : def.type === "boolean" ? (
						<Switch
							checked={Boolean(current)}
							onCheckedChange={(checked) => handleChange(checked)}
							label={def.label}
						/>
					) : def.type === "number" ? (
						<Slider
							min={0}
							max={100}
							step={1}
							value={[Number(current ?? def.default) ?? 0]}
							onValueChange={([v]) => handleChange(v ?? 0)}
						/>
					) : (
						<Input
							value={String(current ?? def.default ?? "")}
							onChange={(e) => handleChange(e.target.value)}
						/>
					)}
				</>
			}
		/>
	);
}
