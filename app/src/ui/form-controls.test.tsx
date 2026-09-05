/**
 * Form + multi-select tests — render + interaction floor (14).
 *
 * Encodes desktop-ui-text-inputs rules: errors announced via role=alert
 * and associated with the field, checkbox sets fully keyboard-operable,
 * selection summary honest about what is picked.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import {
	Form,
	FormActions,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "./form";
import { MultiSelect } from "./multi-select";

function renderNameForm(onSubmit = vi.fn()) {
	function Harness() {
		const methods = useForm<{ name: string }>({
			defaultValues: { name: "" },
		});
		return (
			<FormProvider {...methods}>
				<Form
					onSubmit={methods.handleSubmit((values) => onSubmit(values))}
					aria-label="Voice form"
				>
					<FormItem>
						<FormField
							name="name"
							rules={{ required: "Name is required" }}
							render={({ field }) => (
								<>
									<FormLabel htmlFor="voice-name">Voice name</FormLabel>
									<input id="voice-name" {...field} />
									<FormMessage />
								</>
							)}
						/>
						<FormDescription>Shown in the library.</FormDescription>
					</FormItem>
					<FormActions>
						<button type="submit">Save</button>
					</FormActions>
				</Form>
			</FormProvider>
		);
	}
	return render(<Harness />);
}

describe("Form", () => {
	it("announces a validation error on submit", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderNameForm(onSubmit);
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Name is required",
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits valid values and clears the error path", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		renderNameForm(onSubmit);
		await user.type(screen.getByLabelText("Voice name"), "Ada");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "Ada" });
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("keeps hint text separate from errors", () => {
		renderNameForm();
		expect(screen.getByText("Shown in the library.")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("MultiSelect", () => {
	const OPTIONS = [
		{ value: "en", label: "English" },
		{ value: "ja", label: "Japanese" },
		{ value: "de", label: "German" },
	];

	function renderMulti(value: string[], onChange = vi.fn()) {
		return render(
			<MultiSelect
				options={OPTIONS}
				value={value}
				onChange={onChange}
				placeholder="Pick languages"
			/>,
		);
	}

	it("summarizes the selection honestly", () => {
		const { rerender } = renderMulti([]);
		expect(screen.getByText("Pick languages")).toBeInTheDocument();
		rerender(
			<MultiSelect
				options={OPTIONS}
				value={["en"]}
				onChange={() => {}}
				placeholder="Pick languages"
			/>,
		);
		expect(screen.getByText("English")).toBeInTheDocument();
		rerender(
			<MultiSelect
				options={OPTIONS}
				value={["en", "ja", "de"]}
				onChange={() => {}}
				placeholder="Pick languages"
			/>,
		);
		expect(screen.getByText("3 selected")).toBeInTheDocument();
	});

	it("toggles options by keyboard with native checkboxes", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		renderMulti(["en"], onChange);
		await user.click(screen.getByRole("button", { name: "Pick languages" }));
		const japanese = screen.getByRole("checkbox", { name: "Japanese" });
		expect(japanese).not.toBeChecked();
		japanese.focus();
		await user.keyboard(" ");
		expect(onChange).toHaveBeenCalledWith(["en", "ja"]);
	});

	it("announces the empty state inside the popover", async () => {
		const user = userEvent.setup();
		render(
			<MultiSelect
				options={[]}
				value={[]}
				onChange={() => {}}
				placeholder="Pick languages"
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Pick languages" }));
		expect(screen.getByText("No options")).toBeInTheDocument();
	});
});
