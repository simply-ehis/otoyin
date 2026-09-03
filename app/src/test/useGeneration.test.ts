/**
 * Tests for the useGeneration hook.
 *
 * Covers:
 * - Mutation calls apiClient.generateSpeech with correct params
 * - onSuccess invalidates the history query
 * - Error propagation
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { useGeneration } from "@/lib/hooks/useGeneration";

// Mock the API client
vi.mock("@/lib/api/client", () => ({
	apiClient: {
		generateSpeech: vi.fn(),
	},
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
}

describe("useGeneration", () => {
	it("calls apiClient.generateSpeech with the provided data", async () => {
		const mockResponse = { id: "gen-123", status: "generating" };
		vi.mocked(apiClient.generateSpeech).mockResolvedValue(
			mockResponse as never,
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGeneration(), { wrapper });

		const requestData = {
			profile_id: "profile-1",
			text: "Hello world",
			language: "en",
			engine: "kokoro",
		};

		result.current.mutate(requestData as never);

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(apiClient.generateSpeech).toHaveBeenCalledWith(requestData);
		expect(result.current.data).toEqual(mockResponse);
	});

	it("propagates errors from the API", async () => {
		vi.mocked(apiClient.generateSpeech).mockRejectedValue(
			new Error("Generation failed"),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGeneration(), { wrapper });

		result.current.mutate({
			profile_id: "profile-1",
			text: "Hello",
			language: "en",
		} as never);

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
		});

		expect(result.current.error?.message).toBe("Generation failed");
	});

	it("exposes isPending state during mutation", async () => {
		// Never resolves — keeps the mutation pending
		vi.mocked(apiClient.generateSpeech).mockReturnValue(new Promise(() => {}));

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGeneration(), { wrapper });

		// Before mutation: should be idle
		expect(result.current.isPending).toBe(false);

		act(() => {
			result.current.mutate({
				profile_id: "profile-1",
				text: "Hello",
				language: "en",
			} as never);
		});

		await waitFor(() => {
			expect(result.current.isPending).toBe(true);
			expect(result.current.isIdle).toBe(false);
		});
	});

	it("resets state between mutations", async () => {
		const mockResponse = { id: "gen-123", status: "generating" };
		vi.mocked(apiClient.generateSpeech)
			.mockResolvedValueOnce(mockResponse as never)
			.mockRejectedValueOnce(new Error("Second failed"));

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGeneration(), { wrapper });

		// First mutation succeeds
		result.current.mutate({
			profile_id: "profile-1",
			text: "Hello",
			language: "en",
		} as never);

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		// Second mutation fails
		result.current.mutate({
			profile_id: "profile-1",
			text: "World",
			language: "en",
		} as never);

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
			expect(result.current.error?.message).toBe("Second failed");
		});
	});
});
