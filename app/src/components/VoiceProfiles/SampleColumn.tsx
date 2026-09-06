import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type {
	ModelStatus,
	ModelStatusListResponse,
	PresetVoice,
	VoiceProfileResponse,
} from "@/lib/api/types";
import {
	PRESET_ENGINE_FALLBACK,
	PRESET_ENGINE_LABELS,
} from "@/lib/constants/engines";
import type { LanguageCode } from "@/lib/constants/languages";
import { usePlatform } from "@/platform/PlatformContext";
import { AudioSampleRecording } from "./AudioSampleRecording";
import { AudioSampleSystem } from "./AudioSampleSystem";
import { AudioSampleUpload } from "./AudioSampleUpload";
import type { ProfileFormValues } from "./profileFormHelpers";
import { SampleList } from "./SampleList";
import { VoiceDesignPanel } from "./VoiceDesignPanel";

interface SampleColumnProps {
	form: UseFormReturn<ProfileFormValues>;
	isCreating: boolean;
	editingProfileId: string | null;
	editingProfile: VoiceProfileResponse | null;
	voiceSource: "clone" | "builtin" | "design";
	onSetVoiceSource: (v: "clone" | "builtin" | "design") => void;
	selectedPresetEngine: string;
	onSetSelectedPresetEngine: (v: string) => void;
	supportsBlending: boolean;
	selectedPresetVoiceIds: Set<string>;
	onSetSelectedPresetVoiceIds: (v: Set<string>) => void;
	presetVoices: PresetVoice[];
	designEngine: string;
	onSetDesignEngine: (v: string) => void;
	sampleMode: "upload" | "record" | "system";
	onSetSampleMode: (v: "upload" | "record" | "system") => void;
	selectedFile?: File;
	isRecording: boolean;
	duration: number;
	isSystemRecording: boolean;
	systemDuration: number;
	isSystemAudioSupported: boolean;
	startRecording: () => void;
	stopRecording: () => void;
	cancelRecording: () => void;
	startSystemRecording: () => void;
	stopSystemRecording: () => void;
	cancelSystemRecording: () => void;
	handleCancelRecording: () => void;
	handleTranscribe: () => void;
	handlePlayPause: () => void;
	isPlaying: boolean;
	isTranscribing: boolean;
	isValidatingAudio: boolean;
	audioDuration: number | null;
	MAX_AUDIO_DURATION_SECONDS: number;
}

