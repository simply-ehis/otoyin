/**
 * CANONICAL hand-written API types — matching backend Pydantic models.
 *
 * This file is the single source of truth for types used by the hand-written
 * client classes (clientCore.ts / clientGenerations.ts / ...).
 *
 * NOTE: `./index.ts` plus the `models/`, `schemas/`, `services/`, and `core/`
 * folders are output from `openapi-typescript-codegen` and are NOT imported by
 * app code — they are regenerated artifacts only. Prefer extending this file
 * over touching generated code.
 */
import type { LanguageCode } from "@/lib/constants/languages";

export type VoiceType = "cloned" | "preset" | "designed";

export interface VoiceAttributes {
	gender?: "male" | "female" | "non_binary";
	age?: "child" | "teen" | "young_adult" | "adult" | "middle_aged" | "senior";
	accent?: string;
	tone?: string;
	style?: string;
	pacing?: "slow" | "moderate" | "fast";
}

export interface VoiceProfileCreate {
	name: string;
	description?: string;
	language: LanguageCode;
	voice_type?: VoiceType;
	preset_engine?: string;
	preset_voice_id?: string;
	design_prompt?: string;
	voice_attributes?: VoiceAttributes;
	default_engine?: string;
	/** Free-form character prompt used by compose and the `/generate` personality-rewrite path. */
	personality?: string;
}

export interface VoiceProfileResponse {
	id: string;
	name: string;
	description?: string;
	language: string;
	avatar_path?: string;
	effects_chain?: EffectConfig[];
	voice_type: VoiceType;
	preset_engine?: string;
	preset_voice_id?: string;
	design_prompt?: string;
	voice_attributes?: VoiceAttributes;
	default_engine?: string;
	personality?: string | null;
	generation_count: number;
	sample_count: number;
	created_at: string;
	updated_at: string;
}

/** Response returned by /profiles/{id}/compose. */
export interface PersonalityTextResponse {
	text: string;
	model_size: string;
}

export interface PresetVoice {
	id: string; // e.g. "af_heart", "Vivian"
	name: string; // Display name e.g. "Heart", "Vivian"
	gender?: string; // "female", "male", or undefined
	language?: string; // primary language code
}

export interface ProfileSampleCreate {
	reference_text: string;
}

export interface ProfileSampleResponse {
	id: string;
	profile_id: string;
	audio_path: string;
	reference_text: string;
}

export interface EffectConfig {
	type: string;
	enabled: boolean;
	params: Record<string, number>;
	/** Optional trim: apply this effect only to [trim_start_ms, trim_end_ms]. */
	trim_start_ms?: number;
	trim_end_ms?: number;
}

export interface GenerationRequest {
	profile_id: string;
	text: string;
	language: LanguageCode;
	seed?: number;
	model_size?: "1.7B" | "0.6B" | "0.5B" | "small" | "mini";
	engine?:
		| "kokoro"
		| "fish_speech"
		| "fish_speech_s2"
		| "chattts"
		| "f5_tts"
		| "qwen3_tts"
		| "bark_small"
		| "styletts2"
		| "pocket_tts"
		| "parler_tts_gguf"
		| "moss_tts_nano"
		| "kitten_tts"
		| "voxcpm2"
		| "neutts"
		| "neutts_2e"
		| "orpheus"
		| "cloud"
		| "steer_tts"
		| "audio8_tts"
		| "chatterbox_turbo"
		| "cosyvoice3"
		| "fish_drama3"
		| "inflect_v2"
		| "magpie_tts"
		| "omnivoice"
		| "phonon"
		| "piper_tts"
		| "supertonic"
		| "zonos3";
	instruct?: string;
	temperature?: number;
	/** When true and the profile has a personality prompt, input text is rewritten in-character before TTS. */
	personality?: boolean;
	max_chunk_chars?: number;
	crossfade_ms?: number;
	normalize?: boolean;
	effects_chain?: EffectConfig[];
	/** Emotion preset applied via DSP post-processing (e.g. 'happy', 'sad', 'calm'). */
	emotion?: string;
	/** Apply the Phase 1 TTS enhancer chain (denoise -> de-ess -> warmth EQ -> dynamics). */
	voice_clean?: boolean;
	/** Enable streaming playback: chunks saved to disk and emitted via SSE as they complete. */
	streaming?: boolean;
	/** Route TTS through the default BYOK cloud provider instead of a local model. */
	use_cloud?: boolean;
}

