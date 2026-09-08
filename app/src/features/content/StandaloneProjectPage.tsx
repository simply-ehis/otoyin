import { FolderOpenIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_IMPORT_FAILED,
	ERR_DESC_PROJECT_FAILED,
	ERR_TITLE_IMPORT,
	ERR_TITLE_PROJECT,
} from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/ui/card";
import { Input, Textarea } from "@/ui/input";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

const TEMPLATES = [
	{ id: "blank", name: "Blank", description: "Start from scratch" },
	{
		id: "dialogue",
		name: "Dialogue",
		description: "Two-character dialogue scene",
	},
	{
		id: "podcast",
		name: "Podcast",
		description: "Single-host podcast structure",
	},
	{
		id: "audiobook",
		name: "Audiobook",
		description: "Narrator with character voices",
	},
	{
		id: "short-film",
		name: "Short Film",
		description: "Multi-scene film structure",
	},
];

const FPS_OPTIONS = ["23.976", "24", "25", "29.97", "30"];
const SAMPLE_RATES = ["44100", "48000", "96000"];
const SCRIPT_FORMATS = [
	{ value: "plain", label: "Plain Text" },
	{ value: "fountain", label: "Fountain" },
	{ value: "markdown", label: "Markdown" },
];

interface ProjectScene {
	name?: string;
	description?: string;
}

interface Project {
	id: string;
	name: string;
	description: string;
	fps: number;
	sample_rate: number;
	scenes: ProjectScene[];
}

