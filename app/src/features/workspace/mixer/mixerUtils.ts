import type { SessionResponse } from "@/lib/api/types";
import type { ChannelState } from "./mixerTypes";
import { isChannelState } from "./mixerTypes";

export function updateChannel(
	channels: ChannelState[],
	id: string,
	updates: Partial<ChannelState>,
): ChannelState[] {
	return channels.map((ch) => (ch.id === id ? { ...ch, ...updates } : ch));
}

export function removeChannel(
	channels: ChannelState[],
	id: string,
): ChannelState[] {
	return channels.filter((ch) => ch.id !== id);
}

export function restoreSession(session: SessionResponse): {
	channels: ChannelState[];
	masterVolume: number;
} {
	const data = session.data as {
		tracks?: unknown;
		master_volume?: unknown;
	};
	const tracks = Array.isArray(data.tracks)
		? data.tracks.filter(isChannelState)
		: [];
	const masterVolume =
		typeof data.master_volume === "number" ? data.master_volume : 0.8;
	return { channels: tracks, masterVolume };
}
