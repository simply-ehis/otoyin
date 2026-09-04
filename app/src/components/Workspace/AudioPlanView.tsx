import {
	LightBulbIcon as Brain,
	QueueListIcon as ListMusic,
	PlusIcon as Plus,
	SparklesIcon as Sparkles,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";

interface Scene {
	id: string;
	name: string;
	duration: number;
}

interface GuidedTrack {
	id: string;
	name: string;
	type: "dialogue" | "music" | "sfx" | "ambient";
}

export function AudioPlanView() {
	const { toast } = useToast();
	const [mode, setMode] = useState<"auto" | "guided">("auto");
	const [scenes, setScenes] = useState<Scene[]>([
		{ id: "1", name: "Scene 1: Introduction", duration: 30 },
		{ id: "2", name: "Scene 2: Dialogue", duration: 45 },
	]);
	const [guidedTracks, setGuidedTracks] = useState<GuidedTrack[]>([]);
	const [generated, setGenerated] = useState(false);

	const generateMut = useMutation({
		mutationFn: () =>
			apiClient.generateAutoPlan({
				scenes: scenes.map((s) => ({
					id: s.id,
					name: s.name,
					duration: s.duration,
				})),
			}),
	});

	function addScene() {
		const id = `${scenes.length + 1}-${Date.now()}`;
		setScenes([
			...scenes,
			{ id, name: `Scene ${scenes.length + 1}`, duration: 30 },
		]);
	}

	function removeScene(id: string) {
		setScenes(scenes.filter((s) => s.id !== id));
	}

	function addGuidedTrack() {
		const id = `t-${Date.now()}`;
		setGuidedTracks([
			...guidedTracks,
			{ id, name: `Track ${guidedTracks.length + 1}`, type: "dialogue" },
		]);
	}

	function generatePlan() {
		generateMut.mutate(undefined, {
			onSuccess: () => {
				setGenerated(true);
			},
			onError: () =>
				toast({
					title: "Audio plan generation failed",
					variant: "destructive",
				}),
		});
	}

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Sparkles className="size-5" />}
				title="Audio Plan"
				description="Generate a full post-production plan"
			/>
			{/* Mode toggle */}
			<div className="flex items-center gap-2">
				<Button
					variant={mode === "auto" ? "default" : "ghost"}
					size="sm"
					className="h-8 text-xs"
					title="Auto mode"
					aria-label="Switch to auto mode"
					onClick={() => setMode("auto")}
				>
					<Sparkles className="h-3.5 w-3.5 mr-1" /> Auto
				</Button>
				<Button
					variant={mode === "guided" ? "default" : "ghost"}
					size="sm"
					className="h-8 text-xs"
					title="Guided mode"
					aria-label="Switch to guided mode"
					onClick={() => setMode("guided")}
				>
					<Brain className="h-3.5 w-3.5 mr-1" /> Guided
				</Button>
			</div>

			<Separator />

			{mode === "auto" ? (
				<>
					{/* Scene list */}
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-foreground">Scenes</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							title="Add scene"
							aria-label="Add scene"
							onClick={addScene}
						>
							<Plus className="h-3.5 w-3.5" />
						</Button>
					</div>

					<div className="flex-1 space-y-2 overflow-y-auto">
						{scenes.map((scene) => (
							<div
								key={scene.id}
								className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card"
							>
								<span className="text-xs font-medium text-foreground flex-1">
									{scene.name}
								</span>
								<span className="text-xs text-muted-foreground tabular-nums">
									{scene.duration}s
								</span>
								<button
									type="button"
									className="p-0.5 text-destructive/60 hover:text-destructive"
									onClick={() => removeScene(scene.id)}
									title="Remove scene"
									aria-label="Remove scene"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						))}
					</div>

					<Button
						size="sm"
						disabled={generateMut.isPending}
						onClick={generatePlan}
						title="Generate audio plan"
						aria-label="Generate audio plan"
					>
						{generateMut.isPending ? (
							<Spinner />
						) : (
							<Sparkles className="size-4 mr-1" />
						)}
						{generateMut.isPending ? "Generating..." : "Generate Audio Plan"}
					</Button>
				</>
			) : (
				<>
					{/* Guided mode - empty track list */}
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-foreground">Tracks</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							title="Add track"
							aria-label="Add track"
							onClick={addGuidedTrack}
						>
							<Plus className="h-3.5 w-3.5" />
						</Button>
					</div>

					{guidedTracks.length === 0 ? (
						<EmptyState
							icon={<ListMusic className="size-6" />}
							title="No tracks yet"
							description="Add tracks to build your audio plan manually"
						/>
					) : (
						<div className="flex-1 space-y-2 overflow-y-auto">
							{guidedTracks.map((track) => (
								<div
									key={track.id}
									className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card"
								>
									<span className="text-xs font-medium text-foreground flex-1">
										{track.name}
									</span>
									<span className="text-xs text-muted-foreground capitalize">
										{track.type}
									</span>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{/* Results overlay */}
			{generated && (
				<>
					<Separator />
					<div className="rounded-lg border border-border bg-card p-3">
						<p className="text-xs font-medium text-foreground mb-2">
							Generated Audio Plan
						</p>
						<div className="h-20 rounded bg-muted/50 relative overflow-hidden">
							<div className="absolute inset-0 flex items-center justify-center">
								<p className="text-xs text-muted-foreground/60">
									Timeline grid overlay — plan preview
								</p>
							</div>
							{scenes.map((scene, i) => (
								<div
									key={scene.id}
									className="absolute top-0 h-full border-l border-accent/30"
									style={{ left: `${(i / scenes.length) * 100}%` }}
								>
									<div className="absolute top-1 left-1 text-[8px] text-accent whitespace-nowrap">
										{scene.name}
									</div>
								</div>
							))}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
