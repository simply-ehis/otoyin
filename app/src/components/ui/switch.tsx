interface SwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	id?: string;
	disabled?: boolean;
	"aria-label"?: string;
}

/** Accessible toggle switch (no external dependency). */
export function Switch({
	checked,
	onCheckedChange,
	id,
	disabled = false,
	"aria-label": ariaLabel,
}: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			id={id}
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onCheckedChange(!checked)}
			className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 ${
				checked ? "bg-accent" : "bg-muted-foreground/30"
			}`}
		>
			<span
				className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
					checked ? "translate-x-4" : "translate-x-0.5"
				}`}
			/>
		</button>
	);
}
