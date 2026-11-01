import {
	MicrophoneIcon,
	PlayIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import { inferStudioError } from "@/lib/errors";
import { useStreamingTtsPreview } from "@/lib/hooks/useStreamingTtsPreview";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/input";
import { Spinner } from "@/ui/Spinner";
import { ScreenHeader } from "@/ui/states";
import { CloneSidebar } from "./CloneSidebar";
import { VoiceFormDialog } from "./VoiceFormDialog";

export function ClonePage() {
	const { t } = useTranslation();
	const {
		data: voices,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["voice-profiles"],
		queryFn: () => apiClient.listProfiles(),
	});
	const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
	const [script, setScript] = useState("");
	const [generating, setGenerating] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const preview = useStreamingTtsPreview();
	const setProfileDialogOpen = useUIStore((s) => s.setProfileDialogOpen);
	const setEditingProfileId = useUIStore((s) => s.setEditingProfileId);

	const handleCreateVoice = () => {
		setEditingProfileId(null);
		setProfileDialogOpen(true);
	};

	useEffect(() => {
		if (!preview.state.isPlaying && generating) {
			setGenerating(false);
		}
	}, [preview.state.isPlaying, generating]);

	useEffect(() => {
		if (timer.current) {
			clearTimeout(timer.current);
		}
		timer.current = setTimeout(() => {
			if (!script.trim() && selectedVoiceId) {
				setScript(`Hello, this is a voice clone test.`);
			}
		}, 500);
		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
		};
	}, [selectedVoiceId, script]);

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex h-full items-center justify-center text-center">
				<div>
					<p className="font-medium text-destructive">{studioErr.title}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{studioErr.message}
					</p>
				</div>
			</div>
		);
	}

	const voiceList = voices ?? [];

	if (isLoading) {
		return (
			<div className="flex h-full min-h-0 flex-col items-center justify-center">
				<Spinner size="md" />
				<p className="mt-2 text-sm text-muted-foreground">
					{t("voicesTab.loading")}
				</p>
			</div>
		);
	}

	const handleGenerate = () => {
		if (!selectedVoiceId || !script.trim()) {
			return;
		}
		setGenerating(true);
		preview.play(script.trim(), { kokoro_voice: selectedVoiceId }, "en");
	};

	const handleStop = () => {
		preview.stop();
		setGenerating(false);
	};

	return (
		<>
			<div className="flex h-full min-h-0 overflow-hidden">
				<CloneSidebar
					voices={voiceList}
					onVoiceSelected={setSelectedVoiceId}
					onCreateVoice={handleCreateVoice}
					selectedVoiceId={selectedVoiceId}
				/>
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<ScreenHeader title="Clone Voice" />
					<div className="flex shrink-0 items-center gap-1 px-5 py-4">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setSelectedVoiceId(null)}
							disabled={!selectedVoiceId}
						>
							Change voice
						</Button>
						{generating ? (
							<Button size="sm" variant="outline" onClick={handleStop}>
								<StopIcon className="size-4" />
								Stop
							</Button>
						) : (
							<Button
								size="sm"
								onClick={handleGenerate}
								disabled={!selectedVoiceId || !script.trim()}
							>
								<PlayIcon className="size-4" />
								Generate clone
							</Button>
						)}
					</div>
					<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-5 overflow-y-auto px-6 pt-6 pb-4">
						{selectedVoiceId ? (
							<div className="space-y-4">
								<Textarea
									value={script}
									onChange={(e) => setScript(e.target.value)}
									placeholder="Paste text to clone…"
									aria-label="Clone script"
									className="min-h-[140px]"
									data-clone-script
								/>
							</div>
						) : (
							<div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-12 text-center">
								<MicrophoneIcon
									className="size-12 text-muted-foreground/50"
									aria-hidden="true"
								/>
								<p className="text-sm text-muted-foreground">
									Select a voice to begin cloning
								</p>
							</div>
						)}
					</div>
					{selectedVoiceId && (
						<footer className="composer-surface rounded-xl border border-border/60 bg-muted/30 p-2.5 shadow-[0_2px_12px_rgb(0_0_0/4%)]">
							{generating && (
								<div className="mb-2 h-[2px] w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full bg-primary transition-all duration-150"
										style={{ width: `${preview.state.progress}%` }}
									/>
								</div>
							)}
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">
									{generating
										? `Streaming… ${preview.state.progress}%`
										: "Ready"}
								</span>
							</div>
						</footer>
					)}
				</div>
			</div>
			<VoiceFormDialog />
		</>
	);
}
