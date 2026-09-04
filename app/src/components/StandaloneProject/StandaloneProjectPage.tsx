import {
	DocumentTextIcon as FileText,
	FolderOpenIcon as FolderOpen,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_IMPORT_FAILED,
	ERR_DESC_PROJECT_FAILED,
	ERR_TITLE_IMPORT,
	ERR_TITLE_PROJECT,
} from "@/lib/errorMessages";

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

interface Project {
	id: string;
	name: string;
	description: string;
	fps: number;
	sample_rate: number;
	scenes: { name?: string; description?: string }[];
}

export function StandaloneProjectPage() {
	const [project, setProject] = useState<Project | null>(null);
	const [creating, setCreating] = useState(false);
	const [projectName, setProjectName] = useState("Untitled Project");
	const [description, setDescription] = useState("");
	const [fps, setFps] = useState(24);
	const [sampleRate, setSampleRate] = useState(48000);
	const [selectedTemplate, setSelectedTemplate] = useState("blank");
	const [importText, setImportText] = useState("");
	const [importFormat, setImportFormat] = useState<"plain" | "fountain">(
		"plain",
	);
	const [importing, setImporting] = useState(false);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [unsaved, setUnsaved] = useState(false);
	const autosaveRef = useRef<number | null>(null);
	const { toast } = useToast();

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

	const saveProject = async () => {
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
	};

	const createProject = async () => {
		setCreating(true);
		try {
			const result = await apiClient.createProject(
				projectName,
				description,
				fps,
				sampleRate,
			);
			setProject(result.project);
			setProjectId(result.project_id);
			setUnsaved(false);
			toast({ title: "Project created", description: result.project.name });
		} catch (_error) {
			toast({
				title: ERR_TITLE_PROJECT,
				description: ERR_DESC_PROJECT_FAILED,
				variant: "destructive",
			});
		} finally {
			setCreating(false);
		}
	};

	const importScript = async () => {
		if (!project || !importText.trim()) {
			return;
		}
		setImporting(true);
		try {
			const result = await apiClient.importScript(
				project.id,
				importText,
				importFormat,
			);
			setProject(result.project);
			toast({
				title: "Script imported",
				description: `${result.scene_count} scenes`,
			});
			setImportText("");
		} catch (_error) {
			toast({
				title: ERR_TITLE_IMPORT,
				description: ERR_DESC_IMPORT_FAILED,
				variant: "destructive",
			});
		} finally {
			setImporting(false);
		}
	};

	const loadTemplate = async (templateId: string) => {
		try {
			const template = TEMPLATES.find((t) => t.id === templateId);
			if (template) {
				setSelectedTemplate(templateId);
				setProjectName(template.name);
				toast({ title: "Template loaded", description: template.name });
			}
		} catch (_error) {
			toast({
				title: ERR_TITLE_PROJECT,
				description: ERR_DESC_PROJECT_FAILED,
				variant: "destructive",
			});
		}
	};

	if (project) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-bold">{project.name}</h1>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							onClick={saveProject}
							title="Save project"
							aria-label="Save project"
						>
							Save
							{unsaved && (
								<span
									role="img"
									className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
									title="Unsaved changes — Save to persist this project"
									aria-label="Unsaved changes"
								/>
							)}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setProject(null);
								setProjectId(null);
								setUnsaved(false);
							}}
						>
							<FolderOpen className="size-4 mr-2" /> New Project
						</Button>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Project Settings</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label>Name</Label>
								<Input
									value={project.name}
									onChange={(e) =>
										setProject({ ...project, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>Frame Rate</Label>
								<Select
									value={String(project.fps)}
									onValueChange={(v) =>
										setProject({ ...project, fps: parseFloat(v) })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="23.976">23.976 fps</SelectItem>
										<SelectItem value="24">24 fps</SelectItem>
										<SelectItem value="25">25 fps</SelectItem>
										<SelectItem value="29.97">29.97 fps</SelectItem>
										<SelectItem value="30">30 fps</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="space-y-2">
							<Label>Description</Label>
							<Input
								value={project.description}
								onChange={(e) =>
									setProject({ ...project, description: e.target.value })
								}
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="size-5" /> Import Script
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Paste script text</Label>
							<textarea
								className="w-full h-32 p-2 border rounded-md bg-background text-foreground"
								value={importText}
								onChange={(e) => setImportText(e.target.value)}
								placeholder="Paste dialogue or screenplay text here"
							/>
						</div>
						<div className="flex gap-2">
							<Select
								value={importFormat}
								onValueChange={(v) =>
									setImportFormat(v as "plain" | "fountain")
								}
							>
								<SelectTrigger className="w-[150px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="plain">Plain Text</SelectItem>
									<SelectItem value="fountain">Fountain</SelectItem>
								</SelectContent>
							</Select>
							<Button
								onClick={importScript}
								disabled={importing || !importText.trim()}
							>
								<Upload className="size-4 mr-2" />
								{importing ? "Importing..." : "Import"}
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Scenes ({project.scenes.length})</CardTitle>
					</CardHeader>
					<CardContent>
						{project.scenes.length === 0 ? (
							<p className="text-muted-foreground">
								No scenes yet. Import a script or create scenes manually.
							</p>
						) : (
							<div className="space-y-2">
								{project.scenes.map((scene, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: scenes have no stable id
									<div key={i} className="p-3 border rounded-md">
										<p className="font-medium">
											{scene.name || `Scene ${i + 1}`}
										</p>
										{scene.description && (
											<p className="text-sm text-muted-foreground">
												{scene.description}
											</p>
										)}
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto p-6 space-y-6">
			<h1 className="text-2xl font-bold">Create New Project</h1>

			<Card>
				<CardHeader>
					<CardTitle>Project Details</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Project Name</Label>
						<Input
							value={projectName}
							onChange={(e) => setProjectName(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Description (optional)</Label>
						<Input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Frame Rate</Label>
							<Select
								value={String(fps)}
								onValueChange={(v) => setFps(parseFloat(v))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="23.976">23.976 fps</SelectItem>
									<SelectItem value="24">24 fps</SelectItem>
									<SelectItem value="25">25 fps</SelectItem>
									<SelectItem value="29.97">29.97 fps</SelectItem>
									<SelectItem value="30">30 fps</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Sample Rate</Label>
							<Select
								value={String(sampleRate)}
								onValueChange={(v) => setSampleRate(parseInt(v, 10))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="44100">44100 Hz</SelectItem>
									<SelectItem value="48000">48000 Hz</SelectItem>
									<SelectItem value="96000">96000 Hz</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Choose Template</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
						{TEMPLATES.map((template) => (
							<button
								key={template.id}
								type="button"
								onClick={() => loadTemplate(template.id)}
								className={`p-4 border rounded-md text-left transition-colors ${
									selectedTemplate === template.id
										? "border-primary bg-primary/5"
										: "hover:border-primary/50"
								}`}
							>
								<p className="font-medium">{template.name}</p>
								<p className="text-sm text-muted-foreground">
									{template.description}
								</p>
							</button>
						))}
					</div>
				</CardContent>
			</Card>

			<Button onClick={createProject} disabled={creating} size="lg">
				{creating ? "Creating..." : "Create Project"}
			</Button>
		</div>
	);
}
