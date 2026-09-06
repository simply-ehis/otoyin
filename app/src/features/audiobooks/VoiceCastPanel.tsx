import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { debug } from "@/lib/utils/debug";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";

/**
 * Voice cast: LLM-suggested characters with voice assignment.
 * Suggestions refresh per book; assignments persist immediately.
 */
export function VoiceCastPanel({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	const [suggesting, setSuggesting] = useState(false);
	const [chars, setChars] = useState<
		{
			character: string;
			gender?: string;
			traits?: string;
			suggested_profile_id?: string | null;
			suggested_profile_name?: string | null;
			profile_id?: string | null;
		}[]
	>([]);
	const { data: profiles } = useProfiles();
	const castMap = new Map(detail.cast.map((c) => [c.character, c.profile_id]));

	const suggest = async () => {
		setSuggesting(true);
		try {
			const r = await apiClient.suggestCast(detail.id);
			setChars(r.characters);
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setSuggesting(false);
		}
	};

	const assign = async (character: string, profileId: string) => {
		try {
			await apiClient.upsertCast(detail.id, {
				character,
				profile_id: profileId || null,
			});
			onRefresh();
		} catch (err: unknown) {
			showStudioErrorToast(err);
			debug.warn("[audiobooks] assign cast failed:", err);
		}
	};

	return (
		<section
			aria-label="Voice cast"
			className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
		>
			<p className="flex items-center justify-between">
				<span className="text-sm font-medium text-foreground">
					Voice cast — per character (LLM)
				</span>
				<Button
					size="sm"
					variant="outline"
					onClick={suggest}
					disabled={suggesting}
					loading={suggesting}
				>
					{suggesting ? "Analyzing…" : "Suggest with LLM"}
				</Button>
			</p>
			<p className="text-xs leading-relaxed text-muted-foreground">
				LLM reads the chapters and extracts characters (Narrator, Alice…); you
				assign a voice per character. Uses the on-device planner; heuristic
				fallback if the LLM is not cached.
			</p>
			{chars.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{chars.map((c) => (
						<li key={c.character} className="flex items-center gap-2 text-sm">
							<span className="w-32 truncate font-medium text-foreground">
								{c.character}
							</span>
							<span className="flex-1 truncate text-xs text-muted-foreground">
								{c.traits || c.gender || ""}
								{c.suggested_profile_name
									? ` → ${c.suggested_profile_name}`
									: ""}
							</span>
							<Select
								value={
									(castMap.get(c.character) ||
										c.suggested_profile_id ||
										"") as string
								}
								onValueChange={(v) => void assign(c.character, v)}
							>
								<SelectTrigger
									className="h-8 w-[180px] text-xs"
									aria-label={`Voice for ${c.character}`}
								>
									<SelectValue placeholder="— pick voice —" />
								</SelectTrigger>
								<SelectContent>
									{(profiles ?? []).map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</li>
					))}
				</ul>
			) : null}
			{detail.cast.length > 0 && chars.length === 0 ? (
				<ul className="flex flex-col gap-1 text-xs">
					{detail.cast.map((c) => (
						<li key={c.character} className="flex gap-2">
							<span className="font-medium text-foreground">{c.character}</span>
							<span className="text-muted-foreground">
								{c.profile_id || "unassigned"}
							</span>
						</li>
					))}
				</ul>
			) : null}
			{detail.cast.length === 0 && chars.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					No cast yet — run Suggest to detect characters.
				</p>
			) : null}
		</section>
	);
}
