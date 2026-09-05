import { HelpCenter } from "./HelpCenter";
import { SkillsBrowser } from "./SkillsBrowser";

/**
 * Help & skills screen: searchable capability catalog above, custom
 * skill browser/manager below. Both consume existing backend content —
 * no new endpoints were added for this screen.
 */
export function HelpPage() {
	return (
		<div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-8 overflow-y-auto px-4 py-6">
			<HelpCenter />
			<SkillsBrowser />
		</div>
	);
}
