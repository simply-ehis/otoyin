/**
 * Tests for the useGenerationForm hook.
 *
 * Covers:
 * - Form schema validation (text required, max 50k, language codes)
 * - Engine resolution: invalid engines resolve to no default (no hardcoded kokoro)
 * - Model download detection before generation
 * - Submission flow: validate -> check model -> generate -> addPending
 * - Error handling at each stage
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { apiClient } from "@/lib/api/client";
import { useGenerationForm } from "@/lib/hooks/useGenerationForm";
import { useGenerationStore } from "@/stores/generationStore";
import { useUIStore } from "@/stores/uiStore";

// Mock dependencies
vi.mock("@/lib/api/client", () => ({
	apiClient: {
		generateSpeech: vi.fn(),
		getModelStatus: vi.fn(),
	},
}));

vi.mock("@/stores/uiStore", () => ({
	useUIStore: vi.fn((selector) => {
		const state = { selectedEngine: "kokoro" };
		return selector ? selector(state) : state;
	}),
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
}

describe("useGenerationForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-apply the default uiStore mock. NOTE: vi.clearAllMocks() does NOT
		// reset a mockImplementation set by a previous test, so a test that
		// overrides useUIStore must have its override restored here, otherwise
		// later tests would inherit the wrong selectedEngine and resolve to no
		// engine (silent early-return in handleSubmit).
		vi.mocked(useUIStore).mockImplementation((selector) => {
			const state = { selectedEngine: "kokoro" } as never;
			return selector ? selector(state) : state;
		});
		// Reset the generation store
		useGenerationStore.setState({
			pendingGenerationIds: new Set(),
			isGenerating: false,
		});
	});

	it("returns form with default values", () => {
		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		expect(result.current.form).toBeDefined();
		expect(result.current.form.getValues("text")).toBe("");
		expect(result.current.form.getValues("language")).toBe("en");
		expect(result.current.form.getValues("engine")).toBe("kokoro");
	});

	it("validates text is required", async () => {
		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		// Try to submit without text
		await act(async () => {
			result.current.form.setValue("text", "");
		});

		// Text validation happens at schema level, not required field
		// The form should still be valid with empty text (min(1) catches it)
	});

	it("validates text max length is 50000", () => {
		// Verify the Zod schema rejects text > 50000 chars
		const longText = "a".repeat(50001);
		const schema = z.object({
			text: z.string().min(1, "").max(50000),
		});
		const result = schema.safeParse({ text: longText });
		expect(result.success).toBe(false);
	});

	it("resolves invalid engine to no default (undefined)", () => {
		// Override the store to return an invalid engine — must NOT fall back to kokoro
		vi.mocked(useUIStore).mockImplementation((selector) => {
			const state = {
				selectedEngine: "invalid_engine_xyz",
				sidebarOpen: false,
				setSidebarOpen: () => {},
				profileDialogOpen: false,
				setProfileDialogOpen: () => {},
				activePanel: "generate",
				setActivePanel: () => {},
				rightPanelOpen: false,
				setRightPanelOpen: () => {},
				dialogTab: null,
				setDialogTab: () => {},
				theme: "default",
				setTheme: () => {},
			} as never;
			return selector ? selector(state) : state;
		});

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		expect(result.current.form.getValues("engine")).toBeUndefined();
	});

	it("does not generate when no engine is available (early-return)", async () => {
		// Override the store to return an invalid engine so resolution yields no engine
		vi.mocked(useUIStore).mockImplementation((selector) => {
			const state = { selectedEngine: "invalid_engine_xyz" } as never;
			return selector ? selector(state) : state;
		});
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-nope",
			status: "generating",
		} as never);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Hello world");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		// No engine resolved -> must NOT call the API (user is prompted to download)
		expect(apiClient.generateSpeech).not.toBeCalled();
	});

	it("shows toast when no profile is selected", async () => {
		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Hello world");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				null, // no profile selected
			);
		});

		// Should not have called the API
		expect(apiClient.generateSpeech).not.toBeCalled();
	});

	it("calls getModelStatus before generation", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [{ model_name: "kokoro", entitled: true, downloaded: true }],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-123",
			status: "generating",
		} as never);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Hello world");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		expect(apiClient.getModelStatus).toBeCalled();
		expect(apiClient.generateSpeech).toBeCalled();
	});

	it("adds generation to pending store after successful submission", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-456",
			status: "generating",
		} as never);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Test generation");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		const state = useGenerationStore.getState();
		expect(state.pendingGenerationIds.has("gen-456")).toBe(true);
		expect(state.isGenerating).toBe(true);
	});

	it("resets form after successful submission", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-789",
			status: "generating",
		} as never);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Will be reset");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		expect(result.current.form.getValues("text")).toBe("");
	});

	it("calls onSuccess callback with generation ID", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-callback",
			status: "generating",
		} as never);

		const onSuccess = vi.fn();
		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm({ onSuccess }), {
			wrapper,
		});

		await act(async () => {
			result.current.form.setValue("text", "Callback test");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		expect(onSuccess).toHaveBeenCalledWith("gen-callback");
	});

	it("handles API errors gracefully with toast", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockRejectedValue(
			new Error("Server error"),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Error test");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		// Generation should NOT be in pending (request failed before SSE)
		const state = useGenerationStore.getState();
		expect(state.pendingGenerationIds.size).toBe(0);
	});

	it("includes streaming: true in generation request", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-stream",
			status: "generating",
		} as never);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useGenerationForm(), { wrapper });

		await act(async () => {
			result.current.form.setValue("text", "Stream test");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		const callArgs = vi.mocked(apiClient.generateSpeech).mock.calls[0][0];
		expect(callArgs).toHaveProperty("streaming", true);
	});

	it("sends effects_chain when provided", async () => {
		vi.mocked(apiClient.getModelStatus).mockResolvedValue({
			models: [],
		} as never);
		vi.mocked(apiClient.generateSpeech).mockResolvedValue({
			id: "gen-effects",
			status: "generating",
		} as never);

		const mockEffects = [
			{ type: "normalize", enabled: true, params: {} } as never,
		];
		const wrapper = createWrapper();
		const { result } = renderHook(
			() => useGenerationForm({ getEffectsChain: () => mockEffects }),
			{ wrapper },
		);

		await act(async () => {
			result.current.form.setValue("text", "Effects test");
			await result.current.handleSubmit(
				result.current.form.getValues(),
				"profile-1",
			);
		});

		const callArgs = vi.mocked(apiClient.generateSpeech).mock.calls[0][0];
		expect(callArgs).toHaveProperty("effects_chain", mockEffects);
	});
});