export interface EditAudioRequest {
	generation_id: string;
	edit_type:
		| "emotion"
		| "style"
		| "paralinguistic"
		| "speed"
		| "denoise"
		| "vad";
	edit_info?: string;
	target_text?: string;
	profile_id?: string;
	normalize?: boolean;
}

export interface GenerationVersionResponse {
	id: string;
	generation_id: string;
	label: string;
	audio_path: string;
	effects_chain?: EffectConfig[];
	source_version_id?: string;
	is_default: boolean;
	created_at: string;
}

export interface GenerationResponse {
	id: string;
	profile_id: string;
	text: string;
	language: string;
	audio_path?: string;
	duration?: number;
	seed?: number;
	instruct?: string;
	engine?: string;
	model_size?: string;
	source?: string;
	status: "loading_model" | "generating" | "completed" | "failed";
	error?: string;
	is_favorited?: boolean;
	created_at: string;
	versions?: GenerationVersionResponse[];
	active_version_id?: string;
}

export interface SFXGenerateRequest {
	prompt: string;
	duration_seconds: number;
	seed?: number;
	engine: string;
}

export interface MusicGenerateRequest {
	engine?: string;
	prompt: string;
	duration_seconds?: number;
	genre?: string;
	mood?: string;
	tempo?: number;
	seed?: number;
	mode?: "generate" | "cover" | "repaint";
	reference_audio_path?: string;
}

export interface SFXGenerateResponse {
	audio_path: string;
	duration: number;
	seed: number;
}

export interface HistoryQuery {
	profile_id?: string;
	search?: string;
	limit?: number;
	offset?: number;
}

export interface HistoryResponse extends GenerationResponse {
	profile_name: string;
	versions?: GenerationVersionResponse[];
	active_version_id?: string;
}

export interface HistoryListResponse {
	items: HistoryResponse[];
	total: number;
}

export type WhisperModelSize =
	| "moonshine-tiny"
	| "moonshine-base"
	| "moonshine-streaming-small"
	| "tiny.en"
	| "base.en"
	| "cloud";

export type PlannerModelSize =
	| "2.6B-Q4_0"
	| "8B-A1B-Q4_K_M"
	| "ling-tiny-Q4_K_M"
	| "27B-PTQ1_0"
	| "LFM2.5-24B-A2B-Q4_K_M"
	| "cloud";

export type CaptureSource = "dictation" | "recording" | "file";

/**
 * Snapshot of the accessibility-focused UI element at chord-start. Emitted
 * from Rust as part of the ``dictate:start`` payload so the frontend can
 * pass it back to ``paste_final_text`` once the final text is ready.
 */
export interface FocusSnapshot {
	pid: number;
	bundle_id: string | null;
	role: string | null;
}

export interface RefinementFlags {
	smart_cleanup: boolean;
	self_correction: boolean;
	preserve_technical: boolean;
}

export interface CaptureResponse {
	id: string;
	audio_path: string;
	source: CaptureSource;
	language?: string | null;
	duration_ms?: number | null;
	transcript_raw: string;
	transcript_refined?: string | null;
	stt_model?: string | null;
	llm_model?: string | null;
	refinement_flags?: RefinementFlags | null;
	created_at: string;
}

/** Scribe-shaped words sidecar (video-use contract): word/spacing/audio_event entries. */
export interface CaptureWordsEntry {
	text: string;
	start: number;
	end: number;
	type: string;
	speaker_id?: string | null;
}

export interface CaptureWordsDoc {
	text: string;
	words: CaptureWordsEntry[];
}

export interface CaptureChapter {
	index: number;
	title: string;
	start: number;
	end: number;
}

export interface CaptureChaptersResponse {
	chapters: CaptureChapter[];
}

export interface CaptureListResponse {
	items: CaptureResponse[];
	total: number;
}

