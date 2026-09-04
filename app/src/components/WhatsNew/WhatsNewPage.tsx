import { MegaphoneIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useWhatsNew } from "@/lib/hooks/useContent";
import { useContentStore } from "@/stores/contentStore";

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
		<div className="mx-auto max-w-2xl py-8">
			<header className="mb-6">
				<h1 className="text-2xl font-semibold text-foreground">What's New</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Updates shipped in Otoyin — features, fixes, and model releases.
				</p>
			</header>

			{isLoading && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner size="sm" /> Loading release notes…
				</div>
			)}

			{!isLoading && (data?.length ?? 0) === 0 && (
				<div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
					<MegaphoneIcon className="size-5" /> No release notes yet.
				</div>
			)}

			<ol className="space-y-6">
				{(data ?? []).map((entry) => (
					<li
						key={entry.version}
						className="rounded-lg border border-border bg-card p-5"
					>
						<div className="flex items-baseline justify-between gap-4">
							<h2 className="text-lg font-medium text-foreground">
								{entry.title}
							</h2>
							<span className="shrink-0 text-xs text-muted-foreground">
								v{entry.version} · {entry.date}
							</span>
						</div>
						<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
							{entry.highlights.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
						{entry.link && (
							<button
								type="button"
								onClick={() => navigate({ to: entry.link?.to } as never)}
								className="mt-3 text-sm font-medium text-accent hover:underline"
							>
								{entry.link.label} ?
							</button>
						)}
					</li>
				))}
			</ol>
		</div>
	);
}
