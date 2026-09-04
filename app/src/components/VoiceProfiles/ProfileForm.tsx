import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProfileFormActions } from "./ProfileFormActions";
import { ProfileFormHeader } from "./ProfileFormHeader";
import { ProfileInfoColumn } from "./ProfileInfoColumn";
import { SampleColumn } from "./SampleColumn";
import { useProfileForm } from "./useProfileForm";

export function ProfileForm() {
	const { state, handlers } = useProfileForm();
	const { handleOpenChange, onSubmit } = handlers;

	return (
		<Dialog open={state.open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg max-h-[85vh] overflow-auto p-6">
				<div className="mx-auto w-full flex flex-col overflow-hidden">
					<ProfileFormHeader
						editingProfileId={state.editingProfileId}
						hasDraft={state.isCreating && !!state.profileFormDraft}
						onDiscardDraft={() => state.setProfileFormDraft(null)}
						formReset={state.form.reset}
						onSetSampleModeRecord={() => state.setSampleMode("record")}
					/>

					<form
						onSubmit={state.form.handleSubmit(onSubmit)}
						className="flex-1 min-h-0 flex flex-col"
					>
						<div className="grid gap-6 grid-cols-2 flex-1 min-h-0 overflow-hidden">
							<SampleColumn
								form={state.form}
								isCreating={state.isCreating}
								editingProfileId={state.editingProfileId}
								editingProfile={state.editingProfile}
								voiceSource={state.voiceSource}
								onSetVoiceSource={state.setVoiceSource}
								selectedPresetEngine={state.selectedPresetEngine}
								onSetSelectedPresetEngine={state.setSelectedPresetEngine}
								supportsBlending={state.supportsBlending}
								selectedPresetVoiceIds={state.selectedPresetVoiceIds}
								onSetSelectedPresetVoiceIds={state.setSelectedPresetVoiceIds}
								presetVoices={state.presetVoices}
								designEngine={state.designEngine}
								onSetDesignEngine={state.setDesignEngine}
								sampleMode={state.sampleMode}
								onSetSampleMode={state.setSampleMode}
								selectedFile={state.selectedFile}
								isRecording={state.isRecording}
								duration={state.duration}
								isSystemRecording={state.isSystemRecording}
								systemDuration={state.systemDuration}
								isSystemAudioSupported={state.isSystemAudioSupported}
								startRecording={state.startRecording}
								stopRecording={state.stopRecording}
								cancelRecording={state.cancelRecording}
								startSystemRecording={state.startSystemRecording}
								stopSystemRecording={state.stopSystemRecording}
								cancelSystemRecording={state.cancelSystemRecording}
								handleCancelRecording={handlers.handleCancelRecording}
								handleTranscribe={handlers.handleTranscribe}
								handlePlayPause={handlers.handlePlayPause}
								isPlaying={state.isPlaying}
								isTranscribing={state.transcribe.isPending}
								isValidatingAudio={state.isValidatingAudio}
								audioDuration={state.audioDuration}
								MAX_AUDIO_DURATION_SECONDS={state.MAX_AUDIO_DURATION_SECONDS}
							/>

							<ProfileInfoColumn
								form={state.form}
								avatarPreview={state.avatarPreview}
								editingProfile={state.editingProfile}
								avatarInputRef={state.avatarInputRef}
								onAvatarFileChange={handlers.handleAvatarFileChange}
								onRemoveAvatar={handlers.handleRemoveAvatar}
								deleteAvatarPending={state.deleteAvatar.isPending}
								voiceSource={state.voiceSource}
								defaultEngine={state.defaultEngine}
								onSetDefaultEngine={state.setDefaultEngine}
								availableDefaultEngines={state.availableDefaultEngines}
								editingVoiceType={state.editingProfile?.voice_type}
								showEffects={!!state.editingProfileId}
								profileEffectsChain={state.profileEffectsChain}
								onEffectsChange={(chain) => {
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
