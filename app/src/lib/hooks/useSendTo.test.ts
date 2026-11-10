import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSendTo } from "@/lib/hooks/useSendTo";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

describe("useSendTo", () => {
	it("navigates to /effects with a generation search param", () => {
		const { result } = renderHook(() => useSendTo());
		result.current("/effects", { generation: "gen-123" });
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/effects",
			search: { generation: "gen-123" },
		});
	});

	it("navigates to /effects with a path search param", () => {
		navigateMock.mockClear();
		const { result } = renderHook(() => useSendTo());
		result.current("/effects", { path: "captures/dsp_abc.wav" });
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/effects",
			search: { path: "captures/dsp_abc.wav" },
		});
	});

	it("navigates to /vocal-isolation with a path search param", () => {
		navigateMock.mockClear();
		const { result } = renderHook(() => useSendTo());
		result.current("/vocal-isolation", { path: "captures/music_xyz.wav" });
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/vocal-isolation",
			search: { path: "captures/music_xyz.wav" },
		});
	});

	it("omits undefined search values (typed as Record<string, string | undefined>)", () => {
		navigateMock.mockClear();
		const { result } = renderHook(() => useSendTo());
		result.current("/effects", { generation: undefined });
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/effects",
			search: { generation: undefined },
		});
	});
});
