export type { VoiceProfile } from "@/components/AudioStudio/audioStudio/PodcastConversationBuilder";
export { PodcastProducer } from "@/components/AudioStudio/audioStudio/PodcastProducer";
export { TranscriptDrawer } from "./TranscriptDrawer";
export { TranscriptEditor } from "./TranscriptEditor";
export type { TranscriptEditorProps } from "./TranscriptEditor.types";
export { transcriptService, type WordTimestamp } from "./TranscriptService";
export {
	type TranscriptEditorState,
	useTranscriptEditor,
} from "./useTranscriptEditor";
