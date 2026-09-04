import {
	SparklesIcon as Sparkles,
	UserGroupIcon as Users,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PresetVoice } from "@/lib/api/types";

interface VoiceSelectorProps {
	voices: PresetVoice[];
	selectedVoice?: string;
	onSelectVoice?: (voiceId: string) => void;
	languageFilter?: string;
}

export function VoiceSelector({
	voices,
	selectedVoice,
	onSelectVoice,
	languageFilter,
}: VoiceSelectorProps) {
	const [filter, setFilter] = useState<"all" | "female" | "male">("all");

	const filteredVoices = voices.filter((v) => {
		if (filter === "female" && v.gender !== "female") {
			return false;
		}
		if (filter === "male" && v.gender !== "male") {
			return false;
		}
		if (languageFilter && v.language !== languageFilter) {
			return false;
		}
		return true;
	});

	const groupedByLang = filteredVoices.reduce(
		(acc, voice) => {
			const lang = voice.language || "unknown";
			if (!acc[lang]) {
				acc[lang] = [];
			}
			acc[lang].push(voice);
			return acc;
		},
		{} as Record<string, PresetVoice[]>,
	);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Users className="h-3.5 w-3.5 text-muted-foreground" />
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						{voices.length} Voices
					</span>
				</div>
				<div className="flex gap-1">
					{(["all", "female", "male"] as const).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFilter(f)}
							aria-pressed={filter === f}
							className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${
								filter === f
									? "bg-accent/20 text-accent"
									: "text-muted-foreground hover:bg-muted/50"
							}`}
						>
							{f}
						</button>
					))}
				</div>
			</div>
			<div className="max-h-48 overflow-y-auto space-y-2">
				{Object.entries(groupedByLang).map(([lang, langVoices]) => (
					<div key={lang}>
						<div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
							{lang}
						</div>
						<div className="flex flex-wrap gap-1">
							{langVoices.map((voice) => (
								<button
									key={voice.id}
									type="button"
									onClick={() => onSelectVoice?.(voice.id)}
									aria-pressed={selectedVoice === voice.id}
									aria-label={`${voice.name} (${voice.gender || "unknown"})`}
									className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
										selectedVoice === voice.id
											? "bg-accent/20 text-accent border border-accent/30"
											: "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
									}`}
									title={`${voice.name} (${voice.gender || "unknown"})`}
								>
									{voice.name}
								</button>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

interface VoiceMixerProps {
	voices: PresetVoice[];
	selectedVoices: string[];
	onToggleVoice: (voiceId: string) => void;
	maxVoices?: number;
}

export function VoiceMixer({
	voices,
	selectedVoices,
	onToggleVoice,
	maxVoices = 3,
}: VoiceMixerProps) {
	const { t } = useTranslation();
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Sparkles className="h-3.5 w-3.5 text-amber-500" />{" "}
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					{t("models.detail.voiceMixer")}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("models.detail.selectToBlend", { count: maxVoices })}
				</span>
			</div>
			<div className="flex flex-wrap gap-1">
				{voices.map((voice) => {
					const isSelected = selectedVoices.includes(voice.id);
					const isDisabled = !isSelected && selectedVoices.length >= maxVoices;
					return (
						<button
							key={voice.id}
							type="button"
							onClick={() => !isDisabled && onToggleVoice(voice.id)}
							disabled={isDisabled}
							aria-pressed={isSelected}
							aria-label={voice.name}
							className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
								isSelected
									? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
									: isDisabled
										? "bg-muted/20 text-muted-foreground/50 cursor-not-allowed border border-transparent"
										: "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
							}`}
						>
							{voice.name}
						</button>
					);
				})}
			</div>
			{selectedVoices.length > 0 && (
				<div className="text-xs text-muted-foreground">
					{t("models.detail.blending")}{" "}
					{selectedVoices
						.map((id) => voices.find((v) => v.id === id)?.name)
						.filter(Boolean)
						.join(" + ")}
				</div>
			)}
		</div>
	);
}

const NEUTTS_2E_EMOTIONS = [
	"angry",
	"disgusted",
	"fearful",
	"happy",
	"neutral",
	"sad",
	"surprised",
] as const;

interface EmotionSelectorProps {
	selectedEmotion?: string;
	onSelectEmotion?: (emotion: string) => void;
}

export function EmotionSelector({
	selectedEmotion,
	onSelectEmotion,
}: EmotionSelectorProps) {
	const { t } = useTranslation();
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				{" "}
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					{t("models.detail.emotion")}
				</span>
			</div>
			<div className="flex flex-wrap gap-1">
				{NEUTTS_2E_EMOTIONS.map((emotion) => (
					<button
						key={emotion}
						type="button"
						onClick={() => onSelectEmotion?.(emotion)}
						aria-pressed={selectedEmotion === emotion}
						className={`text-xs px-1.5 py-0.5 rounded-md capitalize transition-colors ${
							selectedEmotion === emotion
								? "bg-accent/20 text-accent border border-accent/30"
								: "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
						}`}
					>
						{emotion}
					</button>
				))}
			</div>
		</div>
	);
}

export function TagPreview({ tags }: { tags: readonly string[] }) {
	const { t } = useTranslation();
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Sparkles className="h-3.5 w-3.5 text-violet-500" />{" "}
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					{t("models.detail.inlineEmotionTags")}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">
				{t("models.detail.insertTagsHint")}
			</p>
			<div className="flex flex-wrap gap-1">
				{tags.map((tag) => (
					<span
						key={tag}
						className="text-xs px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 border border-violet-500/20 font-mono"
					>
						{tag}
					</span>
				))}
			</div>
		</div>
	);
}
