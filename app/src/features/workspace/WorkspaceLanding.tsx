import { Link } from "@tanstack/react-router";
import { ScreenHeader } from "@/ui/states";
import { WORKSPACE_GROUPS } from "./nav";

/**
 * Workspace landing: every tool as a card, grouped. Same nav source
 * as the rail, so the two can never drift apart.
 */
export function WorkspaceLanding() {
	return (
		<div className="flex h-full flex-col gap-6 overflow-y-auto">
			<ScreenHeader
				title="Workspace"
				description="Audio production tools — pick one to get started."
			/>
			{WORKSPACE_GROUPS.map((group) => (
				<section key={group.label} aria-label={group.label}>
					<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
						{group.label}
					</h2>
					<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{group.tools.map((tool) => (
							<li key={tool.id}>
								<Link
									to={tool.path}
									className="group flex h-full flex-col gap-2 rounded-md border border-border bg-card p-3 transition-colors hover:border-strong"
								>
									<span className="flex items-center gap-3">
										<span
											aria-hidden="true"
											className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground transition-colors group-hover:bg-accent-muted group-hover:text-accent"
										>
											<tool.icon className="size-4" />
										</span>
										<span className="text-sm font-medium text-foreground">
											{tool.label}
										</span>
									</span>
									<span className="pl-[44px] text-xs leading-relaxed text-muted-foreground">
										{tool.description}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