/**
 * Response of ``POST /captures``. Adds ``auto_refine`` and ``allow_auto_paste``
 * — the server's current settings captured at request time — so the client
 * can decide whether to chain a refine call and whether to fire the
 * synthetic-paste pipeline without relying on its own (possibly stale) copy
 * of capture_settings.
 */
export interface CaptureCreateResponse extends CaptureResponse {
	auto_refine: boolean;
	allow_auto_paste: boolean;
}

export interface CaptureRefineRequest {
	flags?: RefinementFlags;
	model_size?: PlannerModelSize;
}

export interface CaptureRetranscribeRequest {
	model?: WhisperModelSize;
	language?: LanguageCode;
}

export interface CaptureSettings {
	stt_model: WhisperModelSize;
	language: string;
	auto_refine: boolean;
	llm_model: PlannerModelSize;
	smart_cleanup: boolean;
	self_correction: boolean;
	preserve_technical: boolean;
	allow_auto_paste: boolean;
	default_playback_voice_id: string | null;
	/** Whether the global keyboard hotkey is armed. Off by default — turning
	 * this on triggers the macOS Input Monitoring TCC prompt. */
	hotkey_enabled: boolean;
	/** keytap key names. Defaults are platform-specific right-hand modifiers. */
	chord_push_to_talk_keys: string[];
	/** keytap key names. Toggle adds Space to the platform-specific PTT chord. */
	chord_toggle_to_talk_keys: string[];
	/** Streaming STT (live dictation) model. */
	streaming_stt_model: WhisperModelSize;
	/** Streaming STT language. */
	streaming_stt_language: string;
	/** Streaming STT VAD energy threshold (0-1). */
	streaming_vad_threshold: number;
}

export type CaptureSettingsUpdate = Partial<CaptureSettings>;

/**
 * One row in the dictation readiness checklist. ``model_name`` is the
 * canonical id understood by ``POST /models/download`` so the UI can wire a
 * one-click "Download" button without a second lookup.
 */
export interface ModelReadiness {
	ready: boolean;
	model_name: string;
	display_name: string;
	size: string;
	size_mb?: number | null;
}

/** Backend half of the dictation readiness check. The frontend combines this
 * with TCC permission state into the full checklist used by useDictationReadiness. */
export interface CaptureReadinessResponse {
	stt: ModelReadiness;
	llm: ModelReadiness;
}

export interface GenerationSettings {
	max_chunk_chars: number;
	crossfade_ms: number;
	normalize_audio: boolean;
	autoplay_on_generate: boolean;
	audio_tags_enabled: boolean;
	preload_on_start: boolean;
	low_memory_mode: boolean;
}

export type GenerationSettingsUpdate = Partial<GenerationSettings>;

export interface AssistantSettings {
	/** GGUF planner variant, e.g. "2.6B-Q4_0". */
	model_size: string;
	/** null = use the RAM-aware default; otherwise a user override in [2048,32768]. */
	context_tokens: number | null;
	/** null = follows context_tokens/n_ctx; otherwise a user override. */
	max_tokens: number | null;
	agent_memory_enabled: boolean;
	thinking_enabled: boolean;
	/** User-edited base system prompt; null/empty = built-in default. */
	system_prompt?: string | null;
	/** KV-cache quantization for the GGUF planner (e.g. "q8_0"). */
	kv_quant: string;
	/** Layers offloaded to GPU (null = CPU-only). Applies at planner load. */
	gpu_layers?: number | null;
	/** MoE expert streaming cache in GB (null = disabled). Applies at planner load. */
	moe_stream_cache_gb?: number | null;
	/** O_DIRECT bypass for MoE expert reads (avoids page-cache pollution). */
	moe_stream_direct?: boolean;
	/** Live planner state (not persisted): true while llama-server runs. */
	planner_loaded?: boolean;
	/** n_ctx the running server was started with (null when not loaded). */
	loaded_n_ctx?: number | null;
	/** Model size the running server holds (null when not loaded). */
	loaded_model_size?: string | null;
	/** n_ctx the next load will use under current settings. */
	effective_n_ctx?: number | null;
	/** kv_quant / gpu_layers the running server uses (null when not loaded). */
	loaded_kv_quant?: string | null;
	loaded_gpu_layers?: number | null;
	/** gpu_layers the next load will use under current settings. */
	effective_gpu_layers?: number | null;
	/** True when the TWENTYLABS_LLAMA_GPU_LAYERS env var overrides the UI. */
	gpu_layers_env_override?: boolean;
}

