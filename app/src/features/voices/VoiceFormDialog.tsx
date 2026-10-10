import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ProfileFormActions } from "@/features/voices/ProfileFormActions";
import { ProfileFormHeader } from "@/features/voices/ProfileFormHeader";
import { useProfileForm } from "@/features/voices/useProfileForm";
import { apiClient } from "@/lib/api/client";
import type { ModelStatus, ModelStatusListResponse } from "@/lib/api/types";
import {
	PRESET_ENGINE_FALLBACK,
	PRESET_ENGINE_LABELS,
} from "@/lib/constants/engines";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { InfoColumn, type InfoFormValues } from "./InfoColumn";
import { SourceColumn } from "./SourceColumn";

/**
 * Full voice create/edit form: the new SourceColumn + InfoColumn pair driven
 * by the existing profile-form controller (drafts, recording, transcribe,
 * submit). Mount once in VoicesTab; opened via uiStore.profileDialogOpen.
 */
export function VoiceFormDialog() {
	const { state, handlers } = useProfileForm();
	const { handleOpenChange, onSubmit } = handlers;

	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
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
		return PRESET_ENGINE_FALLBACK.map((o) => ({
			value: o.value,
			label: o.label,
		}));
	}, [modelStatus]);

	if (!state.open) {
		return null;
	}

	return (
		<Dialog open={state.open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-h-[85vh] max-w-4xl overflow-auto p-6">
				<DialogTitle>
					{state.editingProfileId ? "Edit voice" : "New voice"}
				</DialogTitle>
				<div className="mx-auto flex w-full flex-col overflow-hidden">
					<ProfileFormHeader
						editingProfileId={state.editingProfileId}
						hasDraft={state.isCreating && !!state.profileFormDraft}
						onDiscardDraft={() => state.setProfileFormDraft(null)}
						formReset={state.form.reset}
						onSetSampleModeRecord={() => state.setSampleMode("record")}
					/>

					<form
						onSubmit={state.form.handleSubmit(onSubmit)}
						className="flex min-h-0 flex-1 flex-col"
					>
						<div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-hidden">
							<SourceColumn
								form={
									state.form as unknown as UseFormReturn<
										Record<string, unknown>
									>
								}
								source={state.voiceSource}
								onSource={state.setVoiceSource}
								presetEngine={state.selectedPresetEngine}
								onPresetEngine={state.setSelectedPresetEngine}
								presetEngines={presetEngines}
								presetVoices={state.presetVoices}
								presetIds={state.selectedPresetVoiceIds}
								onPresetIds={state.setSelectedPresetVoiceIds}
								blending={state.supportsBlending}
								designEngine={state.designEngine}
								onDesignEngine={state.setDesignEngine}
								sampleMode={state.sampleMode}
								onSampleMode={state.setSampleMode}
								sampleFile={state.selectedFile}
								isRecording={state.isRecording}
								duration={state.duration}
								isSystemRecording={state.isSystemRecording}
								systemDuration={state.systemDuration}
								systemSupported={state.isSystemAudioSupported}
								startRecording={state.startRecording}
								stopRecording={state.stopRecording}
								cancelRecording={state.cancelRecording}
								startSystem={state.startSystemRecording}
								stopSystem={state.stopSystemRecording}
								cancelSystem={state.cancelSystemRecording}
								onTranscribe={handlers.handleTranscribe}
								onPlayPause={handlers.handlePlayPause}
								isPlaying={state.isPlaying}
								isTranscribing={state.transcribe.isPending}
								audioSeconds={state.audioDuration}
								maxSeconds={state.MAX_AUDIO_DURATION_SECONDS}
							/>

							<InfoColumn
								form={
									state.form as unknown as UseFormReturn<
										InfoFormValues & Record<string, unknown>
									>
								}
								avatarPreview={state.avatarPreview}
								setAvatarPreview={state.setAvatarPreview}
								editingId={state.editingProfileId}
								editingAvatarPath={
									state.editingProfile?.avatar_path ?? undefined
								}
								source={state.voiceSource}
								defaultEngine={state.defaultEngine}
								onDefaultEngine={state.setDefaultEngine}
								showEffects={!!state.editingProfileId}
								chain={state.profileEffectsChain}
								onChain={(chain) => {
									state.setProfileEffectsChain(chain);
									state.setEffectsDirty(true);
								}}
							/>
						</div>

						<ProfileFormActions
							editingProfileId={state.editingProfileId}
							createPending={state.createProfile.isPending}
							updatePending={state.updateProfile.isPending}
							addSamplePending={state.addSample.isPending}
							onCancel={() => handleOpenChange(false)}
						/>
					</form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
