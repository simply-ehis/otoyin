/**
 * Route fallback shown when nothing matches (`defaultNotFoundComponent`) or a
 * settings section is retired (`notFoundComponent` on the settings route).
 *
 * Static copy on purpose — this tree renders precisely when the routed app
 * cannot mount, so it must not depend on i18n providers or stores surviving.
 */
import {
	Cog6ToothIcon,
	HomeIcon,
	MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { Button } from "@/ui/button";

export function NotFound() {
	return (
		<div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
			<MagnifyingGlassIcon
				className="size-10 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="space-y-1">
				<h1 className="text-lg font-semibold text-foreground">
					That page doesn&rsquo;t exist
				</h1>
				<p className="mx-auto max-w-sm text-sm text-muted-foreground">
					The link may be outdated or this tab was moved. Nothing was lost —
					head back to the studio.
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-center gap-2">
				<Button asChild variant="default" size="sm">
					<a href="/">
						<HomeIcon aria-hidden="true" />
						Back to the studio
					</a>
				</Button>
				<Button asChild variant="ghost" size="sm">
					<a href="/settings">
						<Cog6ToothIcon aria-hidden="true" />
						Open Settings
					</a>
				</Button>
			</div>
		</div>
	);
}

export function SettingsNotFound() {
	return (
		<div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
			<MagnifyingGlassIcon
				className="size-8 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="space-y-1">
				<h1 className="text-base font-semibold text-foreground">
					Settings page not found
				</h1>
				<p className="mx-auto max-w-sm text-sm text-muted-foreground">
					This section doesn&rsquo;t exist — it may have been merged into
					another tab.
				</p>
			</div>
			<Button asChild variant="secondary" size="sm">
				<Link to="/settings">
					<Cog6ToothIcon aria-hidden="true" />
					Back to General
				</Link>
			</Button>
		</div>
	);
}
