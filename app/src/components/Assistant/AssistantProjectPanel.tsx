import {
	PlusIcon as Plus,
	TrashIcon as Trash,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import type {
	AgentPlan,
	AgentProject,
	AgentProjectSource,
} from "@/lib/api/clientAgents";

interface AssistantProjectPanelProps {
	projects: AgentProject[];
	activeProjectId: string | null;
	sources: AgentProjectSource[];
	plans: AgentPlan[];
	newProjectName: string;
	setNewProjectName: (v: string) => void;
	newProjectDesc: string;
	setNewProjectDesc: (v: string) => void;
	newSource: { name: string; type: string; url: string };
	setNewSource: (
		v:
			| { name: string; type: string; url: string }
			| ((prev: { name: string; type: string; url: string }) => {
					name: string;
					type: string;
					url: string;
			  }),
	) => void;
	newPlan: { title: string; steps: string };
	setNewPlan: (
		v:
			| { title: string; steps: string }
			| ((prev: { title: string; steps: string }) => {
					title: string;
					steps: string;
			  }),
	) => void;
	creatingProject: boolean;
	addingSource: boolean;
	creatingPlan: boolean;
	selectingProject: boolean;
	selectProject: (id: string) => void;
	createProject: () => void;
	addSource: () => void;
	removeSource: (sourceId: string) => void;
	createPlan: () => void;
	setPlanStatus: (planId: string, status: string) => void;
	showProjects: boolean;
	showPlan: boolean;
}

export function AssistantProjectPanel({
	projects,
	activeProjectId,
	sources,
	plans,
	newProjectName,
	setNewProjectName,
	newProjectDesc,
	setNewProjectDesc,
	newSource,
	setNewSource,
	newPlan,
	setNewPlan,
	creatingProject,
	addingSource,
	creatingPlan,
	selectingProject,
	selectProject,
	createProject,
	addSource,
	removeSource,
	createPlan,
	setPlanStatus,
	showProjects,
	showPlan,
}: AssistantProjectPanelProps) {
	return (
		<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
			{showProjects && (
				<>
					<div className="space-y-2">
						<input
							value={newProjectName}
							onChange={(e) => setNewProjectName(e.target.value)}
							placeholder="New project name"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
						<input
							value={newProjectDesc}
							onChange={(e) => setNewProjectDesc(e.target.value)}
							placeholder="Description (optional)"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
						<Button
							size="sm"
							className="w-full"
							onClick={createProject}
							disabled={creatingProject}
						>
							{creatingProject ? (
								<Spinner size="sm" className="mr-1" />
							) : (
								<Plus className="size-4 mr-1" />
							)}
							{creatingProject ? "Creating..." : "Create project"}
						</Button>
					</div>

					<div className="space-y-2">
						{projects.map((p) => (
							<button
								key={p.id}
								type="button"
								onClick={() => selectProject(p.id)}
								disabled={selectingProject}
								className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
									activeProjectId === p.id
										? "border-accent/50 bg-accent/10"
										: "border-border hover:bg-muted/50"
								} ${selectingProject ? "opacity-50" : ""}`}
							>
								{p.name}
								{selectingProject && (
									<Spinner size="xs" className="absolute right-3" />
								)}
							</button>
						))}
						{projects.length === 0 && (
							<p className="text-xs text-muted-foreground">
								No projects yet. Create one to scope the agent's memory, plans,
								and assets.
							</p>
						)}
					</div>

					{activeProjectId && (
						<div className="space-y-3 pt-2 border-t border-border">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Sources
								</p>
								<div className="flex gap-1 mt-1">
									<input
										value={newSource.name}
										onChange={(e) =>
											setNewSource((s) => ({ ...s, name: e.target.value }))
										}
										placeholder="Source name"
										className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
									/>
									<select
										value={newSource.type}
										onChange={(e) =>
											setNewSource((s) => ({ ...s, type: e.target.value }))
										}
										className="rounded-md border border-input bg-background px-2 py-1 text-xs"
									>
										<option value="url">URL</option>
										<option value="file">File</option>
										<option value="freesound">Freesound</option>
										<option value="polyhaven">Poly Haven</option>
									</select>
								</div>
								{newSource.type === "url" && (
									<input
										value={newSource.url}
										onChange={(e) =>
											setNewSource((s) => ({ ...s, url: e.target.value }))
										}
										placeholder="https://"
										className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
									/>
								)}
								<Button
									size="sm"
									variant="outline"
									className="mt-1"
									onClick={addSource}
									disabled={
										addingSource || !activeProjectId || !newSource.name.trim()
									}
								>
									{addingSource ? (
										<Spinner size="sm" className="mr-1" />
									) : (
										<Plus className="size-3.5 mr-1" />
									)}
									{addingSource ? "Adding..." : "Add source"}
								</Button>
								<ul className="mt-2 space-y-1">
									{sources.map((s) => (
										<li
											key={s.id}
											className="flex items-center justify-between text-xs"
										>
											<span className="truncate">
												{s.name}{" "}
												<span className="text-muted-foreground">
													({s.source_type})
												</span>
											</span>
											<Button
												variant="ghost"
												size="icon"
												className="size-5"
												onClick={() => removeSource(s.id)}
												title="Remove source"
											>
												<Trash className="size-3.5" />
											</Button>
										</li>
									))}
								</ul>
							</div>
						</div>
					)}
				</>
			)}

			{showPlan &&
				(!activeProjectId ? (
					<p className="text-xs text-muted-foreground">
						Select a project in the Projects tab first, then author plans here.
					</p>
				) : (
					<>
						<div className="space-y-2">
							<input
								value={newPlan.title}
								onChange={(e) =>
									setNewPlan((p) => ({ ...p, title: e.target.value }))
								}
								placeholder="Plan title"
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
							<textarea
								value={newPlan.steps}
								onChange={(e) =>
									setNewPlan((p) => ({ ...p, steps: e.target.value }))
								}
								placeholder="Steps (one per line)"
								rows={4}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
							<Button
								size="sm"
								className="w-full"
								onClick={createPlan}
								disabled={
									creatingPlan || !activeProjectId || !newPlan.title.trim()
								}
							>
								{creatingPlan ? (
									<Spinner size="sm" className="mr-1" />
								) : (
									<Plus className="size-4 mr-1" />
								)}
								{creatingPlan ? "Creating..." : "Create plan"}
							</Button>
						</div>
						<div className="space-y-2 pt-2 border-t border-border">
							{plans.map((p) => (
								<div
									key={p.id}
									className="rounded-lg border border-border px-3 py-2"
								>
									<div className="flex items-center justify-between">
										<p className="text-sm font-medium">{p.title}</p>
										<select
											value={p.status}
											onChange={(e) => setPlanStatus(p.id, e.target.value)}
											className="rounded border border-input bg-background px-1 py-0.5 text-xs"
										>
											<option value="planned">Planned</option>
											<option value="in_progress">In progress</option>
											<option value="done">Done</option>
											<option value="archived">Archived</option>
										</select>
									</div>
									<ul className="mt-1 space-y-0.5">
										{p.steps.map((s) => (
											<li key={s.id} className="text-xs text-muted-foreground">
												{s.done ? "?" : "?"} {s.text}
											</li>
										))}
									</ul>
								</div>
							))}
							{plans.length === 0 && (
								<p className="text-xs text-muted-foreground">
									No plans yet for this project.
								</p>
							)}
						</div>
					</>
				))}
		</div>
	);
}
