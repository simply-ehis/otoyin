import {
	useAudioValidationEffect,
	useProfileFormSyncEffects,
	useRecordingErrorEffects,
} from "./useProfileFormEffects";
import {
	useProfileFormAvatarHandlers,
	useProfileFormHandlers,
	useProfileFormOpenHandler,
} from "./useProfileFormHandlers";
import { useProfileFormState } from "./useProfileFormState";

export interface ProfileFormController {
	state: ReturnType<typeof useProfileFormState>;
	handlers: ReturnType<typeof useProfileFormHandlers> &
		ReturnType<typeof useProfileFormOpenHandler> &
		ReturnType<typeof useProfileFormAvatarHandlers>;
}

export function useProfileForm(): ProfileFormController {
	const state = useProfileFormState();

	useAudioValidationEffect(state);
	useRecordingErrorEffects(state);
	useProfileFormSyncEffects(state);

	const handlers = {
		...useProfileFormHandlers(state),
		...useProfileFormOpenHandler(state),
		...useProfileFormAvatarHandlers(state),
	};

	return { state, handlers };
}
