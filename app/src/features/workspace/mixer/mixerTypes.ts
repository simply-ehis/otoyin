export interface ChannelState {
	id: string;
	name: string;
	volume: number;
	pan: number;
	muted: boolean;
	soloed: boolean;
	clipId?: string;
	audioUrl?: string;
}

export function isChannelState(v: unknown): v is ChannelState {
	if (typeof v !== "object" || v === null) {
		return false;
	}
	const c = v as Record<string, unknown>;
	return (
		typeof c.id === "string" &&
		typeof c.name === "string" &&
		typeof c.volume === "number" &&
		typeof c.pan === "number" &&
		typeof c.muted === "boolean" &&
		typeof c.soloed === "boolean"
	);
}

export function toMixerState(channels: ChannelState[], masterVolume: number) {
	return {
		tracks: channels.map((ch) => ({
			id: ch.id,
			name: ch.name,
			volume: ch.volume,
			pan: ch.pan,
			muted: ch.muted,
			solo: ch.soloed,
		})),
		buses: [
			{ id: "dialogue", name: "Dialogue", volume: 0, pan: 0 },
			{ id: "music", name: "Music", volume: -6, pan: 0 },
			{ id: "sfx", name: "SFX", volume: -3, pan: 0 },
		],
		master_volume: masterVolume,
	};
}
