import {
	ArrowDownTrayIcon as Download,
	FolderOpenIcon as FolderOpen,
	CpuChipIcon as Gauge,
	MicrophoneIcon as Mic,
	PlusIcon as Plus,
	ArrowUturnRightIcon as Redo2,
	CheckIcon as Save,
	ScissorsIcon as Scissors,
	ArrowUturnLeftIcon as Undo2,
	ArrowPathIcon as UndoAuto,
} from "@heroicons/react/24/outline";
import type { IsolationStem } from "@/features/workspace/VocalIsolationView";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";

interface StudioToolbarProps {
	unsaved: boolean;
	showAutomation: boolean;
	exporting: boolean;
	exportWithPlugins: boolean;
	undoStackLength: number;
	redoStackLength: number;
	tracksHaveAudio: boolean;
	tracksHaveAnyContent: boolean;
	canUndoAutosave: boolean;
	isolating: boolean;
	isolateStem: IsolationStem;
	selectedTrackHasAudio: boolean;
	onNew: () => void;
	onSave: () => void;
	onPaste: () => void;
	onLoad: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onUndoAutosave: () => void;
	onToggleAutomation: () => void;
	onExport: () => void;
	onExportWithPlugins: () => void;
	onIsolateStemChange: (stem: IsolationStem) => void;
	onIsolate: () => void;
	onProducePodcast: () => void;
}

export function StudioToolbar({
	unsaved,
	showAutomation,
	exporting,
	exportWithPlugins,
	undoStackLength,
	redoStackLength,
	tracksHaveAudio,
	tracksHaveAnyContent,
	canUndoAutosave,
	isolating,
	isolateStem,
	selectedTrackHasAudio,
	onNew,
	onSave,
	onPaste,
	onLoad,
	onUndo,
	onRedo,
	onUndoAutosave,
	onToggleAutomation,
	onExport,
	onExportWithPlugins,
	onIsolateStemChange,
	onIsolate,
	onProducePodcast,
}: StudioToolbarProps) {
	return (
		<ScreenHeader
			title="Audio Studio"
			helpPath="/audio-studio"
			className="border-b border-border bg-sidebar shrink-0"
			actions={
				<>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							if (unsaved) {
								const ok = window.confirm(
									"You have unsaved changes. Start a new session? Unsaved work will be lost.",
								);
								if (!ok) {
									return;
								}
							}
							onNew();
						}}
						title="New session from template"
					>
						<Plus className="size-3 mr-1" />
						New
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onSave}
						title="Save session (Ctrl+S)"
					>
						<Save className="size-3 mr-1" />
						Save
						{unsaved && (
							<span
								role="img"
								className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning"
								title="Unsaved changes — Save to name this session"
								aria-label="Unsaved changes"
							/>
						)}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onPaste}
						title="Paste clip as track"
					>
						<Plus className="size-3 mr-1" />
						Paste
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onLoad}
						title="Load session (Ctrl+O)"
					>
						<FolderOpen className="size-3 mr-1" />
						Load
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onUndoAutosave}
						disabled={!canUndoAutosave}
						title="Undo autosave (restore previous snapshot)"
					>
						<UndoAuto className="size-3 mr-1" />
						Undo Save
					</Button>
					<div className="w-px h-4 bg-border mx-0.5" />
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onUndo}
						disabled={undoStackLength === 0}
						title="Undo (Ctrl+Z)"
					>
						<Undo2 className="size-3 mr-1" />
						Undo
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onRedo}
						disabled={redoStackLength === 0}
						title="Redo (Ctrl+Y)"
					>
						<Redo2 className="size-3 mr-1" />
						Redo
					</Button>
					<div className="w-px h-4 bg-border mx-0.5" />
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onToggleAutomation}
						title={showAutomation ? "Hide automation" : "Show automation"}
					>
						<Gauge className="size-3 mr-1" />
						{showAutomation ? "Auto on" : "Auto off"}
					</Button>
					<div className="w-px h-4 bg-border mx-0.5" />
					<Select
						value={isolateStem}
						onValueChange={(v) => onIsolateStemChange(v as IsolationStem)}
					>
						<SelectTrigger
							className="h-7 text-xs w-[100px] px-2"
							title="Stem to isolate from the selected track"
							aria-label="Stem to isolate"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="vocals">Vocals</SelectItem>
							<SelectItem value="drums">Drums</SelectItem>
							<SelectItem value="bass">Bass</SelectItem>
							<SelectItem value="other">Other</SelectItem>
						</SelectContent>
					</Select>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onIsolate}
						disabled={isolating || !selectedTrackHasAudio}
						title="Isolate stem from the selected track into a new track"
					>
						<Scissors className="size-3 mr-1" />
						{isolating ? "Isolating..." : "Isolate"}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onExport}
						disabled={exporting || !tracksHaveAudio}
						title="Export mixed audio"
					>
						<Download className="size-3 mr-1" />
						{exporting ? "Bouncing..." : "Export"}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onExportWithPlugins}
						disabled={exportWithPlugins || !tracksHaveAnyContent}
						title="Export with effect chain (server bounce)"
					>
						<Download className="size-3 mr-1" />
						{exportWithPlugins ? "Bouncing..." : "Export+FX"}
					</Button>
					<Button
						variant="default"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={onProducePodcast}
						disabled={!tracksHaveAnyContent}
						title="Produce a podcast from conversation script"
					>
						<Mic className="size-3 mr-1" />
						Podcast
					</Button>
				</>
			}
		/>
	);
}
