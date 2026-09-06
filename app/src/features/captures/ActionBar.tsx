import {
	ArrowUpTrayIcon,
	Cog6ToothIcon,
	MicrophoneIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CapturePill } from "@/features/capture/CapturePill";
import { CopyClipButton } from "@/features/clipboard/CopyClipButton";
import type { Clip } from "@/lib/clip";
import type { UseCaptureRecordingSessionResult } from "@/lib/hooks/useCaptureRecordingSession";
import type { DictationReadiness } from "@/lib/hooks/useDictationReadiness";
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
	sttModel: string;
	llmModel: string;
	session: UseCaptureRecordingSessionResult;
	readiness: DictationReadiness;
	onUpload: () => void;
	audioClip: Clip | null;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex items-center gap-3 px-8 py-4">
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
				{t("captures.header.modelSummary", {
					stt: sttModel.charAt(0).toUpperCase() + sttModel.slice(1),
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
