import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";

interface SavedSession {
	id: string;
	name: string;
	updated_at: string;
}

interface SessionDialogsProps {
	showSaveDialog: boolean;
	showLoadDialog: boolean;
	sessionName: string;
	savedSessions: SavedSession[];
	setSessionName: (name: string) => void;
	setShowSaveDialog: (show: boolean) => void;
	setShowLoadDialog: (show: boolean) => void;
	handleSaveSession: () => void;
	doLoadSession: (id: string) => void;
}

export function SessionDialogs({
	showSaveDialog,
	showLoadDialog,
	sessionName,
	savedSessions,
	setSessionName,
	setShowSaveDialog,
	setShowLoadDialog,
	handleSaveSession,
	doLoadSession,
}: SessionDialogsProps) {
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
								<button
									key={s.id}
									type="button"
									role="option"
									aria-selected={false}
									className="w-full text-left px-3 py-2 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between"
									onClick={() => doLoadSession(s.id)}
								>
									<span className="font-medium">{s.name}</span>
									<span className="text-xs text-muted-foreground/50">
										{new Date(s.updated_at).toLocaleDateString()}
									</span>
								</button>
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
		</>
	);
}
