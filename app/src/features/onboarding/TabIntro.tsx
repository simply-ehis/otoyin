import { Link, useLocation } from "@tanstack/react-router";
import { introForPath, type TabIntro } from "@/lib/onboarding";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { Button } from "@/ui/button";

/**
 * First-entry intro per tab. Mounted once in the root layout; renders
 * nothing for tabs without content or tabs the user has already seen
 * (persisted — survives restarts). Dismissing records the visit.
 */
export function TabIntroMount() {
	const { pathname } = useLocation();
	const seenTabs = useOnboardingStore((s) => s.seenTabs);
	const markSeen = useOnboardingStore((s) => s.markSeen);
	const intro = introForPath(pathname);
	if (!intro || seenTabs.includes(intro.tabId)) {
		return null;
	}
	return <TabIntroCard intro={intro} onDismiss={() => markSeen(intro.tabId)} />;
}

export function TabIntroCard({
	intro,
	onDismiss,
}: {
	intro: TabIntro;
	onDismiss: () => void;
}) {
	return (
		<section
			aria-label={`Getting started with ${intro.title}`}
			className="mx-auto w-full max-w-[1800px] px-4 pt-2"
		>
			<div className="rounded-md border border-border bg-card px-3 py-2">
				<div className="flex items-baseline gap-3">
					<h2 className="text-sm font-semibold text-foreground">
						First time in {intro.title}? Start here.
					</h2>
					<span aria-hidden="true" className="h-px flex-1 bg-border" />
					<Button size="sm" variant="ghost" onClick={onDismiss}>
						Dismiss
					</Button>
				</div>
				<ol className="mt-2 flex flex-col gap-1">
					{intro.steps.map((step, i) => (
						<li
							key={step}
							className="flex items-baseline gap-2 text-[13px] text-muted-foreground"
						>
							<span
								aria-hidden="true"
								className="grid size-4 shrink-0 translate-y-[1px] place-items-center rounded-full bg-secondary text-[10px] font-semibold text-foreground"
							>
								{i + 1}
							</span>
							{step}
						</li>
					))}
				</ol>
				{intro.link || intro.helpLink ? (
					<div className="mt-2 flex gap-3 text-[13px]">
						{intro.link ? (
							<Link
								to={intro.link.to}
								className="font-medium text-accent hover:underline"
							>
								{intro.link.label} →
							</Link>
						) : null}
						{intro.helpLink ? (
							<Link
								to="/help"
								className="font-medium text-accent hover:underline"
							>
								Browse help →
							</Link>
						) : null}
					</div>
				) : null}
			</div>
		</section>
	);
}