export type AssistantSettingsUpdate = Partial<AssistantSettings>;

export interface ServerPortState {
	/** Port persisted for the next backend start. */
	port: number;
	/** Port this backend process actually bound. */
	current_port: number;
	/** True when a restart is needed to apply the persisted port. */
	needs_restart: boolean;
}

export interface PerformanceSettings {
	/** When true, the app trades RAM for speed: models stay loaded and all UI renders immediately. */
	performance_mode: boolean;
	per_engine_keepalive?: Record<string, boolean>;
}

export type PerformanceSettingsUpdate = Partial<PerformanceSettings>;

export interface TranscriptionRequest {
	language?: LanguageCode;
	model?: WhisperModelSize;
}

export interface TranscriptionResponse {
	text: string;
	duration: number;
}

export interface VocalQAWord {
	word: string;
	start_ms: number;
	end_ms: number;
	confidence: number;
}

export interface VocalQAResult {
	transcribed_text: string;
	wer: number;
	coverage_pct: number;
	missing_words: string[];
	extra_words: string[];
	word_count_ref: number;
	word_count_transcribed: number;
	words: VocalQAWord[];
}

export interface HealthResponse {
	status: string;
	model_loaded: boolean;
	model_downloaded?: boolean;
	model_size?: string;
	gpu_available: boolean;
	gpu_type?: string;
	vram_used_mb?: number;
	vram_total_mb?: number;
	vram_free_mb?: number;
	vram_pressure?: boolean | null;
	ram_total_mb?: number;
	ram_free_mb?: number;
	gpu_compatibility_warning?: string | null;
	backend_type?: string;
	backend_variant?: string; // "cpu" or "cuda"
	subsystems?: Array<{ name: string; healthy: boolean; detail?: string | null }>;
}

export interface EngineHealth {
	engine: string;
	is_loaded: boolean;
	last_used: number | null;
	last_used_ago: number | null;
	always_on: boolean;
	per_engine_keepalive: boolean | null;
	gpu_only: boolean;
	needs_trim: boolean;
}

export interface HealthModelsResponse {
	engines: EngineHealth[];
	models: Array<{ name: string; downloaded: boolean; loaded: boolean }>;
}

export interface HealthCheckResponse {
	name_map: { ok: boolean; missing?: string[]; count?: number; error?: string };
	placeholders: { ok: boolean; count?: number; issues?: string[]; error?: string };
	biome: { ok: boolean; version?: string | null; error?: string };
	ruff: { ok: boolean; version?: string | null; error?: string };
	tsc: { ok: boolean; version?: string | null; error?: string };
	cached_at: number;
}

export interface CudaDownloadProgress {
	model_name: string;
	current: number;
	total: number;
	progress: number;
	filename?: string;
	status: "downloading" | "extracting" | "complete" | "error";
	timestamp: string;
	error?: string;
}

export interface CudaStatus {
	available: boolean; // CUDA binary exists on disk
	active: boolean; // Currently running the CUDA binary
	binary_path?: string;
	downloading: boolean; // Download in progress
	download_progress?: CudaDownloadProgress;
}

export interface ModelProgress {
	model_name: string;
	current: number;
	total: number;
	progress: number;
	filename?: string;
	status: "downloading" | "extracting" | "complete" | "error";
	timestamp: string;
	error?: string;
}

