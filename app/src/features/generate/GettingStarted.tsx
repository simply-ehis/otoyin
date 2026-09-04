import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

const DISMISS_KEY = "otoyin.getting-started.dismissed";

/**
 * First-run checklist: engine → voice → first generation. Dismisses
 * permanently; hides itself once everything is done.
 */
export function GettingStarted() {
	const [dismissed, setDismissed] = useState(() => {
		try {
			return localStorage.getItem(DISMISS_KEY) === "true";
		} catch {
			return false;
		}
	});
	const { data: status } = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 60_000,
	});

	const hasEngine = (status?.models ?? []).some(
		(m) => m.category === "tts" && m.downloaded,
	);
	const steps = [
		{
			id: "engine",
			title: "Download a voice engine",
			body: "Browse the Marketplace for free and premium TTS models.",
			done: hasEngine,
			link: { to: "/store", label: "Go to Store" },
		},
		{
			id: "profile",
			title: "Create a voice profile",
			body: "Clone a voice or pick a preset to make it yours.",
			done: false,
			link: { to: "/voices", label: "Open Voices" },
		},
		{
			id: "generate",
			title: "Generate your first voice",
			body: hasEngine ? "Use the composer below." : "Complete step 1 first.",
			done: false,
			link: null,
		},
	];

	if (dismissed || steps.every((s) => s.done)) {
		return null;
	}

	return (
		<section
			aria-label="Getting started"
			className="mb-4 overflow-hidden rounded-md border border-border bg-card"
		>
			<div className="flex items-center justify-between px-4 pb-1 pt-3">
				<div>
					<h3 className="text-sm font-semibold text-foreground">Get started</h3>
					<p className="text-xs text-muted-foreground">Three steps to your first voice</p>
				</div>
				<button
					type="button"
					onClick={() => {
						try {
							localStorage.setItem(DISMISS_KEY, "true");
						} catch {
							// Session-only dismissal.
						}
						setDismissed(true);
					}}
					title="Dismiss"
					aria-label="Dismiss getting started"
					className="grid size-7 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
				>
					<XMarkIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
			<ol className="px-4 pb-3 pt-1">
				{steps.map((step, i) => (
					<li key={step.id} className="flex items-start gap-3">
						<span className="flex flex-col items-center self-stretch">
							<span
								aria-hidden="true"
								className={cn(
									"grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium transition-colors",
									step.done ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground",
								)}
							>
								{step.done ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <span>{i + 1}</span>}
							</span>
							{i < steps.length - 1 ? (
								<span
									aria-hidden="true"
									className={cn("my-1 w-px flex-1", step.done ? "bg-success" : "bg-border")}
								/>
							) : null}
						</span>
						<span className="min-w-0 flex-1 pb-3">
							<span className="block text-sm font-medium leading-tight text-foreground">
								{step.title}
							</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">{step.body}</span>
							{step.link && !step.done ? (
								<Link to={step.link.to} className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline">
									{step.link.label} →
								</Link>
							) : null}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}
