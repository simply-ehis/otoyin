import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

interface DialogueInput {
	character: string;
	text: string;
	voiceProfileId?: string | null;
	engine?: string;
}

interface SceneInput {
	id: string;
	name: string;
	duration: number;
	dialogue: DialogueInput[];
}

interface PlanTrack {
	id: string;
	track_type: string;
	name: string;
	character?: string | null;
	start_time_ms: number;
	end_time_ms: number;
	notes?: string;
}

interface PlanScene {
	scene_id: string;
	scene_name: string;
	duration_seconds: number;
	tracks: PlanTrack[];
}

type TrackType = "dialogue" | "music" | "sfx" | "ambient";

interface GuidedTrack {
	id: string;
	name: string;
	type: TrackType;
}

function isPlanScene(v: unknown): v is PlanScene {
	if (typeof v !== "object" || v === null) {
		return false;
	}
	const s = v as Record<string, unknown>;
	return (
		typeof s.scene_id === "string" &&
		typeof s.scene_name === "string" &&
		typeof s.duration_seconds === "number" &&
		Array.isArray(s.tracks)
	);
}

function newScene(n: number): SceneInput {
	return {
		id: `scene-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
		name: `Scene ${n}`,
		duration: 30,
		dialogue: [],
	};
}

function SceneCard({
	scene,
	index,
	onUpdate,
	onRemove,
	profiles,
}: {
	scene: SceneInput;
	index: number;
	onUpdate: (patch: Partial<SceneInput>) => void;
	onRemove: () => void;
	profiles: VoiceProfileResponse[];
}) {
	function updateDialogue(i: number, patch: Partial<DialogueInput>) {
		onUpdate({
			dialogue: scene.dialogue.map((d, j) =>
				i === j ? { ...d, ...patch } : d,
			),
		});
	}

	return (
		<div className="space-y-2 rounded-md border border-border bg-card p-3">
			<div className="flex items-center gap-2">
				<Badge tone="neutral">S{index + 1}</Badge>
				<Input
					value={scene.name}
					onChange={(e) => onUpdate({ name: e.target.value })}
					className="h-7 flex-1 text-xs"
					aria-label={`Scene ${index + 1} name`}
				/>
				<div className="flex items-center gap-1">
					<Input
						type="number"
						min={1}
						value={scene.duration}
						onChange={(e) =>
							onUpdate({ duration: Math.max(1, Number(e.target.value) || 1) })
						}
						className="h-7 w-16 text-xs"
						aria-label={`Scene ${index + 1} duration seconds`}
					/>
					<span className="text-xs text-muted-foreground">s</span>
				</div>
				<button
					type="button"
					className="rounded-sm p-1 text-destructive transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Remove scene"
					aria-label={`Remove ${scene.name}`}
					onClick={onRemove}
				>
					<TrashIcon className="size-3.5" aria-hidden="true" />
				</button>
			</div>
			<div className="space-y-1 pl-1">
				{scene.dialogue.map((d, i) => (
					<div key={`${scene.id}-dlg-${i}`} className="flex items-center gap-2">
						<Input
							value={d.character}
							placeholder="Character"
							onChange={(e) => updateDialogue(i, { character: e.target.value })}
							className="h-7 w-28 text-xs"
							aria-label={`Scene ${index + 1} line ${i + 1} character`}
						/>
						<Input
							value={d.text}
							placeholder="Dialogue line"
							onChange={(e) => updateDialogue(i, { text: e.target.value })}
							className="h-7 flex-1 text-xs"
							aria-label={`Scene ${index + 1} line ${i + 1} text`}
						/>
						<Select
							value={d.voiceProfileId ?? ""}
							onValueChange={(v) =>
								updateDialogue(i, { voiceProfileId: v || null })
							}
						>
							<SelectTrigger className="h-7 w-32 text-xs" aria-label="Voice">
								<SelectValue placeholder="Voice…" />
							</SelectTrigger>
							<SelectContent>
								{profiles.map((p: VoiceProfileResponse) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<button
							type="button"
							className="rounded-sm p-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							title="Remove dialogue line"
							aria-label={`Remove scene ${index + 1} line ${i + 1}`}
							onClick={() =>
								onUpdate({ dialogue: scene.dialogue.filter((_, j) => j !== i) })
							}
						>
							×
						</button>
					</div>
				))}
				<button
					type="button"
					className="rounded-sm text-xs text-muted-foreground underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() =>
						onUpdate({
							dialogue: [...scene.dialogue, { character: "", text: "" }],
						})
					}
				>
					+ Dialogue line
				</button>
			</div>
		</div>
	);
}

export function AudioPlanView() {
	const { toast } = useToast();
	const { data: profiles } = useProfiles();
	const [mode, setMode] = useState<"auto" | "guided">("auto");
	const [scenes, setScenes] = useState<SceneInput[]>([]);
	const [guidedTracks, setGuidedTracks] = useState<GuidedTrack[]>([]);
	const [plan, setPlan] = useState<PlanScene[]>([]);

	const generateMut = useMutation({
		mutationFn: () =>
			apiClient.generateAutoPlan({
				scenes: scenes.map((s) => ({
					id: s.id,
					name: s.name,
					duration: s.duration,
					dialogue: s.dialogue
						.filter((d) => d.text.trim())
						.map((d) => ({ character: d.character, text: d.text })),
				})),
			}),
		onSuccess: (res) => {
			try {
				const parsed: unknown = JSON.parse(res.plan_json);
				const list = (parsed as { scenes?: unknown }).scenes;
				const valid = Array.isArray(list) ? list.filter(isPlanScene) : [];
				setPlan(valid);
				if (valid.length === 0) {
					toast({
						title: "Plan came back empty",
						description: "The planner returned no scenes.",
						variant: "destructive",
					});
				}
			} catch {
				setPlan([]);
				toast({
					title: "Plan couldn't be read",
					description: "The planner returned an unreadable response.",
					variant: "destructive",
				});
			}
		},
		onError: () =>
			toast({
				title: "Audio plan generation failed",
				variant: "destructive",
			}),
	});

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Audio Plan" />
			<fieldset
				className="m-0 flex min-w-0 items-center gap-2 border-0 p-0"
				aria-label="Plan mode"
			>
				<Button
					type="button"
					variant={mode === "auto" ? "default" : "ghost"}
					size="sm"
					className="h-8 text-xs"
					aria-pressed={mode === "auto"}
					title="Auto mode"
					aria-label="Switch to auto mode"
					onClick={() => setMode("auto")}
				>
					Auto
				</Button>
				<Button
					type="button"
					variant={mode === "guided" ? "default" : "ghost"}
					size="sm"
					className="h-8 text-xs"
					aria-pressed={mode === "guided"}
					title="Guided mode"
					aria-label="Switch to guided mode"
					onClick={() => setMode("guided")}
				>
					Guided
				</Button>
			</fieldset>

			<Separator />

			{mode === "auto" ? (
				<>
					<div className="flex items-center justify-between">
						<Label>
							Scenes{" "}
							<span className="text-muted-foreground">({scenes.length})</span>
						</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							title="Add scene"
							aria-label="Add scene"
							onClick={() => setScenes((p) => [...p, newScene(p.length + 1)])}
						>
							<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
							Scene
						</Button>
					</div>

					{scenes.length === 0 ? (
						<EmptyState
							title="No scenes yet"
							body="Add at least one scene, then generate the plan."
						/>
					) : (
						<div className="space-y-2">
							{scenes.map((scene, i) => (
								<SceneCard
									key={scene.id}
									scene={scene}
									index={i}
									profiles={profiles ?? []}
									onUpdate={(patch) =>
										setScenes((p) =>
											p.map((s) =>
												s.id === scene.id ? { ...s, ...patch } : s,
											),
										)
									}
									onRemove={() =>
										setScenes((p) => p.filter((s) => s.id !== scene.id))
									}
								/>
							))}
						</div>
					)}

					<div>
						<Button
							type="button"
							size="sm"
							disabled={generateMut.isPending || scenes.length === 0}
							title="Generate audio plan"
							aria-label="Generate audio plan"
							onClick={() => generateMut.mutate()}
						>
							{generateMut.isPending ? (
								<Spinner size="xs" className="mr-1" />
							) : null}
							{generateMut.isPending ? "Generating…" : "Generate Audio Plan"}
						</Button>
					</div>

					{plan.length > 0 ? (
						<>
							<Separator />
							<div className="space-y-3">
								<h2 className="text-sm font-medium text-foreground">
									Generated plan
								</h2>
								{plan.map((scene) => (
									<div
										key={scene.scene_id}
										className="space-y-2 rounded-md border border-border bg-card p-3"
									>
										<div className="flex flex-wrap items-center gap-2">
											<span className="text-xs font-medium text-foreground">
												{scene.scene_name}
											</span>
											<Badge tone="neutral">
												{scene.duration_seconds}s · {scene.tracks.length} tracks
											</Badge>
										</div>
										<ul className="space-y-1">
											{scene.tracks.map((t) => (
												<li
													key={t.id}
													className="flex flex-wrap items-baseline gap-x-2 text-xs"
												>
													<Badge tone="accent">{t.track_type}</Badge>
													<span className="font-medium text-foreground">
														{t.name}
													</span>
													{t.character ? (
														<span className="text-muted-foreground">
															{t.character}
														</span>
													) : null}
													<span className="ml-auto tabular-nums text-muted-foreground">
														{(t.start_time_ms / 1000).toFixed(1)}s →{" "}
														{(t.end_time_ms / 1000).toFixed(1)}s
													</span>
													{t.notes ? (
														<span className="w-full text-muted-foreground">
															{t.notes}
														</span>
													) : null}
												</li>
											))}
										</ul>
									</div>
								))}
							</div>
						</>
					) : null}
				</>
			) : (
				<>
					<div className="flex items-center justify-between">
						<Label>
							Tracks{" "}
							<span className="text-muted-foreground">
								({guidedTracks.length})
							</span>
						</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							title="Add track"
							aria-label="Add track"
							onClick={() =>
								setGuidedTracks((p) => [
									...p,
									{
										id: `trk-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
										name: `Track ${p.length + 1}`,
										type: "dialogue",
									},
								])
							}
						>
							<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
							Track
						</Button>
					</div>

					{guidedTracks.length === 0 ? (
						<EmptyState
							title="No tracks yet"
							body="Add tracks to build your audio plan manually."
						/>
					) : (
						<div className="space-y-2">
							{guidedTracks.map((track) => (
								<div
									key={track.id}
									className="flex items-center gap-2 rounded-md border border-border bg-card p-3"
								>
									<Input
										value={track.name}
										onChange={(e) =>
											setGuidedTracks((p) =>
												p.map((t) =>
													t.id === track.id
														? { ...t, name: e.target.value }
														: t,
												),
											)
										}
										className="h-7 flex-1 text-xs"
										aria-label="Track name"
									/>
									<Select
										value={track.type}
										onValueChange={(v) =>
											setGuidedTracks((p) =>
												p.map((t) =>
													t.id === track.id
														? { ...t, type: v as TrackType }
														: t,
												),
											)
										}
									>
										<SelectTrigger
											className="h-7 w-28 text-xs"
											aria-label="Track type"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{(["dialogue", "music", "sfx", "ambient"] as const).map(
												(k) => (
													<SelectItem key={k} value={k}>
														{k}
													</SelectItem>
												),
											)}
										</SelectContent>
									</Select>
									<button
										type="button"
										className="rounded-sm p-1 text-destructive transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										title="Remove track"
										aria-label={`Remove ${track.name}`}
										onClick={() =>
											setGuidedTracks((p) => p.filter((t) => t.id !== track.id))
										}
									>
										<TrashIcon className="size-3.5" aria-hidden="true" />
									</button>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