export interface ModelStatus {
	model_name: string;
	display_name: string;
	engine?: string; // backend engine key (e.g. "kokoro")
	hf_repo_id?: string; // HuggingFace repository ID
	quant?: string | null; // quantization/format tag (e.g. "Q8_0") — technical detail
	model_size?: string | null; // size variant tag (e.g. "Q8_0", "2.6B-Q4_0")
	downloaded: boolean;
	entitled?: boolean; // true when a manifest row exists (downloaded via the Models tab)
	downloading: boolean; // True if download in progress
	size_mb?: number;
	loaded: boolean;
	gpu_only?: boolean; // requires CUDA GPU; unsupported on CPU/edge hosts
	// Capability flags — drive engine-unique UI (clone / emotion / tags / design / editing)
	clone_voice?: boolean;
	emotion_control?: boolean;
	supports_instruct?: boolean; // instruct prompt drives delivery
	paralinguistic_tags?: boolean;
	voice_design?: boolean;
	supports_editing?: boolean;
	supported_tags?: string[]; // inline [tag] vocabulary (paralinguistic/emotion)
	// Preset voices — populated for models with built-in voice presets (Kokoro, KittenTTS)
	preset_voices?: PresetVoice[];
	supports_voice_mixing?: boolean; // True for Kokoro (42 voices can be blended)
	license_id?: string;
	license_note?: string;
	commercial_use?: boolean;
	// Quality scoring (0-10) — reflects capability, quality, and value within
	// the model's category. 10 = best-in-class; scores are per-category so
	// TTS scores are only compared against other TTS models, etc.
	category?: string; // tts | stt | llm | music | sfx | vc
	// Performance tags
	preload_priority?: number;
	cold_start_ms?: number;
	warm_start_ms?: number;
	streaming?: boolean;
	execution_provider?: string;
}

export interface HuggingFaceModelInfo {
	id: string;
	author: string;
	lastModified: string;
	pipeline_tag?: string;
	library_name?: string;
	downloads: number;
	likes: number;
	tags: string[];
	siblings?: { rfilename: string }[];
	cardData?: {
		license?: string;
		language?: string[];
		pipeline_tag?: string;
	};
}

export interface ModelStatusListResponse {
	models: ModelStatus[];
}

export interface RecommendedModel {
	model_name: string;
	role: string; // "tts" | "stt" | "llm"
	reason: string;
	downloaded: boolean;
}

export interface RecommendedModelsResponse {
	models: RecommendedModel[];
	missing: RecommendedModel[];
	all_downloaded: boolean;
	current_tts_engine: string | null;
}

// ── Device capabilities ────────────────────────────────────────────────

export interface ModelCompatibility {
	model_name: string;
	compatible: boolean;
	reason: string | null;
	estimated_ram_mb: number;
	estimated_vram_mb: number;
}

export interface ModelCompatibilityInfo {
	model_name: string;
	display_name: string;
	category: string;
	size_mb: number;
	gpu_only: boolean;
	min_ram_mb: number;
	min_vram_mb: number;
	compatible: boolean;
	reason: string | null;
	estimated_ram_mb: number;
	estimated_vram_mb: number;
}

export interface DeviceCapabilitiesResponse {
	total_ram_mb: number;
	available_ram_mb: number;
	total_vram_mb: number;
	free_vram_mb: number;
	gpu_name: string | null;
	gpu_type: string | null;
	cpu_cores: number;
	tier: "low_end" | "mid_range" | "high_end";
	models: ModelCompatibilityInfo[];
}

export interface ModelDownloadRequest {
	model_name: string;
}

export interface ActiveDownloadTask {
	model_name: string;
	status: string;
	started_at: string;
	error?: string;
	progress?: number; // 0-100 percentage
	current?: number; // bytes downloaded
	total?: number; // total bytes
	filename?: string; // current file being downloaded
}

export interface ActiveGenerationTask {
	task_id: string;
	profile_id: string;
	text_preview: string;
	started_at: string;
}

export interface ActiveTasksResponse {
	downloads: ActiveDownloadTask[];
	generations: ActiveGenerationTask[];
}

export interface StoryCreate {
	name: string;
	description?: string;
}

export interface StoryResponse {
	id: string;
	name: string;
	description?: string;
	created_at: string;
	updated_at: string;
	item_count: number;
}

export interface StoryItemDetail {
	id: string;
	story_id: string;
	generation_id: string;
	version_id?: string;
	start_time_ms: number;
	track: number;
	trim_start_ms: number;
	trim_end_ms: number;
	created_at: string;
	profile_id: string;
	profile_name: string;
	text: string;
	language: string;
	audio_path: string;
	duration: number;
	seed?: number;
	instruct?: string;
	engine?: string;
	volume: number;
	fade_in_ms: number;
	fade_out_ms: number;
	gain_db: number;
	pan: number;
	speed?: number;
	generation_created_at: string;
	versions?: GenerationVersionResponse[];
	active_version_id?: string;
}

