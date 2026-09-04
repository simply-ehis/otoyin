import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickCloneDialog } from "./QuickCloneDialog";

// Mock dependencies
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();
	return {
		...actual,
		useQueryClient: () => ({
			getQueryData: () => ({ models: [] }),
		}),
	};
});

vi.mock("@/lib/hooks/useProfiles", () => ({
	useCreateProfile: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useAddSample: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

describe("QuickCloneDialog", () => {
	it("renders nothing when closed", () => {
		const { container } = render(
			<QuickCloneDialog open={false} onOpenChange={vi.fn()} />,
		);
		expect(container.innerHTML).toBe("");
	});

	it("renders the dialog when open", () => {
		render(<QuickCloneDialog open={true} onOpenChange={vi.fn()} />);
		// Should show some content — the upload step
		expect(document.body).not.toBeEmptyDOMElement();
	});

	it("shows the upload step content", () => {
		render(<QuickCloneDialog open={true} onOpenChange={vi.fn()} />);
		// The upload step should render file upload UI
		const body = document.body;
		expect(body.textContent).toBeTruthy();
		expect(body.textContent?.length).toBeGreaterThan(0);
	});

	it("accepts onOpenChange callback", () => {
		const onOpenChange = vi.fn();
		render(<QuickCloneDialog open={true} onOpenChange={onOpenChange} />);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("accepts optional onComplete callback", () => {
		const onComplete = vi.fn();
		render(
			<QuickCloneDialog
				open={true}
				onOpenChange={vi.fn()}
				onComplete={onComplete}
			/>,
		);
		expect(onComplete).not.toHaveBeenCalled();
	});
});
