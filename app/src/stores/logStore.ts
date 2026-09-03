import { create } from "zustand";
import type { ServerLogEntry } from "@/platform/types";

const MAX_LOG_ENTRIES = 2000;

let nextLogEntryId = 0;

// Prevent integer overflow in extremely long sessions
function nextId(): number {
	nextLogEntryId = (nextLogEntryId + 1) % Number.MAX_SAFE_INTEGER;
	return nextLogEntryId;
}

export interface LogEntry extends ServerLogEntry {
	id: number;
	timestamp: number;
}

interface LogStore {
	entries: LogEntry[];
	addEntry: (entry: ServerLogEntry) => void;
	clear: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
	entries: [],
	addEntry: (entry) =>
		set((state) => {
			const newEntry: LogEntry = {
				...entry,
				id: nextId(),
				timestamp: Date.now(),
			};
			const entries = [...state.entries, newEntry];
			if (entries.length > MAX_LOG_ENTRIES) {
				return { entries: entries.slice(entries.length - MAX_LOG_ENTRIES) };
			}
			return { entries };
		}),
	clear: () => set({ entries: [] }),
}));