export interface StoryItemVolumeUpdate {
	volume: number;
}

export interface StoryItemVersionUpdate {
	version_id: string | null;
}

export interface StoryDetailResponse {
	id: string;
	name: string;
	description?: string;
	created_at: string;
	updated_at: string;
	items: StoryItemDetail[];
}

export interface StoryItemCreate {
	generation_id: string;
	start_time_ms?: number;
	track?: number;
}

export interface StoryItemUpdateTime {
	generation_id: string;
	start_time_ms: number;
}

export interface StoryItemBatchUpdate {
	updates: StoryItemUpdateTime[];
}

export interface StoryItemReorder {
	generation_ids: string[];
}

export interface StoryItemMove {
	start_time_ms: number;
	track: number;
}

export interface StoryItemTrim {
	trim_start_ms: number;
	trim_end_ms: number;
}

export interface StoryItemSplit {
	split_time_ms: number;
}

export interface StoryItemMerge {
	first_item_id: string;
	second_item_id: string;
}

export interface StoryItemSpeed {
	speed: number;
}

export interface StoryMatchLoudness {
	target_lufs?: number;
}

export interface StoryItemCrossfade {
	next_item_id: string;
	duration_ms: number;
}

export interface StoryItemMoveToStory {
	target_story_id: string;
	as_copy?: boolean;
}

export interface StoryHistoryDepth {
	undo: number;
	redo: number;
}

export interface SongDraftCreate {
	title: string;
	language: string;
	draft: SongwritingDraftBody;
}

export interface SongDraftResponse {
	id: string;
	title: string;
	language: string;
	draft: SongwritingDraftBody;
	created_at: string;
	updated_at: string;
}

/** Songwriter draft body (camelCase, mirrors Resonant's SongwritingDraft). */
export interface SongwritingDraftBody {
	language: string;
	title: string;
	idea: string;
	hook: string;
	pointOfView: string;
	tense: string;
	mood: string;
	genre: string;
	audience: string;
	imagery: string;
	stylePrompt: string;
	lyrics: string;
}

// Effects

export interface EffectPresetResponse {
	id: string;
	name: string;
	description?: string;
	effects_chain: EffectConfig[];
	is_builtin: boolean;
	created_at: string;
}

export interface EffectPresetCreate {
	name: string;
	description?: string;
	effects_chain: EffectConfig[];
}

export interface EffectPresetUpdate {
	name?: string;
	description?: string;
	effects_chain?: EffectConfig[];
}

export interface AvailableEffectParam {
	default: number;
	min: number;
	max: number;
	step: number;
	description: string;
}

export interface AvailableEffect {
	type: string;
	label: string;
	description: string;
	params: Record<string, AvailableEffectParam>;
}

export interface AvailableEffectsResponse {
	effects: AvailableEffect[];
}

export interface ApplyEffectsRequest {
	effects_chain: EffectConfig[];
	source_version_id?: string;
	label?: string;
	set_as_default?: boolean;
}

/* ─── MCP ─────────────────────────────────────────────────────────────── */

