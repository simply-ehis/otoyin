/**
 * Shared voice-design option maps — single source of truth for both
 * VoiceDesignPanel copies (features/voices + components/VoiceProfiles).
 * Accents are grouped by region/nationality; styles by use-case, so the
 * picker shows what each choice is for instead of a flat word list.
 */

export const GENDER_OPTIONS = [
	{ value: "female", label: "Female" },
	{ value: "male", label: "Male" },
	{ value: "non_binary", label: "Non-binary" },
] as const;

export const AGE_OPTIONS = [
	{ value: "child", label: "Child" },
	{ value: "teen", label: "Teen" },
	{ value: "young_adult", label: "Young adult" },
	{ value: "adult", label: "Adult" },
	{ value: "middle_aged", label: "Middle-aged" },
	{ value: "senior", label: "Senior" },
] as const;

export interface AccentGroup {
	label: string;
	accents: { value: string; label: string }[];
}

export const ACCENT_GROUPS: AccentGroup[] = [
	{
		label: "Americas",
		accents: [
			{ value: "american", label: "American" },
			{ value: "canadian", label: "Canadian" },
			{ value: "brazilian", label: "Brazilian" },
			{ value: "mexican", label: "Mexican" },
			{ value: "caribbean", label: "Caribbean" },
		],
	},
	{
		label: "British Isles",
		accents: [
			{ value: "british", label: "British" },
			{ value: "irish", label: "Irish" },
			{ value: "scottish", label: "Scottish" },
		],
	},
	{
		label: "Europe",
		accents: [
			{ value: "french", label: "French" },
			{ value: "german", label: "German" },
			{ value: "spanish", label: "Spanish" },
			{ value: "italian", label: "Italian" },
			{ value: "russian", label: "Russian" },
		],
	},
	{
		label: "Asia-Pacific",
		accents: [
			{ value: "indian", label: "Indian" },
			{ value: "japanese", label: "Japanese" },
			{ value: "chinese", label: "Chinese" },
			{ value: "korean", label: "Korean" },
			{ value: "australian", label: "Australian" },
			{ value: "new_zealand", label: "New Zealand" },
		],
	},
	{
		label: "Africa & Middle East",
		accents: [
			{ value: "arabic", label: "Arabic" },
			{ value: "african", label: "African" },
			{ value: "south_african", label: "South African" },
		],
	},
];

export const ACCENT_OPTIONS = ACCENT_GROUPS.flatMap((g) => g.accents);

export const ACCENT_LABEL_BY_VALUE: Record<string, string> =
	Object.fromEntries(ACCENT_OPTIONS.map((o) => [o.value, o.label]));

export interface StyleGroup {
	label: string;
	help: string;
	styles: { value: string; label: string }[];
}

export const STYLE_GROUPS: StyleGroup[] = [
	{
		label: "Narrative",
		help: "Long-form reads: audiobooks, news, documentaries.",
		styles: [
			{ value: "narrative", label: "Narrative" },
			{ value: "storytelling", label: "Storytelling" },
			{ value: "newsreader", label: "Newsreader" },
			{ value: "formal", label: "Formal" },
		],
	},
	{
		label: "Conversational",
		help: "Dialogue and assistants: podcasts, chats, explainers.",
		styles: [
			{ value: "conversational", label: "Conversational" },
			{ value: "casual", label: "Casual" },
			{ value: "friendly", label: "Friendly" },
			{ value: "gentle", label: "Gentle" },
		],
	},
	{
		label: "Expressive",
		help: "High-energy delivery: trailers, ads, announcements.",
		styles: [
			{ value: "dramatic", label: "Dramatic" },
			{ value: "enthusiastic", label: "Enthusiastic" },
			{ value: "energetic", label: "Energetic" },
			{ value: "commanding", label: "Commanding" },
			{ value: "authoritative", label: "Authoritative" },
		],
	},
	{
		label: "Calm",
		help: "Low-energy delivery: meditation, bedtime, soothing.",
		styles: [
			{ value: "calm", label: "Calm" },
			{ value: "soothing", label: "Soothing" },
			{ value: "whispered", label: "Whispered" },
		],
	},
];

export const STYLE_OPTIONS = STYLE_GROUPS.flatMap((g) => g.styles);

export const TONE_OPTIONS = [
	{ value: "warm", label: "Warm" },
	{ value: "bright", label: "Bright" },
	{ value: "soft", label: "Soft" },
	{ value: "deep", label: "Deep" },
	{ value: "husky", label: "Husky" },
	{ value: "clear", label: "Clear" },
	{ value: "smooth", label: "Smooth" },
	{ value: "rough", label: "Rough" },
	{ value: "raspy", label: "Raspy" },
	{ value: "silky", label: "Silky" },
	{ value: "resonant", label: "Resonant" },
	{ value: "breathy", label: "Breathy" },
	{ value: "rich", label: "Rich" },
	{ value: "light", label: "Light" },
	{ value: "mellow", label: "Mellow" },
	{ value: "crisp", label: "Crisp" },
] as const;

export const PACING_OPTIONS = [
	{ value: "slow", label: "Slow" },
	{ value: "moderate", label: "Moderate" },
	{ value: "fast", label: "Fast" },
] as const;

export const ATTRIBUTE_OPTIONS: Record<
	string,
	readonly { value: string; label: string }[]
> = {
	gender: GENDER_OPTIONS,
	age: AGE_OPTIONS,
	accent: ACCENT_OPTIONS,
	tone: TONE_OPTIONS,
	style: STYLE_OPTIONS,
	pacing: PACING_OPTIONS,
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
	gender: "Gender",
	age: "Age",
	accent: "Accent / Nationality",
	tone: "Tone",
	style: "Speaking Style",
	pacing: "Pacing",
};
