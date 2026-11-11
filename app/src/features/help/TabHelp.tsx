import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";

export interface TabHelpItem {
	/** What this tab does */
	what: string;
	/** Key actions available */
	actions: { label: string; shortcut?: string }[];
	/** Tips for getting started */
	tips?: string[];
}

/** Help content for every major tab. Keys match route paths. */
export const TAB_HELP_DATA: Record<string, TabHelpItem> = {
	"/": {
		what: "Generate speech from text using AI voices.",
		actions: [
			{ label: "Pick a voice", shortcut: "" },
			{ label: "Type your script", shortcut: "" },
			{ label: "Generate audio", shortcut: "Ctrl+Enter" },
			{ label: "Import a voice", shortcut: "" },
		],
		tips: [
			"Start by selecting a voice from the dropdown, then type your script.",
			"Click 'More' to access effects, temperature, and other advanced settings.",
		],
	},
	"/voices": {
		what: "Create, manage, and clone voice profiles.",
		actions: [
			{ label: "Create a new voice", shortcut: "" },
			{ label: "Clone from audio", shortcut: "" },
			{ label: "Import a voice pack", shortcut: "" },
		],
		tips: [
			"Clone voices need a short reference audio clip (10-30 seconds).",
			"Preset voices are ready to use immediately.",
		],
	},
	"/stories": {
		what: "Write and produce multi-line dialogue scripts.",
		actions: [
			{ label: "Create a new story", shortcut: "" },
			{ label: "Add dialogue lines", shortcut: "" },
			{ label: "Assign voices per character", shortcut: "" },
			{ label: "Generate all lines", shortcut: "" },
		],
		tips: [
			"Create character profiles first, then assign them to story lines.",
			"Use 'Generate from Text' to quickly add lines from a script.",
		],
	},
	"/audiobooks": {
		what: "Produce full-length narrated audiobooks.",
		actions: [
			{ label: "Import a script or EPUB", shortcut: "" },
			{ label: "Paste text directly", shortcut: "" },
			{ label: "Cast voices per character", shortcut: "" },
			{ label: "Render chapters", shortcut: "" },
		],
	},
	"/audio-studio": {
		what: "Multi-track audio workspace for mixing and editing.",
		actions: [
			{ label: "Add audio tracks", shortcut: "" },
			{ label: "Apply effects", shortcut: "" },
			{ label: "Mix and master", shortcut: "" },
			{ label: "Export audio", shortcut: "" },
		],
	},
	"/workspace": {
		what: "Advanced audio tools: voice changer, mixer, effects, spatial audio.",
		actions: [
			{ label: "Voice changer", shortcut: "" },
			{ label: "Mixer", shortcut: "" },
			{ label: "Effects rack", shortcut: "" },
			{ label: "Spatial audio", shortcut: "" },
		],
	},
	"/instruments": {
		what: "Virtual instruments and SoundFont playback.",
		actions: [
			{ label: "Import SoundFont packs", shortcut: "" },
			{ label: "Play instrument notes", shortcut: "" },
			{ label: "Render MIDI patterns", shortcut: "" },
		],
		tips: [
			"Drag and drop .sf2 or .sf3 SoundFont files to import them.",
			"Free SoundFonts are available at freesound.org and musescore.org.",
		],
	},
	"/effects": {
		what: "Audio effects presets and chains.",
		actions: [
			{ label: "Create an effects preset", shortcut: "" },
			{ label: "Apply effects to audio", shortcut: "" },
			{ label: "Chain multiple effects", shortcut: "" },
		],
	},
	"/captures": {
		what: "Record and manage audio captures.",
		actions: [
			{ label: "Start a capture", shortcut: "" },
			{ label: "Review captured audio", shortcut: "" },
			{ label: "Export captures", shortcut: "" },
		],
	},
	"/settings": {
		what: "Configure server connection, language, theme, and app behavior.",
		actions: [
			{ label: "Set server URL", shortcut: "" },
			{ label: "Change language", shortcut: "" },
			{ label: "Toggle theme", shortcut: "" },
		],
	},
	"/library": {
		what: "Browse and manage your audio library.",
		actions: [
			{ label: "Browse generated audio", shortcut: "" },
			{ label: "Organize into folders", shortcut: "" },
			{ label: "Export or share", shortcut: "" },
		],
	},
	"/store": {
		what: "Browse and download voice packs and effects from the marketplace.",
		actions: [
			{ label: "Browse voice packs", shortcut: "" },
			{ label: "Download effects", shortcut: "" },
			{ label: "Manage installed packs", shortcut: "" },
		],
	},
	"/voice-converter": {
		what: "Convert a voice — live from your mic or from a file — into another voice.",
		actions: [
			{ label: "Pick a target voice", shortcut: "" },
			{ label: "Choose source (mic / file)", shortcut: "" },
			{ label: "Start conversion", shortcut: "" },
		],
	},
	"/songwriter": {
		what: "Write lyrics and song structures with an AI writing partner.",
		actions: [
			{ label: "Create a song outline", shortcut: "" },
			{ label: "Write or revise verses", shortcut: "" },
			{ label: "Send to a voice for singing", shortcut: "" },
		],
		tips: ["Give the assistant a style, mood, and tempo to shape the draft."],
	},
	"/sounds": {
		what: "Find and download sound effects from the shared library (Freesound).",
		actions: [
			{ label: "Search sound effects", shortcut: "" },
			{ label: "Preview and add to a project", shortcut: "" },
			{ label: "Manage favorites", shortcut: "" },
		],
	},
	"/conversation": {
		what: "Generate multi-voice scripted conversations with per-speaker voices.",
		actions: [
			{ label: "Add speakers", shortcut: "" },
			{ label: "Write the dialogue", shortcut: "" },
			{ label: "Assign voices and generate", shortcut: "" },
		],
	},
	"/mixer": {
		what: "Mix levels, pan, mute and solo across your project's tracks.",
		actions: [
			{ label: "Adjust channel faders", shortcut: "" },
			{ label: "Set pan and mute/solo", shortcut: "" },
			{ label: "Balance the full mix", shortcut: "" },
		],
	},
	"/studio": {
		what: "Workspace hub: advanced audio tools side by side.",
		actions: [
			{ label: "Open a workspace tool", shortcut: "" },
			{ label: "Route audio between tools", shortcut: "" },
		],
	},
	"/comping": {
		what: "Compare multiple takes and stitch the best parts into one.",
		actions: [
			{ label: "Load takes", shortcut: "" },
			{ label: "Mark the best segments", shortcut: "" },
			{ label: "Build the composite", shortcut: "" },
		],
	},
	"/spatial": {
		what: "Place sources in a 3D sound field and mix with binaural rendering.",
		actions: [
			{ label: "Add and position sources", shortcut: "" },
			{ label: "Set distance and gain", shortcut: "" },
			{ label: "Render and preview the mix", shortcut: "" },
		],
	},
	"/dsp": {
		what: "Real-time DSP processing on the audio path: filters and routing.",
		actions: [
			{ label: "Choose a DSP block", shortcut: "" },
			{ label: "Wire it into the chain", shortcut: "" },
			{ label: "Monitor the output", shortcut: "" },
		],
	},
	"/automation": {
		what: "Automate volume, pan and parameter curves across the timeline.",
		actions: [
			{ label: "Pick an automation lane", shortcut: "" },
			{ label: "Draw or record points", shortcut: "" },
			{ label: "Play back the move", shortcut: "" },
		],
	},
	"/timeline": {
		what: "Arrange clips on a multi-track timeline.",
		actions: [
			{ label: "Add or move clips", shortcut: "" },
			{ label: "Trim and split", shortcut: "" },
			{ label: "Export the arrangement", shortcut: "" },
		],
	},
	"/batch": {
		what: "Run many generations or conversions as a queued batch.",
		actions: [
			{ label: "Queue a batch job", shortcut: "" },
			{ label: "Watch progress", shortcut: "" },
			{ label: "Collect results", shortcut: "" },
		],
	},
	"/audio-plan": {
		what: "Plan a scene or pre-production: cues, lines, and sound design notes.",
		actions: [
			{ label: "Create a scene plan", shortcut: "" },
			{ label: "List cues and lines", shortcut: "" },
			{ label: "Export for production", shortcut: "" },
		],
	},
	"/translate": {
		what: "Translate speech or clips between languages.",
		actions: [
			{ label: "Pick source and target language", shortcut: "" },
			{ label: "Translate a clip", shortcut: "" },
			{ label: "Review and export", shortcut: "" },
		],
	},
	"/pitch": {
		what: "Visual pitch map of a take — inspect contours and correct notes.",
		actions: [
			{ label: "Load a take", shortcut: "" },
			{ label: "Inspect pitch events", shortcut: "" },
			{ label: "Apply corrections", shortcut: "" },
		],
	},
	"/spectrogram": {
		what: "Spectrogram view of the frequency content over time.",
		actions: [
			{ label: "Load audio", shortcut: "" },
			{ label: "Zoom and inspect bands", shortcut: "" },
		],
	},
	"/diarize": {
		what: "Speaker diarization: who spoke when in a recording.",
		actions: [
			{ label: "Import a recording", shortcut: "" },
			{ label: "Run diarization", shortcut: "" },
			{ label: "Label the speakers", shortcut: "" },
		],
	},
	"/transcript": {
		what: "Edit a transcript word by word — click a word, fix it, re-render.",
		actions: [
			{ label: "Open a transcription", shortcut: "" },
			{ label: "Edit words inline", shortcut: "" },
			{ label: "Re-synthesize the take", shortcut: "" },
		],
	},
	"/noise-reduction": {
		what: "Remove background noise from a recording.",
		actions: [
			{ label: "Load audio", shortcut: "" },
			{ label: "Run noise reduction", shortcut: "" },
			{ label: "A/B against the original", shortcut: "" },
		],
	},
	"/audio-enhance": {
		what: "Enhance clarity, warmth and presence of a voice recording.",
		actions: [
			{ label: "Load audio", shortcut: "" },
			{ label: "Pick an enhancement profile", shortcut: "" },
			{ label: "Render and compare", shortcut: "" },
		],
	},
	"/vocal-isolation": {
		what: "Separate vocals from a mix (stem separation).",
		actions: [
			{ label: "Load a mix", shortcut: "" },
			{ label: "Run vocal isolation", shortcut: "" },
			{ label: "Export the stems", shortcut: "" },
		],
	},
	"/export": {
		what: "Export for platforms: loudness targets and delivery formats.",
		actions: [
			{ label: "Pick a platform preset", shortcut: "" },
			{ label: "Check loudness", shortcut: "" },
			{ label: "Export", shortcut: "" },
		],
	},
	"/adr": {
		what: "Automated dialogue replacement: revoice lines to match on-screen lip timing.",
		actions: [
			{ label: "Load the video and takes", shortcut: "" },
			{ label: "Mark lines to replace", shortcut: "" },
			{ label: "Render the ADR track", shortcut: "" },
		],
	},
	"/video": {
		what: "Preview video with the audio work attached.",
		actions: [
			{ label: "Load a video", shortcut: "" },
			{ label: "Scrub with audio", shortcut: "" },
			{ label: "Export with mixed audio", shortcut: "" },
		],
	},
	"/download": {
		what: "Download media and model packs for offline use.",
		actions: [
			{ label: "Browse downloads", shortcut: "" },
			{ label: "Start a download", shortcut: "" },
		],
	},
	"/music-gen": {
		what: "Generate original music from a text prompt or reference.",
		actions: [
			{ label: "Describe the track", shortcut: "" },
			{ label: "Pick a model", shortcut: "" },
			{ label: "Generate and iterate", shortcut: "" },
		],
	},
	"/help": {
		what: "Searchable help for every feature, offline.",
		actions: [
			{ label: "Search features", shortcut: "" },
			{ label: "Browse by area", shortcut: "" },
		],
	},
	"/whats-new": {
		what: "What's new in the latest updates.",
		actions: [{ label: "Read release highlights", shortcut: "" }],
	},
	"/projects": {
		what: "Browse and open your saved projects.",
		actions: [
			{ label: "Open a project", shortcut: "" },
			{ label: "Create a project", shortcut: "" },
		],
	},
};

