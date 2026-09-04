import { displayLabelForKey, modifierSideHint } from "@/lib/utils/keyCodes";

export function ChordKeys({ keys }: { keys: string[] }) {
	if (keys.length === 0) {
		return null;
	}
	return (
		<div className="flex items-center gap-1">
			{keys.map((k) => {
				const side = modifierSideHint(k);
				return (
					<span
						key={k}
						className="relative inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-md border border-border bg-muted/60 font-mono text-xs font-medium shadow-sm text-foreground"
					>
						{displayLabelForKey(k)}
						{side ? (
							<span className="absolute -top-1 -right-1 h-3 min-w-[0.75rem] px-0.5 rounded-sm bg-accent text-[7px] font-bold leading-none flex items-center justify-center text-accent-foreground">
								{side}
							</span>
						) : null}
					</span>
				);
			})}
		</div>
	);
}
