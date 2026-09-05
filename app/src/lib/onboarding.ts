/**
 * Per-tab first-steps registry. One entry per primary tab: a title, at
 * most three one-line steps, and an optional deep link. Content is
 * capability-level on purpose — it must stay true while screens are
 * rebuilt around it (03). Tabs without an entry get no intro.
 *
 * Copy rules: plain verbs, no button labels (labels move), no promises
 * about screens that don't exist yet.
 */

export interface TabIntroLink {
	to: string;
	label: string;
}

export interface TabIntro {
	tabId: string;
	title: string;
	steps: [string, string] | [string, string, string];
	link?: TabIntroLink;
	helpLink?: boolean;
}

const INTROS: TabIntro[] = [
	{
		tabId: "generate",
		title: "Generate speech",
		steps: [
			"Pick a voice profile to speak with.",
			"Type or paste your script and tune the engine settings.",
			"Generate, play, and find every take in History.",
		],
		link: { to: "/voices", label: "Open Voices" },
	},
	{
		tabId: "stories",
		title: "Stories",
		steps: [
			"Add generated clips as lines in a story.",
			"Arrange their order and timing.",
			"Export one mixed file — or a portable archive to move machines.",
		],
	},
	{
		tabId: "audiobooks",
		title: "Audiobooks",
		steps: [
			"Import an EPUB or PDF.",
			"Cast a voice per character.",
			"Render chapters and export the finished audiobook.",
		],
	},
	{
		tabId: "voices",
		title: "Voice profiles",
		steps: [
			"Clone from a short sample, or start from a preset.",
			"Shape the result with the effects chain.",
			"Set a default so generation uses it automatically.",
		],
	},
	{
		tabId: "captures",
		title: "Captures",
		steps: [
			"Record audio or dictate straight into text.",
			"Review the automatic transcript.",
			"Send the result to generation or into a story.",
		],
	},
	{
		tabId: "effects",
		title: "Effects",
		steps: [
			"Chain from 25+ effects and processors.",
			"Preview any chain on a real clip first.",
			"Save chains you reuse as presets.",
		],
	},
	{
		tabId: "models",
		title: "Models",
		steps: [
			"Download engines with one click.",
			"Activate to load one into memory.",
			"Status tells you loading, ready, or unloaded.",
		],
		link: { to: "/store", label: "Browse the Store" },
	},
	{
		tabId: "store",
		title: "Store",
		steps: [
			"Browse free and premium models.",
			"Buying installs the license by itself — then Install to download.",
			"Donations keep Otoyin independent, no subscription anywhere.",
		],
	},
	{
		tabId: "settings",
		title: "Settings",
		steps: [
			"Server address, appearance, and language live here.",
			"Telemetry and crash reports are off by default — opt in deliberately.",
		],
		helpLink: true,
	},
	{
		tabId: "workspace",
		title: "Workspace",
		steps: [
			"Your project surfaces live here.",
			"Pick one up where you left off, or start something new.",
		],
	},
	{
		tabId: "timeline",
		title: "Timeline",
		steps: [
			"Clips sit on tracks against time.",
			"Trim, split, and fade regions in place.",
		],
	},
	{
		tabId: "mixer",
		title: "Mixer",
		steps: [
			"Balance track levels against live meters.",
			"Route buses and master the final loudness.",
		],
	},
	{
		tabId: "studio",
		title: "Audio Studio",
		steps: [
			"Waveform editing with transcript assist.",
			"Apply effects per region, then export or hand off to a story.",
		],
	},
	{
		tabId: "dubbing",
		title: "Dubbing",
		steps: [
			"Transcribe the source video.",
			"Re-voice it in another language.",
			"Mux the new audio back and export.",
		],
	},
	{
		tabId: "instruments",
		title: "Instruments",
		steps: [
			"Play GM instruments, synth notes, and the drum machine.",
			"Render hits to clips you can arrange elsewhere.",
		],
	},
	{
		tabId: "telemetry",
		title: "Telemetry",
		steps: [
			"Usage stats live here — and only here.",
			"Everything stays on this device unless you opt in.",
		],
	},
	{
		tabId: "dsp",
		title: "DSP tools",
		steps: [
			"Analysis and processing utilities live here.",
			"Each tool explains its own inputs on screen.",
		],
	},
	{
		tabId: "adr",
		title: "ADR",
		steps: [
			"Record takes against a guide track.",
			"Auto-pick the best regions, then assemble.",
		],
	},
];

const BY_TAB = new Map(INTROS.map((intro) => [intro.tabId, intro]));

/** Route path → tab id. First matching segment wins; unknown → null. */
export function tabIdForPath(pathname: string): string | null {
	const segment = pathname.split("/").filter(Boolean)[0] ?? "";
	if (segment === "") {
		return "generate";
	}
	return BY_TAB.has(segment) ? segment : null;
}

export function introForTab(tabId: string): TabIntro | undefined {
	return BY_TAB.get(tabId);
}

export function introForPath(pathname: string): TabIntro | undefined {
	const tabId = tabIdForPath(pathname);
	return tabId ? BY_TAB.get(tabId) : undefined;
}
