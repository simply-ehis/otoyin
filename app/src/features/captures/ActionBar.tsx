import {
	AdjustmentsHorizontalIcon,
	ArrowUpTrayIcon,
	Cog6ToothIcon,
	MicrophoneIcon,
	PencilSquareIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CapturePill } from "@/features/capture/CapturePill";
import { CopyClipButton } from "@/features/clipboard/CopyClipButton";
import { apiClient } from "@/lib/api/client";
import type { Clip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import type { UseCaptureRecordingSessionResult } from "@/lib/hooks/useCaptureRecordingSession";
import type { DictationReadiness } from "@/lib/hooks/useDictationReadiness";
import { useSendTo } from "@/lib/hooks/useSendTo";
import { Button } from "@/ui/button";

/**
 * Captures header bar: active model summary, live dictate pill while
 * recording, configure/import/record actions otherwise.
 */
export function CapturesActionBar({
	sttModel,
	llmModel,
	session,
	readiness,
	onUpload,
	audioClip,
}: {
	sttModel?: string;
	llmModel: string;
	session: UseCaptureRecordingSessionResult;
	readiness: DictationReadiness;
	onUpload: () => void;
	audioClip: Clip | null;
}) {
	const { t } = useTranslation();
	const sendTo = useSendTo();
	const [handoffPending, setHandoffPending] = useState<
		"effects" | "transcript" | null
	>(null);

	async function sendSelectedAudioToEffects() {
		if (!audioClip) {
			return;
		}
		setHandoffPending("effects");
		try {
			const resp = await fetch(audioClip.audioUrl);
			if (!resp.ok) {
				throw new Error(`Could not load capture audio (${resp.status})`);
			}
			const blob = await resp.blob();
			const { audio_path } = await apiClient.dspUpload(
				blob,
				`${(audioClip.name || "capture").slice(0, 30).replace(/[^\w-]/g, "_")}.wav`,
			);
			sendTo("/effects", { path: audio_path });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setHandoffPending(null);
		}
	}

	async function sendSelectedAudioToTranscript() {
		if (!audioClip) {
			return;
		}
		setHandoffPending("transcript");
		try {
			const resp = await fetch(audioClip.audioUrl);
			if (!resp.ok) {
				throw new Error(`Could not load capture audio (${resp.status})`);
			}
			const blob = await resp.blob();
			const file = new File(
				[blob],
				`${(audioClip.name || "capture").slice(0, 30).replace(/[^\w-]/g, "_")}.wav`,
				{ type: blob.type || "audio/wav" },
			);
			const imported = await apiClient.importGeneration(file);
			sendTo("/transcript", { generation: imported.id });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setHandoffPending(null);
		}
	}
	return (
		<div className="flex items-center gap-3 px-8 py-4">
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
				{t("captures.header.modelSummary", {
					stt: sttModel
						? sttModel.charAt(0).toUpperCase() + sttModel.slice(1)
						: "—",
					llm: llmModel,
				})}
			</p>
			<span className="flex-1" />
			{session.pillState !== "hidden" ? (
				<CapturePill
					state={session.pillState}
					elapsedMs={session.pillElapsedMs}
					errorMessage={session.errorMessage}
					onDismiss={session.dismissError}
					onStop={session.isRecording ? session.stopRecording : undefined}
				/>
			) : (
				<>
					<CopyClipButton
						clip={audioClip}
						label={t("captures.actions.copyAudio", {
							defaultValue: "Copy audio",
						})}
						title={t("captures.actions.copyAudioTitle", {
							defaultValue:
								"Copy the selected capture's audio — paste in any tab",
						})}
					/>
					{audioClip ? (
						<>
							<Button
								variant="outline"
								disabled={handoffPending !== null}
								title="Send the selected capture to Effects"
								onClick={() => void sendSelectedAudioToEffects()}
							>
								<AdjustmentsHorizontalIcon
									className="mr-2 size-4"
									aria-hidden="true"
								/>
								{t("captures.actions.sendToEffects", {
									defaultValue: "Effects",
								})}
							</Button>
							<Button
								variant="outline"
								disabled={handoffPending !== null}
								title="Send the selected capture to Transcript Edit"
								onClick={() => void sendSelectedAudioToTranscript()}
							>
								<PencilSquareIcon className="mr-2 size-4" aria-hidden="true" />
								{t("captures.actions.sendToTranscript", {
									defaultValue: "Transcript",
								})}
							</Button>
						</>
					) : null}
					<Button variant="outline" asChild>
						<Link to="/settings/captures">
							<Cog6ToothIcon className="mr-2 size-4" aria-hidden="true" />
							{t("captures.actions.configure")}
						</Link>
					</Button>
					{readiness.canRecord ? (
						<Button
							variant="outline"
							onClick={onUpload}
							disabled={session.isUploading}
							loading={session.isUploading}
						>
							<ArrowUpTrayIcon className="mr-2 size-4" aria-hidden="true" />
							{session.isUploading
								? t("captures.actions.importing")
								: t("captures.actions.import")}
						</Button>
					) : null}
				</>
			)}
			{readiness.canRecord || session.isRecording ? (
				<Button
					onClick={session.toggleRecording}
					disabled={session.isUploading && !session.isRecording}
				>
					{session.isRecording ? (
						<>
							<StopIcon
								className="mr-2 size-4 fill-current"
								aria-hidden="true"
							/>
							{t("captures.actions.stop")}
						</>
					) : (
						<>
							<MicrophoneIcon className="mr-2 size-4" aria-hidden="true" />
							{t("captures.actions.dictate")}
						</>
					)}
				</Button>
			) : null}
		</div>
	);
}
