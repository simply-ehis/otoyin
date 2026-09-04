import { CaptureModeConfig } from "./CaptureModeConfig";
import { CapturesSidebar } from "./CapturesSidebar";
import { PlaybackStorageSettings } from "./PlaybackStorageSettings";
import { RefinementSettings } from "./RefinementSettings";
import { StreamingSettings } from "./StreamingSettings";

export function CapturesPage() {
	return (
		<div className="flex gap-8 items-start max-w-5xl">
			<div className="flex-1 min-w-0 max-w-3xl space-y-10">
				<CaptureModeConfig />
				<StreamingSettings />
				<RefinementSettings />
				<PlaybackStorageSettings />
			</div>

			<CapturesSidebar />
		</div>
	);
}
