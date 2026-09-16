import {
	ArrowDownTrayIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	FolderOpenIcon,
	MusicalNoteIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import type { IsolationStem } from "@/features/workspace/VocalIsolationView";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";

interface StudioToolbarProps {
	unsaved: boolean;
	showAutomation: boolean;
	exporting: boolean;
	exportWithPlugins: boolean;
	undoStackLength: number;
	redoStackLength: number;
	tracksHaveAudio: boolean;
	tracksHaveAnyContent: boolean;
	canExportReaper: boolean;
	exportingReaper: boolean;
	isolating: boolean;
	isolateStem: IsolationStem;
	selectedTrackHasAudio: boolean;
	bouncing: boolean;
	groups: Array<{ id: string; name: string; collapsed: boolean }>;
	onNew: () => void;
	onSave: () => void;
	onPaste: () => void;
	onLoad: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onToggleAutomation: () => void;
	onExport: () => void;
	onExportWithPlugins: () => void;
	onExportReaper: () => void;
	onIsolateStemChange: (stem: IsolationStem) => void;
	onIsolate: () => void;
	onBounce: () => void;
	onProducePodcast: () => void;
	onAddGroup: (name: string) => void;
	onRemoveGroup: (id: string) => void;
	onToggleGroupCollapse: (id: string) => void;
	onToggleGroupMute: (id: string) => void;
	onToggleGroupSolo: (id: string) => void;
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
	canExportReaper,
	exportingReaper,
	isolating,
	isolateStem,
	selectedTrackHasAudio,
	bouncing,
	groups,
	onNew,
	onSave,
	onPaste,
	onLoad,
	onUndo,
	onRedo,
	onToggleAutomation,
	onExport,
	onExportWithPlugins,
	onExportReaper,
	onIsolateStemChange,
	onIsolate,
	onBounce,
	onProducePodcast,
	onAddGroup,
	onRemoveGroup,
	onToggleGroupCollapse,
	onToggleGroupMute,
	onToggleGroupSolo,
}: StudioToolbarProps) {
	const [showExportMenu, setShowExportMenu] = useState(false);
	const [showToolsMenu, setShowToolsMenu] = useState(false);

	return (
		<div className="flex items-center gap-1 h-8 px-3 border-b border-border bg-sidebar shrink-0">
			{/* File group */}
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
				<PlusIcon className="size-3 mr-1" />
				New
			</Button>
			<Button
				variant="ghost"
				size="sm"
				className="h-7 text-xs px-2"
				onClick={onSave}
				title="Save session (Ctrl+S)"
			>
				Save
				{unsaved && (
					<span
						role="img"
						className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning"
						title="Unsaved changes"
						aria-label="Unsaved changes"
					/>
				)}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				className="h-7 text-xs px-2"
				onClick={onLoad}
				title="Load session (Ctrl+O)"
			>
				<FolderOpenIcon className="size-3 mr-1" />
				Load
			</Button>

			<div className="w-px h-4 bg-border mx-1" />

			{/* Edit group */}
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={onUndo}
				disabled={undoStackLength === 0}
				title="Undo (Ctrl+Z)"
			>
				<ArrowUturnLeftIcon className="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={onRedo}
				disabled={redoStackLength === 0}
				title="Redo (Ctrl+Y)"
			>
				<ArrowUturnRightIcon className="size-3.5" />
			</Button>

			<div className="w-px h-4 bg-border mx-1" />

			{/* View group */}
			<Button
				variant={showAutomation ? "default" : "ghost"}
				size="sm"
				className="h-7 text-xs px-2"
				onClick={onToggleAutomation}
				title={
					showAutomation ? "Hide automation lanes" : "Show automation lanes"
				}
			>
				Automation
			</Button>

			<div className="w-px h-4 bg-border mx-1" />

			{/* Tools dropdown — stem isolation, podcast */}
			<div className="relative">
				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs px-2"
					onClick={() => setShowToolsMenu(!showToolsMenu)}
					title="Tools"
				>
					Tools
				</Button>
				{showToolsMenu && (
					<>
						<button
							type="button"
							tabIndex={-1}
							className="fixed inset-0 z-40 cursor-default"
							onClick={() => setShowToolsMenu(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setShowToolsMenu(false);
								}
							}}
							aria-label="Close tools menu"
						/>
						<div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[160px]">
							<div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Stem Isolation
							</div>
							<div className="flex items-center gap-1 px-2 py-1">
								<Select
									value={isolateStem}
									onValueChange={(v) => onIsolateStemChange(v as IsolationStem)}
								>
									<SelectTrigger
										className="h-6 text-xs flex-1"
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
									variant="outline"
									size="sm"
									className="h-6 text-xs"
									onClick={() => {
										setShowToolsMenu(false);
										onIsolate();
									}}
									disabled={isolating || !selectedTrackHasAudio}
								>
									{isolating ? "..." : "Isolate"}
								</Button>
							</div>
							<div className="h-px bg-border my-1" />
							<button
								type="button"
								className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm flex items-center gap-2"
								onClick={() => {
									setShowToolsMenu(false);
									onProducePodcast();
								}}
								disabled={!tracksHaveAnyContent}
							>
								<MusicalNoteIcon className="size-3" />
								Podcast Producer
							</button>
							<button
								type="button"
								className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm flex items-center gap-2"
								onClick={() => {
									setShowToolsMenu(false);
									onPaste();
								}}
							>
								Paste as Track
							</button>
							<button
								type="button"
								className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm flex items-center gap-2"
								onClick={() => {
									setShowToolsMenu(false);
									onBounce();
								}}
								disabled={bouncing || !selectedTrackHasAudio}
							>
								{bouncing ? "..." : "Bounce Track"}
							</button>
							<div className="h-px bg-border my-1" />
							<div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Groups
							</div>
							<button
								type="button"
								className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm"
								onClick={() => {
									const name = window.prompt("Group name:");
									if (name?.trim()) {
										onAddGroup(name.trim());
									}
									setShowToolsMenu(false);
								}}
							>
								+ New Group
							</button>
							{groups.map((g) => (
								<div
									key={g.id}
									className="flex items-center gap-1 px-2 py-0.5 text-xs"
								>
									<button
										type="button"
										onClick={() => onToggleGroupCollapse(g.id)}
										className="text-muted-foreground hover:text-foreground"
										title={g.collapsed ? "Expand group" : "Collapse group"}
									>
										{g.collapsed ? "▶" : "▼"}
									</button>
									<span className="flex-1 truncate">{g.name}</span>
									<button
										type="button"
										onClick={() => onToggleGroupMute(g.id)}
										className={cn(
											"px-1 text-[10px] font-bold rounded",
											"group-hover:text-muted-foreground hover:text-foreground",
										)}
										title="Mute/unmute group"
									>
										M
									</button>
									<button
										type="button"
										onClick={() => onToggleGroupSolo(g.id)}
										className={cn(
											"px-1 text-[10px] font-bold rounded",
											"group-hover:text-muted-foreground hover:text-foreground",
										)}
										title="Solo/unsolo group"
									>
										S
									</button>
									<button
										type="button"
										onClick={() => onRemoveGroup(g.id)}
										className="text-muted-foreground hover:text-destructive text-[10px]"
										title="Remove group"
									>
										×
									</button>
								</div>
							))}
						</div>
					</>
				)}
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{/* Export group — right side */}
			<div className="relative">
				<Button
					variant="default"
					size="sm"
					className="h-7 text-xs px-2"
					onClick={() => setShowExportMenu(!showExportMenu)}
					disabled={!tracksHaveAudio}
				>
					<ArrowDownTrayIcon className="size-3 mr-1" />
					{exporting || exportingReaper ? "Bouncing..." : "Export"}
				</Button>
				{showExportMenu && (
					<>
						<button
							type="button"
							tabIndex={-1}
							className="fixed inset-0 z-40 cursor-default"
							onClick={() => setShowExportMenu(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setShowExportMenu(false);
								}
							}}
							aria-label="Close export menu"
						/>
						<div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[180px]">
							<button
								type="button"
								className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary rounded-sm"
								onClick={() => {
									setShowExportMenu(false);
									onExport();
								}}
								disabled={exporting || !tracksHaveAudio}
							>
								<div className="font-medium">Export WAV</div>
								<div className="text-muted-foreground text-[10px]">
									Offline render — all tracks mixed
								</div>
							</button>
							<button
								type="button"
								className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary rounded-sm"
								onClick={() => {
									setShowExportMenu(false);
									onExportWithPlugins();
								}}
								disabled={exportWithPlugins || !tracksHaveAnyContent}
							>
								<div className="font-medium">Export with FX</div>
								<div className="text-muted-foreground text-[10px]">
									Server bounce — applies effect chains
								</div>
							</button>
							<button
								type="button"
								className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary rounded-sm"
								onClick={() => {
									setShowExportMenu(false);
									onExportReaper();
								}}
								disabled={exportingReaper || !canExportReaper}
							>
								<div className="font-medium">Reaper Project</div>
								<div className="text-muted-foreground text-[10px]">
									.rpp file for DAW handoff
								</div>
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
