import { LightBulbIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { TAB_HELP_DATA } from "@/features/help/TabHelp";
import { TAB_TIP_DATA } from "@/features/help/tabTipData";

const SEEN_PREFIX = "otoyin.tabtip.";

function readSeen(key: string): boolean {
	try {
		return localStorage.getItem(key) === "1";
	} catch {
		return true; // storage unavailable — don't spam tips we can't persist
	}
}

function writeSeen(key: string) {
	try {
		localStorage.setItem(key, "1");
	} catch {
		// ignore — tip just reappears next launch
	}
}

/**
 * One-time, dismissible tip for the current tab (design doc S10).
 * Shows the first tip from the tab's TAB_HELP_DATA entry, exactly once per
 * tab per install (localStorage), and renders nothing when the tab has no
 * tip. Mounted once in AppFrame above the route outlet.
 */
export function TabTip({ tabPath }: { tabPath: string }) {
	const storageKey = `${SEEN_PREFIX}${tabPath}`;
	const [seen, setSeen] = useState(() => readSeen(storageKey));

	const tip = TAB_TIP_DATA[tabPath] ?? TAB_HELP_DATA[tabPath]?.tips?.[0];
	if (!tip || seen) {
		return null;
	}

	return (
		<output className="flex h-8 shrink-0 items-center gap-2 border-b border-accent/20 bg-accent-muted/30 px-3 text-[11px] text-muted-foreground">
			<LightBulbIcon
				className="size-3.5 shrink-0 text-accent"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate" title={tip}>
				<span className="font-semibold text-foreground">Tip</span> — {tip}
			</span>
			<button
				type="button"
				onClick={() => {
					writeSeen(storageKey);
					setSeen(true);
				}}
				className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
				aria-label="Got it — hide this tip"
				title="Got it"
			>
				<XMarkIcon className="size-3.5" aria-hidden="true" />
			</button>
		</output>
	);
}
