import { useTranslation } from "react-i18next";
import { Textarea } from "@/ui/input";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import type { SongwritingDraft, SongwritingLanguagePack } from "./packs/types";

export type UpdateDraft = <K extends keyof SongwritingDraft>(
	key: K,
	value: SongwritingDraft[K],
) => void;

function BriefField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<Label className="block space-y-1 text-xs">
			<span className="font-medium text-muted-foreground">{label}</span>
			{children}
		</Label>
	);
}

/** Song DNA brief: promise, hook, genre/mood/audience, POV/tense/pack, blueprints. */
export function SongwriterBrief({
	draft,
	update,
	pack,
	packs,
	onApplyTemplate,
}: {
	draft: SongwritingDraft;
	update: UpdateDraft;
	pack: SongwritingLanguagePack | undefined;
	packs: SongwritingLanguagePack[];
	onApplyTemplate: (templateId: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="grid max-w-4xl gap-3">
			<div className="grid gap-3 sm:grid-cols-2">
				<BriefField
					label={t("songwriter.title", {
						defaultValue: "Title / working title",
					})}
				>
					<input
						className="h-8 w-full rounded-sm border border-border bg-card px-2 text-sm"
						value={draft.title}
						maxLength={200}
						placeholder={t("songwriter.titleHint", {
							defaultValue: "The phrase listeners remember",
						})}
						onChange={(e) => update("title", e.target.value)}
					/>
				</BriefField>
				<BriefField
					label={t("songwriter.hook", { defaultValue: "Central hook" })}
				>
					<input
						className="h-8 w-full rounded-sm border border-border bg-card px-2 text-sm"
						value={draft.hook}
						maxLength={500}
						placeholder={t("songwriter.hookHint", {
							defaultValue: "A short repeatable payoff",
						})}
						onChange={(e) => update("hook", e.target.value)}
					/>
				</BriefField>
			</div>
			<BriefField
				label={t("songwriter.promise", {
					defaultValue: "The song's one promise",
				})}
			>
				<Textarea
					value={draft.idea}
					maxLength={4000}
					rows={3}
					onChange={(e) => update("idea", e.target.value)}
				/>
			</BriefField>
			<div className="grid gap-3 sm:grid-cols-3">
				<BriefField label={t("songwriter.genre", { defaultValue: "Genre" })}>
					<input
						className="h-8 w-full rounded-sm border border-border bg-card px-2 text-sm"
						value={draft.genre}
						maxLength={300}
						onChange={(e) => update("genre", e.target.value)}
					/>
				</BriefField>
				<BriefField
					label={t("songwriter.mood", { defaultValue: "Emotional color" })}
				>
					<input
						className="h-8 w-full rounded-sm border border-border bg-card px-2 text-sm"
						value={draft.mood}
						maxLength={300}
						onChange={(e) => update("mood", e.target.value)}
					/>
				</BriefField>
				<BriefField
					label={t("songwriter.audience", { defaultValue: "Who is it for?" })}
				>
					<input
						className="h-8 w-full rounded-sm border border-border bg-card px-2 text-sm"
						value={draft.audience}
						maxLength={1000}
						onChange={(e) => update("audience", e.target.value)}
					/>
				</BriefField>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<BriefField
					label={t("songwriter.pointOfView", {
						defaultValue: "Point of view",
					})}
				>
					<Select
						value={draft.pointOfView}
						onValueChange={(v) =>
							update("pointOfView", v as SongwritingDraft["pointOfView"])
						}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(
								[
									"first-person",
									"second-person",
									"collective",
									"third-person",
								] as const
							).map((v) => (
								<SelectItem key={v} value={v}>
									{v}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</BriefField>
				<BriefField label={t("songwriter.tense", { defaultValue: "Tense" })}>
					<Select
						value={draft.tense}
						onValueChange={(v) =>
							update("tense", v as SongwritingDraft["tense"])
						}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["present", "past", "future", "mixed"] as const).map((v) => (
								<SelectItem key={v} value={v}>
									{v}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</BriefField>
				<BriefField
					label={t("songwriter.languagePack", {
						defaultValue: "Language pack",
					})}
				>
					<Select
						value={draft.language}
						onValueChange={(v) => update("language", v)}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{packs.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</BriefField>
			</div>
			<BriefField
				label={t("songwriter.imagery", { defaultValue: "Image bank" })}
			>
				<Textarea
					value={draft.imagery}
					maxLength={3000}
					rows={2}
					onChange={(e) => update("imagery", e.target.value)}
				/>
			</BriefField>
			<BriefField
				label={t("songwriter.production", {
					defaultValue: "Production direction",
				})}
			>
				<Textarea
					value={draft.stylePrompt}
					maxLength={2000}
					rows={2}
					onChange={(e) => update("stylePrompt", e.target.value)}
				/>
			</BriefField>
			<section
				aria-label={t("songwriter.blueprints", {
					defaultValue: "Structure blueprints",
				})}
				className="space-y-2 rounded-md border border-border bg-card p-3"
			>
				<h2 className="text-xs font-medium text-muted-foreground">
					{t("songwriter.blueprints", {
						defaultValue: "Structure blueprints",
					})}
				</h2>
				<div className="grid gap-2 sm:grid-cols-2">
					{(pack?.templates ?? []).map((template) => (
						<button
							key={template.id}
							type="button"
							onClick={() => onApplyTemplate(template.id)}
							className="rounded-sm border border-border p-2 text-left transition-colors hover:border-strong"
						>
							<p className="text-sm font-medium">{template.name}</p>
							<p className="text-xs text-muted-foreground">
								{template.description}
							</p>
						</button>
					))}
				</div>
			</section>
		</div>
	);
}
