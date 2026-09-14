import {
	ChevronDownIcon,
	ChevronRightIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
	type CustomSkillData,
	createCustomSkill,
	deleteCustomSkill,
	listCustomSkills,
	updateCustomSkill,
} from "@/lib/api/clientSkills";

type View = "list" | "create" | "edit";

export function SkillBuilder() {
	const [view, setView] = useState<View>("list");
	const [skills, setSkills] = useState<CustomSkillData[]>([]);
	const [loading, setLoading] = useState(true);
	const [editingSkill, setEditingSkill] = useState<CustomSkillData | null>(
		null,
	);
	const { toast } = useToast();

	const loadSkills = useCallback(async () => {
		setLoading(true);
		try {
			const data = await listCustomSkills();
			setSkills(data.skills);
		} catch (_err) {
			toast({ title: "Failed to load skills", variant: "destructive" });
		} finally {
			setLoading(false);
		}
	}, [toast]);

	useEffect(() => {
		loadSkills();
	}, [loadSkills]);

	if (view === "create" || view === "edit") {
		return (
			<SkillForm
				existing={view === "edit" ? editingSkill : null}
				onSaved={() => {
					setView("list");
					setEditingSkill(null);
					loadSkills();
				}}
				onCancel={() => {
					setView("list");
					setEditingSkill(null);
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-3 py-2 border-b">
				<span className="text-sm font-medium">Custom Skills</span>
				<Button size="sm" variant="outline" onClick={() => setView("create")}>
					<PlusIcon className="size-3.5 mr-1" />
					New
				</Button>
			</div>
			<div className="flex-1 overflow-auto p-2 space-y-1">
				{loading && (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				)}
				{!loading && skills.length === 0 && (
					<p className="text-xs text-muted-foreground text-center py-8">
						No custom skills yet. Create one to define a reusable workflow for
						the assistant.
					</p>
				)}
				{skills.map((skill) => (
					<SkillRow
						key={skill.skill_id}
						skill={skill}
						onEdit={() => {
							setEditingSkill(skill);
							setView("edit");
						}}
						onDelete={async () => {
							try {
								await deleteCustomSkill(skill.skill_id);
								loadSkills();
							} catch {
								toast({ title: "Delete failed", variant: "destructive" });
							}
						}}
					/>
				))}
			</div>
		</div>
	);
}

function SkillRow({
	skill,
	onEdit,
	onDelete,
}: {
	skill: CustomSkillData;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="border rounded-md text-xs">
			<button
				type="button"
				className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 w-full text-left"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? (
					<ChevronDownIcon className="size-3 shrink-0" />
				) : (
					<ChevronRightIcon className="size-3 shrink-0" />
				)}
				<span className="font-medium flex-1 truncate">{skill.name}</span>
				<span className="text-muted-foreground truncate max-w-[200px]">
					{skill.description || "No description"}
				</span>
				<Button
					size="sm"
					variant="ghost"
					className="size-6 p-0"
					onClick={(e) => {
						e.stopPropagation();
						onEdit();
					}}
				>
					<PencilIcon className="size-3" />
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="size-6 p-0 text-destructive"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
				>
					<TrashIcon className="size-3" />
				</Button>
			</button>
			{expanded && (
				<div className="px-3 pb-2 space-y-1 border-t">
					{skill.triggers.length > 0 && (
						<div className="pt-1">
							<span className="text-muted-foreground">Triggers: </span>
							{skill.triggers.join(", ")}
						</div>
					)}
					{skill.steps.length > 0 && (
						<div>
							<span className="text-muted-foreground">Steps:</span>
							<ol className="list-decimal list-inside mt-0.5">
								{skill.steps.map((step) => (
									<li key={step.slice(0, 32)}>{step}</li>
								))}
							</ol>
						</div>
					)}
					{skill.pitfalls.length > 0 && (
						<div>
							<span className="text-muted-foreground">Pitfalls: </span>
							{skill.pitfalls.join("; ")}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function SkillForm({
	existing,
	onSaved,
	onCancel,
}: {
	existing: CustomSkillData | null;
	onSaved: () => void;
	onCancel: () => void;
}) {
	const { toast } = useToast();
	const [saving, setSaving] = useState(false);
	const [skillId, setSkillId] = useState(existing?.skill_id ?? "");
	const [name, setName] = useState(existing?.name ?? "");
	const [description, setDescription] = useState(existing?.description ?? "");
	const [triggersText, setTriggersText] = useState(
		(existing?.triggers ?? []).join(", "),
	);
	const [stepsText, setStepsText] = useState(
		(existing?.steps ?? []).join("\n"),
	);
	const [pitfallsText, setPitfallsText] = useState(
		(existing?.pitfalls ?? []).join("\n"),
	);
	// Tools are advanced — simple key=value textarea: "assistant: tool1, tool2\nmcp: tool1, tool2"
	const [toolsText, setToolsText] = useState(() => {
		const tools = existing?.tools ?? {};
		return Object.entries(tools)
			.map(([surface, toolsList]) => `${surface}: ${toolsList.join(", ")}`)
			.join("\n");
	});

	const handleSave = async () => {
		if (!skillId.trim() || !name.trim()) {
			toast({
				title: "skill_id and name are required",
				variant: "destructive",
			});
			return;
		}

		const triggers = triggersText
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		const steps = stepsText
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
		const pitfalls = pitfallsText
			.split("\n")
			.map((p) => p.trim())
			.filter(Boolean);

		// Parse tools
		const tools: Record<string, string[]> = {};
		for (const line of toolsText.split("\n")) {
			const colonIdx = line.indexOf(":");
			if (colonIdx === -1) {
				continue;
			}
			const surface = line.slice(0, colonIdx).trim();
			const toolList = line
				.slice(colonIdx + 1)
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
			if (surface && toolList.length > 0) {
				tools[surface] = toolList;
			}
		}

		setSaving(true);
		try {
			if (existing) {
				await updateCustomSkill(existing.skill_id, {
					name,
					description,
					triggers,
					steps,
					tools,
					pitfalls,
				});
			} else {
				await createCustomSkill({
					skill_id: skillId,
					name,
					description,
					triggers,
					steps,
					tools,
					pitfalls,
				});
			}
			toast({ title: existing ? "Skill updated" : "Skill created" });
			onSaved();
		} catch (err) {
			toast({
				title: "Save failed",
				description: err instanceof Error ? err.message : "Unknown error",
				variant: "destructive",
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-3 py-2 border-b">
				<span className="text-sm font-medium">
					{existing ? "Edit Skill" : "Create Skill"}
				</span>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
			<div className="flex-1 overflow-auto p-3 space-y-3">
				<div className="space-y-1">
					<Label className="text-xs">Skill ID</Label>
					<Input
						value={skillId}
						onChange={(e) => setSkillId(e.target.value)}
						disabled={!!existing}
						placeholder="my-workflow"
						className="h-7 text-xs"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Name</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="My Workflow"
						className="h-7 text-xs"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Description</Label>
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="What does this skill do?"
						className="text-xs min-h-[48px] max-h-[200px] overflow-y-auto resize-none"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Triggers (comma-separated)</Label>
					<Input
						value={triggersText}
						onChange={(e) => setTriggersText(e.target.value)}
						placeholder="keyword1, keyword2, keyword3"
						className="h-7 text-xs"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Steps (one per line)</Label>
					<Textarea
						value={stepsText}
						onChange={(e) => setStepsText(e.target.value)}
						placeholder={"Step 1\nStep 2\nStep 3"}
						className="text-xs min-h-[72px] max-h-[200px] overflow-y-auto resize-none"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">
						Tools (format: surface: tool1, tool2)
					</Label>
					<Textarea
						value={toolsText}
						onChange={(e) => setToolsText(e.target.value)}
						placeholder={"assistant: tool1, tool2\nmcp: tool1, tool2"}
						className="text-xs min-h-[48px] max-h-[200px] overflow-y-auto resize-none font-mono"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Pitfalls (one per line)</Label>
					<Textarea
						value={pitfallsText}
						onChange={(e) => setPitfallsText(e.target.value)}
						placeholder={"Do not overwrite source files"}
						className="text-xs min-h-[48px] max-h-[200px] overflow-y-auto resize-none"
					/>
				</div>
			</div>
			<div className="border-t px-3 py-2">
				<Button size="sm" onClick={handleSave} disabled={saving}>
					{saving ? <Spinner className="size-3 mr-1" /> : null}
					{existing ? "Update" : "Create"}
				</Button>
			</div>
		</div>
	);
}
