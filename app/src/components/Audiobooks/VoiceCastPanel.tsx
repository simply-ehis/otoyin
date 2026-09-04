import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";
import { logger } from "@/lib/utils/debug";

export function VoiceCastPanel({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	const [suggesting, setSuggesting] = useState(false);
	const [chars, setChars] = useState<
		Array<{
			character: string;
			gender?: string;
			traits?: string;
			suggested_profile_id?: string | null;
			suggested_profile_name?: string | null;
			profile_id?: string | null;
		}>
	>([]);
	const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>(
		[],
	);

	async function suggest() {
		setSuggesting(true);
		try {
			const r = await apiClient.suggestCast(detail.id);
			setChars(r.characters as unknown as typeof chars);
			setProfiles(r.profiles.map((p) => ({ id: p.id, name: p.name })));
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setSuggesting(false);
		}
	}
	useEffect(() => {
		// load profiles fallback
		apiClient
			.listProfiles()
			.then((list: Array<{ id: string; name: string }>) => {
				setProfiles(list.map((p) => ({ id: p.id, name: p.name })));
			})
			.catch((e: unknown) => {
				logger.debug("[audiobooks] listProfiles failed", e);
			});
	}, []);

	async function assign(character: string, profileId: string) {
		await apiClient.upsertCast(detail.id, {
			character,
			profile_id: profileId || null,
		});
		onRefresh();
	}

	const castMap = new Map(detail.cast.map((c) => [c.character, c.profile_id]));

	return (
		<div className="border rounded-lg p-3 bg-card space-y-2">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium">
					Voice Cast — per character (LLM)
				</div>
				<button
					type="button"
					onClick={suggest}
					disabled={suggesting}
					className="text-xs px-2 py-1 rounded bg-secondary"
					title="Use LLM to detect characters and suggest voices"
				>
					{suggesting ? "Analyzing…" : "Suggest with LLM"}
				</button>
			</div>
			<div className="text-xs text-muted-foreground">
				LLM reads the chapters and extracts characters (Narrator, Alice…); you
				assign a voice per character. Uses on-device GGUF planner; heuristic
				fallback if LLM not cached.
			</div>
			{chars.length > 0 && (
				<div className="space-y-2">
					{chars.map((c) => (
						<div key={c.character} className="flex items-center gap-2 text-sm">
							<span className="w-32 truncate font-medium">{c.character}</span>
							<span className="text-xs text-muted-foreground truncate flex-1">
								{c.traits || c.gender || ""}
								{c.suggested_profile_name
									? ` → ${c.suggested_profile_name}`
									: ""}
							</span>
							<select
								value={
									(castMap.get(c.character) ||
										c.suggested_profile_id ||
										"") as string
								}
								onChange={(e) => assign(c.character, e.target.value)}
								className="px-2 py-1 rounded border bg-background text-sm"
							>
								<option value="">— pick voice —</option>
								{profiles.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>
					))}
				</div>
			)}
			{detail.cast.length > 0 && chars.length === 0 && (
				<div className="text-xs space-y-1">
					{detail.cast.map((c) => (
						<div key={c.character} className="flex gap-2">
							<span className="font-medium">{c.character}</span>
							<span className="text-muted-foreground">
								{c.profile_id || "unassigned"}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