export function SampleColumn(props: SampleColumnProps) {
	const { t } = useTranslation();
	const platform = usePlatform();
	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const presetEngines = useMemo(() => {
		const models = modelStatus?.models ?? [];
		const seen = new Map<string, string>();
		for (const m of models) {
			const engine = (m as ModelStatus).engine;
			if (!engine || !m.downloaded) {
				continue;
			}
			const hasStructured =
				((m as unknown as { structured_preset_voices?: unknown[] })
					.structured_preset_voices?.length ?? 0) > 0;
			const hasPreset = (m.preset_voices?.length ?? 0) > 0;
			if ((hasStructured || hasPreset) && !seen.has(engine)) {
				seen.set(
					engine,
					m.display_name || PRESET_ENGINE_LABELS[engine] || engine,
				);
			}
		}
		if (seen.size > 0) {
			return [...seen.entries()].map(([value, label]) => ({ value, label }));
		}
		return PRESET_ENGINE_FALLBACK;
	}, [modelStatus]);
	const {
		form,
		isCreating,
		editingProfileId,
		editingProfile,
		voiceSource,
		onSetVoiceSource,
		selectedPresetEngine,
		onSetSelectedPresetEngine,
		supportsBlending,
		selectedPresetVoiceIds,
		onSetSelectedPresetVoiceIds,
		presetVoices,
		designEngine,
		onSetDesignEngine,
		sampleMode,
		onSetSampleMode,
		selectedFile,
		isRecording,
		duration,
		isSystemRecording,
		systemDuration,
		isSystemAudioSupported,
		startRecording,
		stopRecording,
		cancelRecording,
		startSystemRecording,
		stopSystemRecording,
		cancelSystemRecording,
		handleCancelRecording,
		handleTranscribe,
		handlePlayPause,
		isPlaying,
		isTranscribing,
		isValidatingAudio,
		audioDuration,
		MAX_AUDIO_DURATION_SECONDS,
	} = props;

	if (!isCreating) {
		return (
			<div className="space-y-4 border-r pr-6 overflow-y-auto min-h-0">
				{editingProfileId &&
					editingProfile &&
					(editingProfile.voice_type === "preset" ? (
						<div className="space-y-4 pt-4">
							<div className="rounded-lg border border-border p-4 space-y-3">
								<div className="text-sm font-medium text-muted-foreground">
									{t("profileForm.builtin.badge")}
								</div>
								<div className="flex items-center gap-3 flex-wrap">
									{(() => {
										const ids =
											editingProfile.preset_voice_id
												?.split(",")
												.map((v: string) => v.trim()) ?? [];
										if (ids.length <= 3) {
											return ids.map((vid: string) => {
												const v = presetVoices.find(
													(pv: PresetVoice) => pv.id === vid,
												);
												return (
													<span key={vid} className="text-lg font-semibold">
														{v?.name ?? vid}
													</span>
												);
											});
										}
										return (
											<span className="text-base font-semibold">
												{ids.length} voices blended
											</span>
										);
									})()}
									<Badge variant="secondary" className="text-xs">
										{editingProfile.preset_engine}
									</Badge>
								</div>
							</div>
							<p className="text-xs text-muted-foreground">
								{t("profileForm.builtin.note")}
							</p>
						</div>
					) : (
						<div>
							<SampleList profileId={editingProfileId} />
						</div>
					))}
			</div>
		);
	}

	return (
		<div className="space-y-4 border-r pr-6 overflow-y-auto min-h-0">
			{/* Voice source selector */}
			<div className="flex pt-4 pb-2">
				<div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary">
					<button
						type="button"
						onClick={() => onSetVoiceSource("clone")}
						className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
							voiceSource === "clone"
								? "bg-accent text-accent-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t("profileForm.source.clone")}
					</button>
					<button
						type="button"
						onClick={() => onSetVoiceSource("builtin")}
						className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
							voiceSource === "builtin"
								? "bg-accent text-accent-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t("profileForm.source.builtin")}
					</button>
					<button
						type="button"
						onClick={() => onSetVoiceSource("design")}
						className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
							voiceSource === "design"
								? "bg-accent text-accent-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Design
					</button>
				</div>
			</div>

			{voiceSource === "builtin" ? (
				<div className="space-y-4">
					<FormDescription>{t("profileForm.builtin.hint")}</FormDescription>

					<FormItem>
						<FormLabel>{t("profileForm.fields.engine")}</FormLabel>
						<Select
							value={selectedPresetEngine}
							onValueChange={onSetSelectedPresetEngine}
						>
							<FormControl>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{presetEngines.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormItem>

					{/* Voice picker */}
					<FormItem>
						<FormLabel>
							{t("profileForm.fields.voice")}
							{supportsBlending && selectedPresetVoiceIds.size > 1 && (
								<span className="ml-2 text-xs text-accent font-medium">
									{selectedPresetVoiceIds.size} voices blended
								</span>
							)}
						</FormLabel>
						<div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
							{presetVoices.map((voice: PresetVoice) => {
								const selected = selectedPresetVoiceIds.has(voice.id);
								return (
									<button
										key={voice.id}
										type="button"
										onClick={() => {
											if (supportsBlending) {
												const next = new Set(selectedPresetVoiceIds);
												if (selected) {
													next.delete(voice.id);
												} else {
													next.add(voice.id);
												}
												onSetSelectedPresetVoiceIds(next);
											} else {
												onSetSelectedPresetVoiceIds(new Set([voice.id]));
											}
											if (voice.language) {
												form.setValue(
													"language",
													voice.language as LanguageCode,
												);
											}
										}}
										className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${
											selected
												? "border-accent bg-accent-muted text-accent-foreground"
												: "border-border hover:bg-muted"
										}`}
										aria-pressed={selected}
									>
										<div className="font-medium">{voice.name}</div>
										<div className="flex gap-2 mt-0.5">
											<Badge variant="outline" className="text-xs h-4 px-1">
												{voice.gender}
											</Badge>
											<Badge variant="outline" className="text-xs h-4 px-1">
												{voice.language}
											</Badge>
										</div>
									</button>
								);
							})}
						</div>
					</FormItem>
				</div>
			) : voiceSource === "design" ? (
				<VoiceDesignPanel
					form={form}
					designEngine={designEngine}
					onSetDesignEngine={onSetDesignEngine}
				/>
			) : (
				<>
					<Tabs
						className="pt-0"
						value={sampleMode}
						onValueChange={(v) => {
							const newMode = v as "upload" | "record" | "system";
							if (isRecording && newMode !== "record") {
								cancelRecording();
							}
							if (isSystemRecording && newMode !== "system") {
								cancelSystemRecording();
							}
							onSetSampleMode(newMode);
						}}
					>
						<TabsList
							className={`grid w-full ${platform.metadata.isTauri && isSystemAudioSupported ? "grid-cols-3" : "grid-cols-2"}`}
						>
							<TabsTrigger value="upload" className="flex items-center gap-2">
								{t("profileForm.sampleTabs.upload")}
							</TabsTrigger>
							<TabsTrigger value="record" className="flex items-center gap-2">
								{t("profileForm.sampleTabs.record")}
							</TabsTrigger>
							{platform.metadata.isTauri && isSystemAudioSupported && (
								<TabsTrigger value="system" className="flex items-center gap-2">
									{t("profileForm.sampleTabs.system")}
								</TabsTrigger>
							)}
						</TabsList>

						<TabsContent value="upload" className="space-y-4">
							<FormField
								control={form.control}
								name="sampleFile"
								render={({ field: { onChange, name } }) => (
									<AudioSampleUpload
										file={selectedFile}
										onFileChange={onChange}
										onTranscribe={handleTranscribe}
										onPlayPause={handlePlayPause}
										isPlaying={isPlaying}
										isValidating={isValidatingAudio}
										isTranscribing={isTranscribing}
										isDisabled={
											audioDuration !== null &&
											audioDuration > MAX_AUDIO_DURATION_SECONDS
										}
										fieldName={name}
									/>
								)}
							/>
						</TabsContent>

						<TabsContent value="record" className="space-y-4">
							<FormField
								control={form.control}
								name="sampleFile"
								render={() => (
									<AudioSampleRecording
										file={selectedFile}
										isRecording={isRecording}
										duration={duration}
										onStart={startRecording}
										onStop={stopRecording}
										onCancel={handleCancelRecording}
										onTranscribe={handleTranscribe}
										onPlayPause={handlePlayPause}
										isPlaying={isPlaying}
										isTranscribing={isTranscribing}
									/>
								)}
							/>
						</TabsContent>

						{platform.metadata.isTauri && isSystemAudioSupported && (
							<TabsContent value="system" className="space-y-4">
								<FormField
									control={form.control}
									name="sampleFile"
									render={() => (
										<AudioSampleSystem
											file={selectedFile}
											isRecording={isSystemRecording}
											duration={systemDuration}
											onStart={startSystemRecording}
											onStop={stopSystemRecording}
											onCancel={handleCancelRecording}
											onTranscribe={handleTranscribe}
											onPlayPause={handlePlayPause}
											isPlaying={isPlaying}
											isTranscribing={isTranscribing}
										/>
									)}
								/>
							</TabsContent>
						)}
					</Tabs>

					<FormField
						control={form.control}
						name="referenceText"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("profileForm.fields.referenceText")}</FormLabel>
								<FormControl>
									<Textarea
										placeholder={t(
											"profileForm.fields.referenceTextPlaceholder",
										)}
										className="min-h-[100px]"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</>
			)}
		</div>
	);
}
