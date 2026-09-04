import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";

export function CachedEngineSelector({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (engine: string | null) => void;
}) {
	const [engines, setEngines] = useState<
		Array<{ engine: string; display_name: string }>
	>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		apiClient
			.listCachedEngines()
			.then((r) => setEngines(r.engines))
			.catch(() => setEngines([]))
			.finally(() => setLoading(false));
	}, []);
	if (loading) {
		return (
			<span className="text-xs text-muted-foreground">
				Loading cached engines…
			</span>
		);
	}
	if (engines.length === 0) {
		return (
			<span className="text-xs text-amber-600">
				No TTS engines cached — download one from Models tab first. No
				auto-download, no default.
			</span>
		);
	}
	return (
		<select
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value || null)}
			className="px-2 py-1 rounded border bg-background text-sm"
			title="Pick a cached TTS engine — only downloaded models are listed"
		>
			<option value="">— select engine —</option>
			{engines.map((e) => (
				<option key={e.engine} value={e.engine}>
					{e.display_name} ({e.engine})
				</option>
			))}
		</select>
	);
}