export interface MCPClientBinding {
	client_id: string;
	label: string | null;
	profile_id: string | null;
	default_engine: string | null;
	default_personality: boolean;
	last_seen_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MCPClientBindingUpsert {
	client_id: string;
	label?: string | null;
	profile_id?: string | null;
	default_engine?: string | null;
	default_personality?: boolean;
}

export interface MCPClientBindingListResponse {
	items: MCPClientBinding[];
}

export interface PitchSegment {
	start_sample: number;
	end_sample: number;
	frequency: number;
	confidence: number;
	midi_note: number;
	note_name: string;
}

export const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const SCALE_PENTATONIC = [0, 2, 4, 7, 9];
export const SCALE_BLUES = [0, 3, 5, 6, 7, 10];
export const SCALE_CHROMATIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export interface SessionResponse {
	id: string;
	name: string;
	data: Record<string, unknown>;
	is_autosave: boolean;
	created_at: string;
	updated_at: string;
}

export interface AutomationParameterDef {
	name: string;
	min: number;
	max: number;
	default: number;
}

export type AutomationParameters = Record<string, AutomationParameterDef>;

export interface CrossfadeCurveDef {
	name: string;
	description: string;
}

export type CrossfadeCurves = Record<string, CrossfadeCurveDef>;

export interface ConversationPresets {
	presets: Record<string, unknown>;
}

export interface SpatialPresets {
	presets: Array<{
		name: string;
		position: { x: number; y: number; z: number };
	}>;
}

export interface ConvolutionPresets {
	environments: Array<{
		name: string;
		ir_path: string;
		wet_dry_default: number;
	}>;
}

export interface ExportPreset {
	name: string;
	description: string;
	format: string;
	sample_rate: number;
	bit_depth: number;
	channels: string;
	target_lufs: number;
	true_peak_limit_db: number;
}

export interface ExportPresets {
	[key: string]: ExportPreset;
}

export interface PluginChainEntry {
	plugin_id: string;
	params: Record<string, number>;
	enabled?: boolean;
}

export interface CapabilityEngineInfo {
	label: string;
	available: boolean;
	always_on: boolean;
	note?: string;
}

export interface ModelCapabilitiesResponse {
	product: string;
	offline_only: boolean;
	idle_unload_seconds: number;
	engines: Record<string, CapabilityEngineInfo>;
	loaded_now: Record<string, boolean>;
	llm_context: {
		default_model_size: string;
		current_n_ctx: number;
		min_n_ctx: number;
		max_n_ctx: number;
		by_size: Record<string, number>;
		max_by_size?: Record<string, number>;
		note?: string;
	};
	kv_quant?: {
		current: string;
		options: string[];
		note?: string;
	};
}

export interface Feature {
	id: string;
	name: string;
	category: string;
	summary: string;
	where: string;
	tools: string[];
	keywords: string[];
}

export interface HelpSearchResult {
	id: string;
	name: string;
	category: string;
	summary: string;
	where: string;
	tools: string[];
	score: number;
}

// ---- In-app content (offline announcements / offers / support) ----
export interface WhatsNewEntry {
	version: string;
	title: string;
	date: string;
	highlights: string[];
	link?: { label: string; to: string };
}

export type AnnouncementSeverity = "info" | "success" | "warning" | "promo";

export interface Announcement {
	id: string;
	title: string;
	message: string;
	severity: AnnouncementSeverity;
	cta?: { label: string; to: string };
	starts_at?: string;
	ends_at?: string;
}

export interface Offer {
	id: string;
	title: string;
	description: string;
	badge?: string;
	promo_code?: string;
	discount_label?: string;
	cta?: { label: string; to: string };
	starts_at?: string;
	ends_at?: string;
}

export type SupportCategory =
	| "bug"
	| "feature"
	| "billing"
	| "account"
	| "feedback"
	| "other";

export interface SupportRequestPayload {
	name?: string;
	email?: string;
	category: SupportCategory;
	message: string;
	logs_attached?: boolean;
}

export interface SupportResponse {
	status: "received";
	id: string;
	received_at?: string;
}

// ---- Marketplace catalog / licensing ----
export interface MarketplaceProduct {
	id: string;
	name: string;
	category: string;
	description?: string;
	long_description?: string;
	price_usd: number;
	paid: boolean;
	coming_soon?: boolean;
	localized_price?: string;
	note?: string;
	avg_rating?: number;
	quality_rating?: number;
	review_count?: number;
	size_mb?: number;
	languages?: string[];
	license?: string;
	use_cases?: string[];
	special_offer?: boolean;
	offer_discount_pct?: number;
	baseline_usd?: number;
	discount_pct?: number;
	/** Install state annotated by GET /marketplace/catalog (and /local):
	 *  "cached" (one-step activate) or "not_downloaded" (route to install). */
	local_status?: "cached" | "not_downloaded";
}

export interface Catalog {
	schema_version: number;
	signed_at: string;
	currency: string;
	products: MarketplaceProduct[];
	sig?: string;
	offline_fallback?: boolean;
}

/** Result of POST /marketplace/catalog/refresh — reason explains a no-op
 *  ("fresh" stale-gate skip, "no_url" remote unconfigured) and surfaces
 *  genuine failures ("failed") so the Store can hint instead of staying
 *  silent. Null when the catalog was refreshed. */
export interface CatalogRefreshResult {
	refreshed: boolean;
	reason: "fresh" | "no_url" | "failed" | null;
}

export interface EntitlementResponse {
	entitlements: string[];
}

export interface LicenseRecord {
	product_id: string;
	name: string;
	type: "free" | "paid" | "trial";
	status: "active" | "expired" | "pending";
	expires_at?: string;
}

export interface LicensesResponse {
	licenses: LicenseRecord[];
}

export interface LibraryTag {
	id: string;
	name: string;
	color?: string | null;
	created_at: string;
}

export interface LibraryItem {
	id: string;
	kind: "generation" | "capture" | "profile_sample" | "generation_version" | string;
	title: string;
	audio_path?: string | null;
	audio_url?: string | null;
	duration?: number | null;
	duration_ms?: number | null;
	created_at?: string | null;
	status?: string | null;
	source?: string | null;
	profile_name?: string | null;
	engine?: string | null;
	tags: LibraryTag[];
}

export interface LibraryListResponse {
	items: LibraryItem[];
	total: number;
	page: number;
	limit: number;
}

// Mirrors backend/routes/plugins_marketplace.py `_serialize`.
export interface MarketplacePlugin {
	plugin_id: string;
	name: string;
	version: string;
	developer: string | null;
	kind: string | null;
	enabled: boolean;
	verified: boolean;
	trust_external: boolean;
	external_command: string | null;
	permissions: string[];
	install_path: string | null;
}

// ---------------------------------------------------------------------------
// Launcher session types (ported from Resonant)
// ---------------------------------------------------------------------------

export interface LauncherTrackPayload {
	id: string;
	name: string;
	kind: string;
	color: string;
	volume: number;
	pan: number;
	mute: boolean;
	solo: boolean;
	sessionSlots: Array<string | null>;
}

export interface LauncherClipPayload {
	id: string;
	type: string;
	name: string;
	color: string;
	lengthBeats: number;
	// Audio clip fields (optional for MIDI clips)
	sampleRate?: number;
	channels?: number;
	frames?: number;
	audioPath?: string;
	waveformPeaks?: number[];
	trimStart?: number;
	trimEnd?: number;
	gain?: number;
	volumeAutomation?: number[];
	// MIDI clip fields
	notes?: Array<{
		id: string;
		step: number;
		pitch: number;
		velocity: number;
		durationSteps: number;
	}>;
}

export interface LauncherSessionPayload {
	name: string;
	bpm: number;
	masterVolume: number;
	tracks: LauncherTrackPayload[];
	clips: Record<string, LauncherClipPayload>;
	numScenes: number;
}

export interface LauncherSessionCreate {
	name: string;
	session: LauncherSessionPayload;
}

export interface LauncherSessionResponse {
	id: string;
	name: string;
	session: LauncherSessionPayload;
	createdAt: string;
	updatedAt: string;
}

export interface LauncherCaptureRequest {
	activeClips?: Record<string, string | null> | null;
}

export interface LauncherCaptureResponse {
	audioPath: string;
	filename: string;
	durationS: number;
	sampleRate: number;
}

export interface InstrumentPackInstrument {
	id: string;
	name: string;
	family: string;
	variant?: string;
	program: number;
	bankMSB: number;
	bankLSB: number;
	percussion: boolean;
	format: string;
}

export interface InstrumentPackCreate {
	name: string;
	version?: string;
	format?: string;
	source?: string;
}

export interface InstrumentPackResponse {
	id: string;
	name: string;
	version: string;
	format: string;
	bytes: number;
	source?: string;
	instruments: InstrumentPackInstrument[];
	installedAt: string;
}

export interface InstrumentUploadResponse {
	pack: InstrumentPackResponse;
	instrumentCount: number;
}

export interface CloudLlmResponse {
	choices?: { message?: { content?: string } }[];
}
