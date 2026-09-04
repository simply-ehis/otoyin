import {
	MicrophoneIcon as Mic,
	Cog6ToothIcon as Settings2,
	StopIcon as Square,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CapturePill } from "@/components/CapturePill/CapturePill";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import type { UseCaptureRecordingSessionResult } from "@/lib/hooks/useCaptureRecordingSession";
import type { DictationReadiness } from "@/lib/hooks/useDictationReadiness";

type Props = {
	sttModel: string;
	llmModel: string;
	session: UseCaptureRecordingSessionResult;
	readiness: DictationReadiness;
	handleUploadClick: () => void;
};

export function CapturesActionBar({
	sttModel,
	llmModel,
	session,
	readiness,
	handleUploadClick,
}: Props) {
	const { t } = useTranslation();
	return (
		<div className="absolute top-0 left-0 right-0 z-20 px-8">
			<div className="flex items-center gap-3 py-4">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="w-1.5 h-1.5 rounded-full bg-accent" />
					<span>
						{t("captures.header.modelSummary", {
							stt: sttModel.charAt(0).toUpperCase() + sttModel.slice(1),
							llm: llmModel,
						})}
					</span>
				</div>
				<div className="flex-1" />
				{session.pillState !== "hidden" && (
					<CapturePill
						state={session.pillState}
						elapsedMs={session.pillElapsedMs}
						errorMessage={session.errorMessage}
						onDismiss={session.dismissError}
						onStop={session.isRecording ? session.stopRecording : undefined}
					/>
				)}
				{session.pillState === "hidden" && (
					<>
						<Button variant="outline" asChild>
							<Link to="/settings/captures">
								<Settings2 className="mr-2 size-4" />
								{t("captures.actions.configure")}
							</Link>
						</Button>
						{readiness.canRecord && (
							<Button
								variant="outline"
								onClick={handleUploadClick}
								disabled={session.isUploading}
							>
								{session.isUploading ? (
									<Spinner size="md" className="mr-2" />
								) : (
									<Upload className="size-4 mr-2" />
								)}
								{session.isUploading
									? t("captures.actions.importing")
									: t("captures.actions.import")}
							</Button>
						)}
					</>
				)}
				{(readiness.canRecord || session.isRecording) && (
					<Button
						onClick={session.toggleRecording}
						disabled={session.isUploading && !session.isRecording}
						className="relative overflow-hidden transition-colors bg-accent text-accent-foreground hover:bg-accent/90"
					>
						{session.isRecording ? (
							<>
								<Square className="size-4 mr-2 fill-current" />
								{t("captures.actions.stop")}
							</>
						) : (
							<>
								<Mic className="size-4 mr-2" />
								{t("captures.actions.dictate")}
							</>
						)}
					</Button>
				)}
			</div>
		</div>
	);
}
