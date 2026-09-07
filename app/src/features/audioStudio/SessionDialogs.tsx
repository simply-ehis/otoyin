import { TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { PROJECT_TEMPLATES } from "./templates";

interface SavedSession {
	id: string;
	name: string;
	updated_at: string;
}

interface SessionDialogsProps {
	showSaveDialog: boolean;
	showLoadDialog: boolean;
	showTemplateDialog: boolean;
	sessionName: string;
	savedSessions: SavedSession[];
	setSessionName: (name: string) => void;
	setShowSaveDialog: (show: boolean) => void;
	setShowLoadDialog: (show: boolean) => void;
	setShowTemplateDialog: (show: boolean) => void;
	handleSaveSession: () => void;
	doLoadSession: (id: string) => void;
	doDeleteSession: (id: string) => void;
	doNewFromTemplate: (templateIndex: number) => void;
}

export function SessionDialogs({
	showSaveDialog,
	showLoadDialog,
	showTemplateDialog,
	sessionName,
	savedSessions,
	setSessionName,
	setShowSaveDialog,
	setShowLoadDialog,
	setShowTemplateDialog,
	handleSaveSession,
	doLoadSession,
	doDeleteSession,
	doNewFromTemplate,
}: SessionDialogsProps) {
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	return (
		<>
			<Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
				<DialogContent className="max-w-sm p-4">
					<DialogHeader>
						<DialogTitle>Save Session</DialogTitle>
					</DialogHeader>
					<input
						type="text"
						className="w-full h-8 text-xs bg-muted border border-border rounded px-2 text-foreground"
						placeholder="Session name"
						value={sessionName}
						onChange={(e) => setSessionName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSaveSession()}
						autoFocus
					/>
					<div className="flex gap-2 justify-end">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => setShowSaveDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="default"
							size="sm"
							className="h-7 text-xs"
							onClick={handleSaveSession}
						>
							Save
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
				<DialogContent className="max-w-sm p-4 max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Load Session</DialogTitle>
					</DialogHeader>
					{savedSessions.length === 0 ? (
						<p className="text-xs text-muted-foreground/60 py-4 text-center">
							No saved sessions
						</p>
					) : (
						<div className="space-y-1 overflow-y-auto flex-1 min-h-0">
							{savedSessions.map((s) => (
								<div
									key={s.id}
									className="group flex items-center gap-1 rounded hover:bg-muted transition-colors"
								>
									<button
										type="button"
										role="option"
										aria-selected={false}
										className="flex-1 text-left px-3 py-2 text-xs"
										onClick={() => doLoadSession(s.id)}
									>
										<span className="font-medium">{s.name}</span>
										<span className="ml-2 text-muted-foreground/50">
											{new Date(s.updated_at).toLocaleDateString()}
										</span>
									</button>
									{confirmDeleteId === s.id ? (
										<span className="flex items-center gap-1 pr-2 text-[10px]">
											<button
												type="button"
												className="text-destructive hover:underline"
												onClick={() => {
													doDeleteSession(s.id);
													setConfirmDeleteId(null);
												}}
											>
												Delete?
											</button>
											<button
												type="button"
												className="text-muted-foreground hover:underline"
												onClick={() => setConfirmDeleteId(null)}
											>
												No
											</button>
										</span>
									) : (
										<button
											type="button"
											className="hidden group-hover:flex items-center justify-center size-6 shrink-0 text-muted-foreground/40 hover:text-destructive rounded"
											title="Delete session"
											onClick={() => setConfirmDeleteId(s.id)}
										>
											<TrashIcon className="size-3.5" />
										</button>
									)}
								</div>
							))}
						</div>
					)}
					<div className="flex gap-2 justify-end mt-3">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => setShowLoadDialog(false)}
						>
							Cancel
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
				<DialogContent className="max-w-md p-4">
					<DialogHeader>
						<DialogTitle>New Session</DialogTitle>
					</DialogHeader>
					<p className="text-xs text-muted-foreground mb-3">
						Pick a starting template or start blank.
					</p>
					<div className="grid grid-cols-1 gap-2">
						{PROJECT_TEMPLATES.map((t, i) => (
							<button
								key={t.id}
								type="button"
								className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
								onClick={() => {
									doNewFromTemplate(i);
									setShowTemplateDialog(false);
								}}
							>
								<div className="flex-1">
									<p className="font-medium text-foreground">{t.name}</p>
									<p className="mt-0.5 text-muted-foreground">
										{t.description}
									</p>
								</div>
								<span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
									{t.trackCount} track{t.trackCount !== 1 ? "s" : ""}
								</span>
							</button>
						))}
					</div>
					<div className="flex gap-2 justify-end mt-3">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => setShowTemplateDialog(false)}
						>
							Cancel
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
