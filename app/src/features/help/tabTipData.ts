/**
 * One-time tips shown once per tab (design doc S10). Keys match route
 * paths (same convention as TAB_HELP_DATA). Falling back to
 * TAB_HELP_DATA[path].tips[0] happens in TabTip when a path has no entry
 * here.
 */
export const TAB_TIP_DATA: Record<string, string> = {
	"/": "Ctrl+Enter generates straight from the script box.",
	"/voices":
		"Preset voices work immediately; clones need a 10–30 s reference clip.",
	"/voice-converter":
		"Live conversion from the mic works without importing a file.",
	"/songwriter":
		"Give the assistant style, mood and tempo — drafts come out much closer.",
	"/sounds":
		"Search results preview inline; favorites carry over between sessions.",
	"/conversation": "Each speaker can use a different cloned or preset voice.",
	"/audio-studio": "Tracks can be recorded straight in, no export step needed.",
	"/stories": "Create character profiles first, then assign them per line.",
	"/launcher":
		"Scenes trigger every track in a row at once — build them as arrangement blocks.",
	"/instruments": "Drop a .sf2 SoundFont onto the panel to import it.",
	"/audiobooks":
		"Paste the full chapter text; casting assigns voices automatically.",
	"/mixer": "Double-click a fader to reset it to unity.",
	"/studio":
		"Workspace tools share the same audio session — nothing is copied between them.",
	"/comping": "Mark from the playhead with number keys to stitch fast.",
	"/spatial":
		"Distance and gain are separate controls — attenuation comes from distance alone.",
	"/dsp": "Chain order matters; audition each block in isolation first.",
	"/automation": "Record knob moves live instead of drawing them.",
	"/timeline": "Split clips at the playhead with the split shortcut.",
	"/batch":
		"Batch jobs survive closing this tab — check progress here or in History.",
	"/audio-plan": "Export the plan as a document to hand to a producer.",
	"/captures": "Captures transcribe automatically in the background.",
	"/translate":
		"Review the translation before synthesis — names and brands often need fixing.",
	"/pitch": "Pitch events are editable — drag a note to retune it.",
	"/spectrogram":
		"Narrow-band view is best for hums; wide-band for transients.",
	"/diarize": "Short, clean recordings give much tighter speaker turns.",
	"/transcript":
		"Fixing one wrong word and re-rendering beats fixing the whole take.",
	"/effects": "Save a chain as a preset to reuse it across tracks.",
	"/noise-reduction": "Less is more — over-processing sounds watery.",
	"/audio-enhance": "Compare before/after with the A/B toggle.",
	"/vocal-isolation": "Best on finished mixes, not live off-axis recordings.",
	"/export":
		"Platform presets enforce loudness and true-peak limits automatically.",
	"/dubbing":
		"Match source tone, not just timing — listen to a few seconds before rendering.",
	"/adr": "Lip timing is matched automatically; you only fix meaning.",
	"/video": "The audio mix renders with the export — no separate mux step.",
	"/download": "Downloads resume automatically if interrupted.",
	"/music-gen": "Reference tracks help more than long descriptions.",
	"/help": "Help is fully offline — search any feature, shortcut or error.",
	"/whats-new": "What's new appears once per update, not once per visit.",
	"/projects": "Projects autosave — close the app any time.",
};
