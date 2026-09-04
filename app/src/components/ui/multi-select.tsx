import {
	CheckIcon as Check,
	ChevronDownIcon as ChevronDown,
} from "@heroicons/react/24/outline";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export interface MultiSelectOption {
	value: string;
	label: string;
}

export interface MultiSelectProps {
	options: MultiSelectOption[];
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	className?: string;
	/** Accessible name for the trigger button. Defaults to `placeholder`. */
	label?: string;
}

export function MultiSelectCheckboxItem({
	ref,
	className,
	children,
	checked,
	...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
	ref?: React.Ref<
		React.ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>
	>;
}) {
	return (
		<DropdownMenuPrimitive.CheckboxItem
			ref={ref}
			className={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-xs outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			checked={checked}
			{...props}
		>
			<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Check className="size-4" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

export function MultiSelect({
	options,
	value,
	onChange,
	placeholder = "Select...",
	className,
	label,
}: MultiSelectProps) {
	const [open, setOpen] = useState(false);

	const handleSelect = (optionValue: string) => {
		const newValue = value.includes(optionValue)
			? value.filter((v) => v !== optionValue)
			: [...value, optionValue];
		onChange(newValue);
	};

	const displayText =
		value.length === 0
			? placeholder
			: value.length === 1
				? options.find((opt) => opt.value === value[0])?.label || placeholder
				: `${value.length} selected`;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={label ?? placeholder}
					className={cn(
						"flex h-8 w-full items-center justify-between rounded-full border border-border bg-card px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent transition-colors",
						className,
					)}
				>
					<span className="line-clamp-1">{displayText}</span>
					<ChevronDown className="size-4 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="max-h-96 overflow-auto"
				align="start"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				{options.map((option) => (
					<MultiSelectCheckboxItem
						key={option.value}
						checked={value.includes(option.value)}
						onSelect={() => handleSelect(option.value)}
						onCheckedChange={() => handleSelect(option.value)}
					>
						{option.label}
					</MultiSelectCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