interface TabHelpProps {
	/** Current tab path (e.g. "/" or "/voices") */
	tabPath: string;
	/** Optional className */
	className?: string;
}

/**
 * Small "Learn" button that opens a popover with context-sensitive help
 * for the current tab. Shows what the tab does, key actions, and tips.
 */
export function TabHelp({ tabPath, className }: TabHelpProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const help = TAB_HELP_DATA[tabPath];

	if (!help) {
		return null;
	}

	return (
		<div className={cn("relative inline-flex", className)}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				title={t("tabHelp.learn", "Learn about this tab")}
				aria-label={t("tabHelp.learn", "Learn about this tab")}
				aria-expanded={open}
			>
				<QuestionMarkCircleIcon className="size-3.5" aria-hidden="true" />
				<span className="hidden sm:inline">Learn</span>
			</button>

			{open ? (
				<>
					<div
						aria-hidden="true"
						className="fixed inset-0 z-40"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setOpen(false);
							}
						}}
					/>
					<div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-card p-3 shadow-lg">
						<p className="text-sm font-medium text-foreground">{help.what}</p>

						{help.actions.length > 0 ? (
							<div className="mt-2">
								<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
									{t("tabHelp.keyActions", "Key actions")}
								</p>
								<ul className="mt-1 space-y-1">
									{help.actions.map((action) => (
										<li
											key={action.label}
											className="flex items-center justify-between text-xs text-muted-foreground"
										>
											<span>{action.label}</span>
											{action.shortcut ? (
												<kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70">
													{action.shortcut}
												</kbd>
											) : null}
										</li>
									))}
								</ul>
							</div>
						) : null}

						{help.tips && help.tips.length > 0 ? (
							<div className="mt-2 border-t border-border pt-2">
								<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
									{t("tabHelp.tips", "Tips")}
								</p>
								<ul className="mt-1 space-y-1">
									{help.tips.map((tip) => (
										<li
											key={tip}
											className="text-xs leading-relaxed text-muted-foreground"
										>
											{tip}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				</>
			) : null}
		</div>
	);
}