export function StandaloneProjectPage() {
	const { toast } = useToast();
	const [project, setProject] = useState<Project | null>(null);
	const [creating, setCreating] = useState(false);
	const [projectName, setProjectName] = useState("Untitled Project");
	const [description, setDescription] = useState("");
	const [fps, setFps] = useState("24");
	const [sampleRate, setSampleRate] = useState("48000");
	const [selectedTemplate, setSelectedTemplate] = useState("blank");
	const [importText, setImportText] = useState("");
	const [importFormat, setImportFormat] = useState<
		"plain" | "fountain" | "markdown"
	>("plain");
	const [importing, setImporting] = useState(false);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [unsaved, setUnsaved] = useState(false);
	const autosaveRef = useRef<number | null>(null);
	const importFileRef = useRef<HTMLInputElement | null>(null);
	const importScriptFileRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (unsaved) {
				e.preventDefault();
				e.returnValue = "";
			}
		}
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [unsaved]);

	useEffect(() => {
		if (projectId === null || project === null) {
			return;
		}
		setUnsaved(true);
		if (autosaveRef.current) {
			window.clearTimeout(autosaveRef.current);
		}
		autosaveRef.current = window.setTimeout(async () => {
			try {
				await apiClient.saveProject(projectId, JSON.stringify(project));
			} catch {
				/* autosave is best-effort */
			}
		}, 1500);
		return () => {
			if (autosaveRef.current) {
				window.clearTimeout(autosaveRef.current);
			}
		};
	}, [project, projectId]);

	async function saveProject() {
		if (projectId === null || project === null) {
			return;
		}
		try {
			await apiClient.saveProject(projectId, JSON.stringify(project));
			setUnsaved(false);
			toast({ title: "Project saved", description: project.name });
		} catch {
			toast({
				title: ERR_TITLE_PROJECT,
				description: ERR_DESC_PROJECT_FAILED,
				variant: "destructive",
			});
		}
	}

	async function handleExport() {
		if (!projectId) {
			return;
		}
		try {
			const blob = await apiClient.exportProject(projectId);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${project?.name || "project"}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			toast({ title: "Project exported" });
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: ERR_DESC_IMPORT_FAILED,
				variant: "destructive",
			});
		}
	}

	async function handleImport(file: File) {
		try {
			const result = await apiClient.importProject(file);
			// Load the full project after import to get scenes, fps, etc.
			const loaded = await apiClient.loadProject(result.id);
			setProject(loaded.project as Project);
			setProjectId(result.id);
			setUnsaved(false);
			toast({
				title: "Project imported",
				description: result.message,
			});
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: ERR_DESC_IMPORT_FAILED,
				variant: "destructive",
			});
		}
	}

	async function handleExportEpub() {
		if (!projectId) {
			return;
		}
		try {
			const blob = await apiClient.exportProjectEpub(projectId);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${project?.name || "project"}.epub`;
			a.click();
			URL.revokeObjectURL(url);
			toast({ title: "EPUB exported" });
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: "Failed to export EPUB",
				variant: "destructive",
			});
		}
	}

	async function handleExportPdf() {
		if (!projectId) {
			return;
		}
		try {
			const blob = await apiClient.exportProjectPdf(projectId);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${project?.name || "project"}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
			toast({ title: "PDF exported" });
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: "Failed to export PDF",
				variant: "destructive",
			});
		}
	}

	async function handleImportScriptFile(file: File) {
		try {
			const result = await apiClient.importScriptFile(
				file,
				undefined,
				importFormat,
			);
			setProject(result.project as Project);
			setProjectId(result.project_id);
			setUnsaved(false);
			toast({
				title: "Script file imported",
				description: `${result.scene_count} scenes`,
			});
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: ERR_DESC_IMPORT_FAILED,
				variant: "destructive",
			});
		}
	}

	async function createProject() {
		setCreating(true);
		try {
			const result = await apiClient.createProject(
				projectName,
				description,
				Number.parseFloat(fps),
				Number.parseInt(sampleRate, 10),
			);
			setProject(result.project as Project);
			setProjectId(result.project_id);
			setUnsaved(false);
			toast({ title: "Project created", description: result.project.name });
		} catch {
			toast({
				title: ERR_TITLE_PROJECT,
				description: ERR_DESC_PROJECT_FAILED,
				variant: "destructive",
			});
		} finally {
			setCreating(false);
		}
	}

	async function importScript() {
		if (!project || !importText.trim()) {
			return;
		}
		setImporting(true);
		try {
			const result = await apiClient.importScript(
				JSON.stringify(project),
				importText,
				importFormat,
			);
			setProject(result.project as Project);
			toast({
				title: "Script imported",
				description: `${result.scene_count} scenes`,
			});
			setImportText("");
		} catch {
			toast({
				title: ERR_TITLE_IMPORT,
				description: ERR_DESC_IMPORT_FAILED,
				variant: "destructive",
			});
		} finally {
			setImporting(false);
		}
	}

	function loadTemplate(templateId: string) {
		const template = TEMPLATES.find((t) => t.id === templateId);
		if (!template) {
			return;
		}
		setSelectedTemplate(templateId);
		setProjectName(template.name);
		toast({ title: "Template loaded", description: template.name });
	}

	if (project) {
		return (
			<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h1 className="truncate text-xl font-semibold text-foreground">
						{project.name}
					</h1>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							title="Save project"
							aria-label={
								unsaved ? "Save project, unsaved changes" : "Save project"
							}
							onClick={() => void saveProject()}
						>
							Save
							{unsaved && (
								<span
									aria-hidden="true"
									title="Unsaved changes"
									className="ml-1 inline-block size-1.5 rounded-full bg-warning"
								/>
							)}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!projectId}
							title="Export project as ZIP archive"
							aria-label="Export project"
							onClick={() => void handleExport()}
						>
							Export ZIP
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!projectId}
							title="Export project as EPUB"
							aria-label="Export EPUB"
							onClick={() => void handleExportEpub()}
						>
							EPUB
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!projectId}
							title="Export project as PDF"
							aria-label="Export PDF"
							onClick={() => void handleExportPdf()}
						>
							PDF
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							title="Import project from ZIP archive"
							aria-label="Import project"
							onClick={() => importFileRef.current?.click()}
						>
							Import ZIP
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							title="Import script file (.txt, .md)"
							aria-label="Import script file"
							onClick={() => importScriptFileRef.current?.click()}
						>
							Import File
						</Button>
						<input
							ref={importFileRef}
							type="file"
							accept=".zip"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) {
									void handleImport(file);
								}
								e.target.value = "";
							}}
						/>
						<input
							ref={importScriptFileRef}
							type="file"
							accept=".txt,.md,.markdown,.fountain"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) {
									void handleImportScriptFile(file);
								}
								e.target.value = "";
							}}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							title="Start a new project"
							aria-label="Start a new project"
							onClick={() => {
								setProject(null);
								setProjectId(null);
								setUnsaved(false);
							}}
						>
							<FolderOpenIcon className="mr-1.5 size-4" aria-hidden="true" />
							New Project
						</Button>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Project settings</CardTitle>
					</CardHeader>
					<CardBody className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-1">
								<Label htmlFor="proj-name">Name</Label>
								<Input
									id="proj-name"
									value={project.name}
									onChange={(e) =>
										setProject({ ...project, name: e.target.value })
									}
									className="h-8 text-xs"
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="proj-fps">Frame rate</Label>
								<Select
									value={String(project.fps)}
									onValueChange={(v) =>
										setProject({ ...project, fps: Number.parseFloat(v) })
									}
								>
									<SelectTrigger id="proj-fps" className="h-8 text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FPS_OPTIONS.map((f) => (
											<SelectItem key={f} value={f}>
												{f} fps
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="space-y-1">
							<Label htmlFor="proj-desc">Description</Label>
							<Input
								id="proj-desc"
								value={project.description}
								onChange={(e) =>
									setProject({ ...project, description: e.target.value })
								}
								className="h-8 text-xs"
							/>
						</div>
					</CardBody>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Import script</CardTitle>
					</CardHeader>
					<CardBody className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="proj-script">Paste script text</Label>
							<Textarea
								id="proj-script"
								className="min-h-32 text-sm"
								value={importText}
								onChange={(e) => setImportText(e.target.value)}
								placeholder="Paste dialogue or screenplay text here"
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Select
								value={importFormat}
								onValueChange={(v) =>
									setImportFormat(v as "plain" | "fountain" | "markdown")
								}
							>
								<SelectTrigger
									className="h-8 w-36 text-xs"
									aria-label="Script format"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SCRIPT_FORMATS.map((fmt) => (
										<SelectItem key={fmt.value} value={fmt.value}>
											{fmt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								type="button"
								size="sm"
								disabled={importing || !importText.trim()}
								onClick={() => void importScript()}
							>
								{importing ? "Importing…" : "Import"}
							</Button>
						</div>
					</CardBody>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Scenes ({project.scenes.length})</CardTitle>
					</CardHeader>
					<CardBody>
						{project.scenes.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No scenes yet. Import a script above.
							</p>
						) : (
							<ul className="space-y-2">
								{project.scenes.map((scene, i) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: server scenes carry no stable id
										key={`scene-${i}`}
										className="rounded-md border border-border p-3"
									>
										<p className="text-sm font-medium text-foreground">
											{scene.name || `Scene ${i + 1}`}
										</p>
										{scene.description ? (
											<p className="text-sm text-muted-foreground">
												{scene.description}
											</p>
										) : null}
									</li>
								))}
							</ul>
						)}
					</CardBody>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Create New Project"
				description="Standalone productions with scenes and scripts"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Project details</CardTitle>
				</CardHeader>
				<CardBody className="space-y-4">
					<div className="space-y-1">
						<Label htmlFor="new-proj-name">Project name</Label>
						<Input
							id="new-proj-name"
							value={projectName}
							onChange={(e) => setProjectName(e.target.value)}
							className="h-8 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="new-proj-desc">Description (optional)</Label>
						<Input
							id="new-proj-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="h-8 text-xs"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<Label htmlFor="new-proj-fps">Frame rate</Label>
							<Select value={fps} onValueChange={setFps}>
								<SelectTrigger id="new-proj-fps" className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{FPS_OPTIONS.map((f) => (
										<SelectItem key={f} value={f}>
											{f} fps
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="new-proj-rate">Sample rate</Label>
							<Select value={sampleRate} onValueChange={setSampleRate}>
								<SelectTrigger id="new-proj-rate" className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SAMPLE_RATES.map((r) => (
										<SelectItem key={r} value={r}>
											{r} Hz
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardBody>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Choose template</CardTitle>
				</CardHeader>
				<CardBody>
					<fieldset
						className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0 md:grid-cols-3"
						aria-label="Project templates"
					>
						{TEMPLATES.map((template) => (
							<button
								key={template.id}
								type="button"
								aria-pressed={selectedTemplate === template.id}
								onClick={() => loadTemplate(template.id)}
								className={cn(
									"rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									selectedTemplate === template.id
										? "border-primary"
										: "border-border hover:border-strong",
								)}
							>
								<span className="block text-sm font-medium text-foreground">
									{template.name}
								</span>
								<span className="block text-sm text-muted-foreground">
									{template.description}
								</span>
							</button>
						))}
					</fieldset>
				</CardBody>
			</Card>

			<div>
				<Button
					type="button"
					disabled={creating}
					onClick={() => void createProject()}
				>
					{creating ? "Creating…" : "Create Project"}
				</Button>
			</div>
		</div>
	);
}
