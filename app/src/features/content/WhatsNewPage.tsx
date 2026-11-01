import { MegaphoneIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWhatsNew } from "@/lib/hooks/useContent";
import { useContentStore } from "@/stores/contentStore";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { EmptyState, ScreenHeader } from "@/ui/states";

export function WhatsNewPage() {
	const navigate = useNavigate();
	const { data, isLoading } = useWhatsNew();
	const seen = useContentStore((s) => s.seenWhatsNewVersions);
	const markSeen = useContentStore((s) => s.markWhatsNewSeen);

	useEffect(() => {
		for (const entry of data ?? []) {
			if (!seen.includes(entry.version)) {
				markSeen(entry.version);
			}
		}
	}, [data, seen, markSeen]);

	return (
		<div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="What's New" />

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner size="xs" /> Loading release notes…
				</div>
			) : null}

			{!isLoading && (data?.length ?? 0) === 0 ? (
				<EmptyState
					icon={<MegaphoneIcon className="size-6" aria-hidden="true" />}
					title="No release notes yet"
					body="Shipped updates will appear here."
				/>
			) : null}

			<ol className="space-y-4">
				{(data ?? []).map((entry) => (
					<li
						key={entry.version}
						className="rounded-md border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<h2 className="text-lg font-medium text-foreground">
								{entry.title}
							</h2>
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
								v{entry.version} · {entry.date}
							</span>
						</div>
						<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
							{entry.highlights.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
						{entry.link ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-3 h-7 px-2 text-xs text-accent hover:text-accent"
								onClick={() => navigate({ to: entry.link?.to } as never)}
							>
								{entry.link.label} →
							</Button>
						) : null}
					</li>
				))}
			</ol>
		</div>
	);
}
