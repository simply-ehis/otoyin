import {
	Cog6ToothIcon as ManageVoices,
	PlusIcon as Plus,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type {
	EffectPresetResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import { getLanguageOptionsForEngine } from "@/lib/constants/languages";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { cn } from "@/lib/utils/cn";
import { EffectsPresetSelect } from "./EffectsPresetSelect";
import {
	EngineCapabilitiesChips,
	EngineModelSelector,
} from "./EngineModelSelector";
import { VoiceCleanToggle } from "./VoiceCleanToggle";

const EMOTION_DSP_OPTIONS = [
	{ value: "", label: "No emotion" },
	{ value: "happy", label: "Happy" },
	{ value: "sad", label: "Sad" },
	{ value: "angry", label: "Angry" },
	{ value: "calm", label: "Calm" },
	{ value: "excited", label: "Excited" },
	{ value: "fearful", label: "Fearful" },
	{ value: "surprised", label: "Surprised" },
	{ value: "disgusted", label: "Disgusted" },
	{ value: "neutral", label: "Neutral" },
	{ value: "whisper", label: "Whisper" },
	{ value: "shout", label: "Shout" },
];

const VOICE_TYPE_LABELS: Record<string, string> = {
	preset: "Preset",
	cloned: "Clone",
	designed: "Designed",
};

function VoiceTypeBadge({ type }: { type?: string }) {
	const label = type ? (VOICE_TYPE_LABELS[type] ?? type) : "";
	if (!label) {
		return null;
	}
	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-1.5 py-px text-xs font-medium",
				type === "cloned" && "bg-amber-500/10 text-amber-300",
				type === "designed" && "bg-sky-500/10 text-sky-300",
				(!type || type === "preset") && "bg-muted/40 text-muted-foreground",
			)}
		>
			{label}
		</span>
	);
}

interface GenerationControlsRowProps {
	showVoiceSelector: boolean;
	selectedProfileId: string | null;
	setSelectedProfileId: (id: string | null) => void;
	profiles?: VoiceProfileResponse[];
	form: UseFormReturn<GenerationFormValues>;
	selectedPresetId: string | null;
	setSelectedPresetId: (id: string | null) => void;
	effectPresets?: EffectPresetResponse[];
	selectedProfile?: VoiceProfileResponse;
	watchedEngine: string | undefined;
}

export function GenerationControlsRow({
	showVoiceSelector,
	selectedProfileId,
	setSelectedProfileId,
	profiles,
	form,
	selectedPresetId,
	setSelectedPresetId,
	effectPresets,
	selectedProfile,
	watchedEngine,
}: GenerationControlsRowProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();

	return (
		<AnimatePresence>
			<motion.div
				initial={{ height: 0, opacity: 0 }}
				animate={{ height: "auto", opacity: 1 }}
				exit={{ height: 0, opacity: 0 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
				className=" mt-3"
			>
				<div className="flex items-center gap-2">
					{showVoiceSelector && (
						<div className="flex-1 min-w-0">
							{profiles && profiles.length === 0 ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 w-full rounded-full text-xs"
									onClick={() => navigate({ to: "/voices" })}
									title="Create your first voice profile"
								>
									<Plus className="size-3.5 mr-1" />
									Create your first voice
								</Button>
							) : (
								<div className="flex items-center gap-2">
									<Select
										value={selectedProfileId || ""}
										onValueChange={(value) =>
											setSelectedProfileId(value || null)
										}
									>
										<SelectTrigger className="h-8 text-xs bg-card border-border rounded-full hover:bg-accent transition-colors w-full">
											{selectedProfile ? (
												<span className="flex items-center gap-2 min-w-0">
													<span className="truncate">
														{selectedProfile.name}
													</span>
													<VoiceTypeBadge type={selectedProfile.voice_type} />
												</span>
											) : (
												<SelectValue
													placeholder={t(
														"generation.voiceSelector.placeholder",
													)}
												/>
											)}
										</SelectTrigger>
										<SelectContent>
											{profiles?.map((profile) => (
												<SelectItem
													key={profile.id}
													value={profile.id}
													className="text-xs"
												>
													<span className="flex items-center justify-between gap-3 w-full">
														<span className="flex items-center gap-2 min-w-0">
															<span className="truncate">{profile.name}</span>
															<VoiceTypeBadge type={profile.voice_type} />
														</span>
														<span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums">
															{profile.language}
															{profile.generation_count > 0 &&
																` � ${profile.generation_count} gen`}
														</span>
													</span>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<button
										type="button"
										onClick={() => navigate({ to: "/voices" })}
										className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
										title="Manage voices"
										aria-label="Manage voices"
									>
										<ManageVoices className="size-3.5" />
									</button>
								</div>
							)}
						</div>
					)}

					<FormField
						control={form.control}
						name="language"
						render={({ field }) => {
							const engineLangs = getLanguageOptionsForEngine(
								form.watch("engine") || "",
							);
							return (
								<FormItem className="flex-1 space-y-0">
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger className="h-8 text-xs bg-card border-border rounded-full hover:bg-accent transition-colors">
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{engineLangs.map((lang) => (
												<SelectItem
													key={lang.value}
													value={lang.value}
													className="text-xs"
												>
													{lang.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage className="text-xs" />
								</FormItem>
							);
						}}
					/>

					<FormField
						control={form.control}
						name="emotion"
						render={({ field }) => (
							<FormItem className="flex-1 space-y-0">
								<Select
									onValueChange={(value) => field.onChange(value || undefined)}
									value={field.value || ""}
								>
									<FormControl>
										<SelectTrigger
											className="h-8 text-xs bg-card border-border rounded-full hover:bg-accent transition-colors"
											title="Emotion DSP preset"
										>
											<SelectValue placeholder="Emotion" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{EMOTION_DSP_OPTIONS.map((opt) => (
											<SelectItem
												key={opt.value}
												value={opt.value}
												className="text-xs"
											>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormItem>
						)}
					/>

					<FormItem className="flex-1 space-y-0">
						<EngineModelSelector form={form} compact />
						<EngineCapabilitiesChips engine={watchedEngine ?? ""} />
					</FormItem>

					<FormField
						control={form.control}
						name="temperature"
						render={({ field }) => {
							const isAuto = field.value == null;
							return (
								<FormItem className="flex-shrink-0 space-y-0 w-24">
									<FormControl>
										<div className="flex items-center gap-2 flex-wrap">
											<Slider
												min={0}
												max={2}
												step={0.1}
												value={[isAuto ? 0.7 : (field.value ?? 0.7)]}
												onValueChange={(v) => field.onChange(v[0])}
												className="h-5"
											/>
											<button
												type="button"
												className="text-xs text-muted-foreground w-7 text-right tabular-nums hover:text-foreground transition-colors"
												title={
													isAuto
														? "Engine default � click to set"
														: "Click to reset to auto"
												}
												onClick={() => field.onChange(isAuto ? 0.7 : null)}
											>
												{isAuto ? "auto" : (field.value ?? 0.7).toFixed(1)}
											</button>
										</div>
									</FormControl>
								</FormItem>
							);
						}}
					/>

					<EffectsPresetSelect
						selectedProfile={selectedProfile}
						selectedPresetId={selectedPresetId}
						setSelectedPresetId={setSelectedPresetId}
						effectPresets={effectPresets}
					/>

					<VoiceCleanToggle form={form} />
				</div>
			</motion.div>
		</AnimatePresence>
	);
}
