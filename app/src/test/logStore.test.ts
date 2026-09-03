import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLogStore } from "@/stores/logStore";

beforeEach(() => {
	useLogStore.getState().clear();
});

describe("LogStore", () => {
	describe("addEntry", () => {
		it("adds a log entry with id and timestamp", () => {
			act(() =>
				useLogStore
					.getState()
					.addEntry({ stream: "stdout", line: "Server started" }),
			);
			const entries = useLogStore.getState().entries;
			expect(entries).toHaveLength(1);
			expect(entries[0].line).toBe("Server started");
			expect(entries[0].stream).toBe("stdout");
			expect(entries[0].id).toBeTypeOf("number");
			expect(entries[0].timestamp).toBeTypeOf("number");
		});

		it("increments id for each entry", () => {
			act(() =>
				useLogStore.getState().addEntry({ stream: "stdout", line: "A" }),
			);
			act(() =>
				useLogStore.getState().addEntry({ stream: "stdout", line: "B" }),
			);
			const entries = useLogStore.getState().entries;
			expect(entries[1].id).toBeGreaterThan(entries[0].id);
		});

		it("appends entries in order", () => {
			act(() =>
				useLogStore.getState().addEntry({ stream: "stdout", line: "First" }),
			);
			act(() =>
				useLogStore.getState().addEntry({ stream: "stderr", line: "Second" }),
			);
			act(() =>
				useLogStore.getState().addEntry({ stream: "stdout", line: "Third" }),
			);
			const entries = useLogStore.getState().entries;
			expect(entries.map((e) => e.line)).toEqual(["First", "Second", "Third"]);
		});

		it("caps entries at 2000 (MAX_LOG_ENTRIES)", () => {
			act(() => {
				for (let i = 0; i < 2005; i++) {
					useLogStore
						.getState()
						.addEntry({ stream: "stdout", line: `entry ${i}` });
				}
			});
			const entries = useLogStore.getState().entries;
			expect(entries.length).toBe(2000);
			// Should keep the most recent entries
			expect(entries[0].line).toBe("entry 5");
			expect(entries[1999].line).toBe("entry 2004");
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			act(() => {
				useLogStore.getState().addEntry({ stream: "stdout", line: "A" });
				useLogStore.getState().addEntry({ stream: "stderr", line: "B" });
			});
			act(() => useLogStore.getState().clear());
			expect(useLogStore.getState().entries).toHaveLength(0);
		});
	});
});
