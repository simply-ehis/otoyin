import { LanguageIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { SongwritingAnalysis } from "./packs/types";

function scoreTone(score: number): string {
	if (score >= 75) {
		return "text-accent";
	}
	if (score >= 50) {
		return "text-foreground";
	}
	return "text-destructive";
}

/** Live craft-coaching panel: score, per-axis meters, next revision, prosody. */
export function SongwriterCoach({
	analysis,
	packDescription,
}: {
	analysis: SongwritingAnalysis;
	packDescription: string | undefined;
}) {
	const { t } = useTranslation();
	return (
		<aside
			aria-label={t("songwriter.coach", { defaultValue: "Craft coach" })}
			className="h-fit space-y-3 rounded-md border border-border bg-card p-3"
		>
			<p className="flex items-center gap-2">
				<PencilSquareIcon
					className="size-4 text-muted-foreground"
					aria-hidden="true"
				/>
				<span className="text-2xl font-bold tabular-nums">
					{analysis.scores.overall}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("songwriter.craftSignal", {
						defaultValue: "craft signal — guidance, not a verdict",
					})}
				</span>
			</p>
			<ul className="space-y-1.5">
				{Object.entries(analysis.scores)
					.filter(([name]) => name !== "overall")
					.map(([name, score]) => (
						<li key={name} className="flex items-center gap-2 text-xs">
							<span className="w-24 shrink-0 uppercase text-muted-foreground">
								{name}
							</span>
							<progress className="h-1.5 flex-1" max={100} value={score} />
							<strong
								className={`w-8 text-right tabular-nums ${scoreTone(score)}`}
							>
								{score}
							</strong>
						</li>
					))}
			</ul>
			<div className="space-y-1.5">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{t("songwriter.nextRevision", { defaultValue: "Next revision" })}
				</h3>
				{analysis.suggestions.slice(0, 4).map((suggestion) => (
					<p key={suggestion} className="text-xs text-foreground">
						{suggestion}
					</p>
				))}
				{analysis.strengths.slice(0, 2).map((strength) => (
					<p key={strength} className="text-xs text-muted-foreground">
						✓ {strength}
					</p>
				))}
			</div>
			{analysis.sections.length > 0 ? (
				<div className="space-y-1.5">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{t("songwriter.prosody", { defaultValue: "Section prosody" })}
					</h3>
					{analysis.sections.map((section, index) => (
						<p
							key={`${section.label}-${index}`}
							className="text-xs text-muted-foreground"
						>
							<strong className="text-foreground">{section.label}</strong>{" "}
							<span className="tabular-nums">
								{section.linesAnalysis
									.map((line) => line.syllables)
									.join(" · ") || "empty"}
							</span>{" "}
							{section.rhymeScheme || "—"}
						</p>
					))}
				</div>
			) : null}
			<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<LanguageIcon className="size-3.5" aria-hidden="true" />
				{packDescription}
			</p>
		</aside>
	);
}
