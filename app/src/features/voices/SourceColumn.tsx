import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Badge } from "@/ui/primitives";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { Textarea } from "@/ui/input";
import { Segmented } from "@/ui/controls";
import type { PresetVoice } from "@/lib/api/types";
import { usePlatform } from "@/platform/PlatformContext";
import { cn } from "@/lib/utils/cn";
import { VoiceDesignPanel } from "./VoiceDesignPanel";
import {
	AudioSampleRecording,
	AudioSampleSystem,
	AudioSampleUpload,
} from "./samples";

export type VoiceSource = "clone" | "builtin" | "design";
export type SampleMode = "upload" | "record" | "system";

/**
 * Left column: voice-source switch (clone sample / builtin presets /
 * designed attributes). Edit mode shows the preset summary or nothing
 * (samples live in the inspector instead).
 */
export function SourceColumn({
	form,
	source,
	onSource,
	presetEngine,
	onPresetEngine,
	presetEngines,
	presetVoices,
	presetIds,
	onPresetIds,
	blending,
	designEngine,
	onDesignEngine,
	sampleMode,
	onSampleMode,
	sampleFile,
	isRecording,
	duration,
	isSystemRecording,
	systemDuration,
	systemSupported,
	startRecording,
	stopRecording,
	cancelRecording,
	startSystem,
	stopSystem,
	cancelSystem,
	onTranscribe,
	onPlayPause,
	isPlaying,
	isTranscribing,
	isValidating,
	audioSeconds,
	maxSeconds,
}: {
	form: UseFormReturn<Record<string, unknown>>;
	source: VoiceSource;
	onSource: (v: VoiceSource) => void;
	presetEngine: string;
	onPresetEngine: (v: string) => void;
	presetEngines: { value: string; label: string }[];
	presetVoices: PresetVoice[];
	presetIds: Set<string>;
	onPresetIds: (v: Set<string>) => void;
	blending: boolean;
	designEngine: string;
	onDesignEngine: (v: string) => void;
	sampleMode: SampleMode;
	onSampleMode: (v: SampleMode) => void;
	sampleFile?: File;
	isRecording: boolean;
	duration: number;
	isSystemRecording: boolean;
	systemDuration: number;
	systemSupported: boolean;
	startRecording: () => void;
	stopRecording: () => void;
	cancelRecording: () => void;
	startSystem: () => void;
	stopSystem: () => void;
	cancelSystem: () => void;
	onTranscribe: () => void;
	onPlayPause: () => void;
	isPlaying: boolean;
	isTranscribing: boolean;
	isValidating: boolean;
	audioSeconds: number | null;
	maxSeconds: number;
}) {
	const { t } = useTranslation();
	const platform = usePlatform();

	return (
		<div className="min-h-0 overflow-y-auto border-r border-border pr-6">
			<Segmented
				label="Voice source"
				value={source}
				onChange={onSource}
				options={[
					{ value: "clone", label: t("profileForm.source.clone") },
					{ value: "builtin", label: t("profileForm.source.builtin") },
					{ value: "design", label: "Design" },
				]}
			/>

			{source === "builtin" ? (
				<div className="mt-4 flex flex-col gap-4">
					<p className="text-xs text-muted-foreground">{t("profileForm.builtin.hint")}</p>
					<FormItem>
						<FormLabel>{t("profileForm.fields.engine")}</FormLabel>
						<Select value={presetEngine} onValueChange={onPresetEngine}>
							<FormControl>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{presetEngines.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormItem>
					<FormItem>
						<FormLabel>
							{t("profileForm.fields.voice")}
							{blending && presetIds.size > 1 ? (
								<span className="ml-2 text-xs font-medium text-accent">
									{presetIds.size} voices blended
								</span>
							) : null}
						</FormLabel>
						<div className="grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-1">
							{presetVoices.map((voice) => {
								const selected = presetIds.has(voice.id);
								return (
									<button
										key={voice.id}
										type="button"
										aria-pressed={selected}
										onClick={() => {
											if (blending) {
												const next = new Set(presetIds);
												if (selected) {
													next.delete(voice.id);
												} else {
													next.add(voice.id);
												}
												onPresetIds(next);
											} else {
												onPresetIds(new Set([voice.id]));
											}
											if (voice.language) {
												form.setValue("language", voice.language);
											}
										}}
										className={cn(
											"rounded-sm border px-3 py-2 text-left text-sm transition-colors",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											selected
												? "border-accent bg-secondary"
												: "border-border hover:bg-secondary",
										)}
									>
										<span className="block font-medium text-foreground">{voice.name}</span>
										<span className="mt-0.5 flex gap-1">
											<Badge tone="neutral">{voice.gender}</Badge>
											<Badge tone="neutral">{voice.language}</Badge>
										</span>
									</button>
								);
							})}
						</div>
					</FormItem>
				</div>
			) : source === "design" ? (
				<div className="mt-4">
					<VoiceDesignPanel form={form} designEngine={designEngine} onSetDesignEngine={onDesignEngine} />
				</div>
			) : (
				<div className="mt-4">
					<Tabs
						value={sampleMode}
						onValueChange={(v) => {
							const next = v as SampleMode;
							if (isRecording && next !== "record") {
								cancelRecording();
							}
							if (isSystemRecording && next !== "system") {
								cancelSystem();
							}
							onSampleMode(next);
						}}
					>
						<TabsList className={`grid w-full ${platform.metadata.isTauri && systemSupported ? "grid-cols-3" : "grid-cols-2"}`}>
							<TabsTrigger value="upload">
								{t("profileForm.sampleTabs.upload")}
							</TabsTrigger>
							<TabsTrigger value="record">
								{t("profileForm.sampleTabs.record")}
							</TabsTrigger>
							{platform.metadata.isTauri && systemSupported ? (
								<TabsTrigger value="system">
									{t("profileForm.sampleTabs.system")}
								</TabsTrigger>
							) : null}
						</TabsList>
						<TabsContent value="upload">
							<FormField
								control={form.control}
								name="sampleFile"
								render={({ field: { onChange, name } }) => (
									<FormItem>
										<FormControl>
											<AudioSampleUpload
												file={sampleFile}
												onFileChange={onChange}
												onTranscribe={onTranscribe}
												onPlayPause={onPlayPause}
												isPlaying={isPlaying}
												isValidating={isValidating}
												isTranscribing={isTranscribing}
												isDisabled={audioSeconds !== null && audioSeconds > maxSeconds}
												fieldName={name as string}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</TabsContent>
						<TabsContent value="record">
							<FormField
								control={form.control}
								name="sampleFile"
								render={() => (
									<FormItem>
										<FormControl>
											<AudioSampleRecording
												file={sampleFile}
												isRecording={isRecording}
												duration={duration}
												onStart={startRecording}
												onStop={stopRecording}
												onCancel={cancelRecording}
												onTranscribe={onTranscribe}
												onPlayPause={onPlayPause}
												isPlaying={isPlaying}
												isTranscribing={isTranscribing}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</TabsContent>
						{platform.metadata.isTauri && systemSupported ? (
							<TabsContent value="system">
								<FormField
									control={form.control}
									name="sampleFile"
									render={() => (
										<FormItem>
											<FormControl>
												<AudioSampleSystem
													file={sampleFile}
													isRecording={isSystemRecording}
													duration={systemDuration}
													onStart={startSystem}
													onStop={stopSystem}
													onCancel={cancelSystem}
													onTranscribe={onTranscribe}
													onPlayPause={onPlayPause}
													isPlaying={isPlaying}
													isTranscribing={isTranscribing}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</TabsContent>
						) : null}
					</Tabs>

					<FormField
						control={form.control}
						name="referenceText"
						render={({ field }) => (
							<FormItem className="mt-4">
								<FormLabel>{t("profileForm.fields.referenceText")}</FormLabel>
								<FormControl>
									<textarea
										placeholder={t("profileForm.fields.referenceTextPlaceholder")}
										rows={3}
										{...field}
										value={(field.value as string) ?? ""}
										onChange={(e) => field.onChange(e.target.value)}
										className="min-h-[100px] w-full resize-y rounded-sm border border-input bg-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
									/>
								</FormControl>
								<FormDescription>
									{t("profileForm.fields.referenceTextHint", "The exact words spoken in the sample.")}
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			)}
		</div>
	);
}
