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

import { ArrowPathIcon as ResetIcon } from "@heroicons/react/24/outline";
import { memo, useCallback } from "react";
import { SettingRow } from "@/features/settings/rows";
import { clampValue, settingDef } from "@/lib/settings/schema";
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

export const SchemaSettingRow = memo(function SchemaSettingRow({
	settingKey,
}: SchemaSettingRowProps) {
	// Subscribe to just this row's value and the actions — a write to any other
	// setting must not re-render every row.
	const hasOverride = useSettingsStore((s) =>
		Object.hasOwn(s.values, settingKey),
	);
	const override = useSettingsStore((s) => s.values[settingKey]);
	const setSetting = useSettingsStore((s) => s.setSetting);
	const resetSetting = useSettingsStore((s) => s.resetSetting);
	const def = settingDef(settingKey);

	const handleChange = useCallback(
		(next: unknown) => {
			if (def) {
				void setSetting(def.key, next);
			}
		},
		[def, setSetting],
	);

	const handleReset = useCallback(() => {
		if (def) {
			void resetSetting(def.key);
		}
	}, [def, resetSetting]);

	if (!def) {
		return null;
	}

	const current = hasOverride ? clampValue(def, override) : def.default;
	const isModified = current !== def.default;

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
					{isModified && (
						<button
							type="button"
							onClick={handleReset}
							className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							title="Reset to default"
							aria-label="Reset to default"
						>
							<ResetIcon className="size-4" aria-hidden="true" />
						</button>
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
							min={def.min ?? 0}
							max={def.max ?? 100}
							step={def.step ?? 1}
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
});
