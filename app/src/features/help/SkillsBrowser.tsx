import { useCallback, useEffect, useState } from "react";
import {
	type CustomSkillData,
	createCustomSkill,
	deleteCustomSkill,
	listCustomSkills,
	updateCustomSkill,
} from "@/lib/api/clientSkills";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/input";
import {
	EmptyState,
	ErrorState,
	LoadingState,
	ScreenHeader,
} from "@/ui/states";
import { useToast } from "@/ui/use-toast";

/**
 * Skills browser: list, create, enable/disable, and delete custom skills
 * on GET|POST /skills + /skills/{id} (no new backend needed). A skill is
 * a reusable recipe — triggers, steps, and the tools it may call.
 */
export function SkillsBrowser() {
	const { toast } = useToast();
	const [skills, setSkills] = useState<CustomSkillData[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({ skill_id: "", name: "", description: "" });
	const [busyId, setBusyId] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await listCustomSkills();
			setSkills(res.skills);
			setError(null);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Could not load skills");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const create = async () => {
		if (!form.skill_id.trim() || !form.name.trim()) {
			toast({
				title: "Skill ID and name are required",
				variant: "destructive",
			});
			return;
		}
		setCreating(true);
		try {
			const created = await createCustomSkill({
				skill_id: form.skill_id.trim(),
				name: form.name.trim(),
				description: form.description.trim() || undefined,
			});
			setForm({ skill_id: "", name: "", description: "" });
			toast({ title: `Skill "${created.name}" created` });
			await load();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setCreating(false);
		}
	};

	const remove = async (skill: CustomSkillData) => {
		setBusyId(skill.id);
		try {
			await deleteCustomSkill(skill.skill_id);
			toast({ title: `Skill "${skill.name}" deleted` });
			await load();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setBusyId(null);
		}
	};

	const toggleEnabled = async (skill: CustomSkillData) => {
		setBusyId(skill.id);
		try {
			await updateCustomSkill(skill.skill_id, { enabled: !skill.enabled });
			await load();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<ScreenHeader
				title="Skills"
				description="Reusable recipes: triggers, steps, and the tools each may call."
			/>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<Field label="Skill ID" htmlFor="skill-id">
					<Input
						id="skill-id"
						value={form.skill_id}
						onChange={(e) =>
							setForm((f) => ({ ...f, skill_id: e.target.value }))
						}
						placeholder="podcast-intro"
					/>
				</Field>
				<Field label="Name" htmlFor="skill-name">
					<Input
						id="skill-name"
						value={form.name}
						onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
						placeholder="Podcast intro"
					/>
				</Field>
				<div className="flex items-end">
					<Button
						disabled={creating}
						loading={creating}
						onClick={() => void create()}
					>
						{creating ? "Creating…" : "New skill"}
					</Button>
				</div>
			</div>
			<Field label="Description (optional)" htmlFor="skill-description">
				<Textarea
					id="skill-description"
					value={form.description}
					onChange={(e) =>
						setForm((f) => ({ ...f, description: e.target.value }))
					}
					rows={2}
					placeholder="What this skill does and when to use it"
				/>
			</Field>
			{skills === null ? (
				<LoadingState label="Loading skills" lines={3} />
			) : error ? (
				<ErrorState
					title="Could not load skills"
					body={error}
					onRetry={() => void load()}
				/>
			) : skills.length === 0 ? (
				<EmptyState
					title="No custom skills yet"
					body="Create one above — give it triggers and steps, and agents can run it."
				/>
			) : (
				<ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
					{skills.map((skill) => (
						<li
							key={skill.id}
							className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
						>
							<div className="min-w-0 flex-1">
								<p className="flex items-center gap-2 text-sm font-medium text-foreground">
									{skill.name}
									<span
										className={
											skill.enabled
												? "rounded-full bg-success-soft px-2 py-px text-[11px] text-success-text"
												: "rounded-full bg-secondary px-2 py-px text-[11px] text-muted-foreground"
										}
									>
										{skill.enabled ? "On" : "Off"}
									</span>
								</p>
								{skill.description ? (
									<p className="mt-0.5 truncate text-[13px] text-muted-foreground">
										{skill.description}
									</p>
								) : null}
								{skill.triggers.length > 0 ? (
									<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
										{skill.triggers.join(" · ")}
									</p>
								) : null}
							</div>
							<Button
								size="sm"
								variant="outline"
								disabled={busyId === skill.id}
								onClick={() => void toggleEnabled(skill)}
							>
								{skill.enabled ? "Disable" : "Enable"}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="text-destructive"
								disabled={busyId === skill.id}
								onClick={() => void remove(skill)}
							>
								Delete
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
