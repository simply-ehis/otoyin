import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

const DISMISS_KEY = "Otoyin.getting-started.dismissed";

interface Step {
	id: string;
	title: string;
	description: string;
}

const STEPS: Step[] = [
	{
		id: "engine",
		title: "Download a voice engine",
		description: "Browse the Marketplace for free and premium TTS models.",
	},
	{
		id: "profile",
		title: "Create a voice profile",
		description: "Clone a voice or pick a preset to make it yours.",
	},
	{
		id: "generate",
		title: "Generate your first voice",
		description: "Type something and hear it spoken in your new voice.",
	},
];

export function GettingStarted() {
	const [dismissed, setDismissed] = useState(
		() => localStorage.getItem(DISMISS_KEY) === "true",
	);

	const modelStatus = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
	});

	const hasTts =
		(modelStatus.data?.models ?? []).some(
			(m) => m.category === "tts" && m.downloaded,
		) ?? false;

	const steps = [
		{ ...STEPS[0], done: hasTts },
		{ ...STEPS[1], done: false },
		{ ...STEPS[2], done: false },
	];

	const allDone = steps.every((s) => s.done);

	if (dismissed || allDone) {
		return null;
	}

	return (
		<div className="mb-4 rounded-lg border border-border bg-card overflow-hidden">
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<div>
					<h3 className="text-sm font-semibold">Get started</h3>
					<p className="text-xs text-muted-foreground">
						Three steps to your first voice
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						localStorage.setItem(DISMISS_KEY, "true");
						setDismissed(true);
					}}
					className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
					aria-label="Dismiss"
				>
					<XMarkIcon className="size-4" />
				</button>
			</div>

			<div className="px-4 pb-3 pt-1">
				{steps.map((step, i) => {
					return (
						<div key={step.id} className="flex items-start gap-3">
							<div className="flex flex-col items-center">
								<div
									className={cn(
										"size-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors",
										step.done
											? "bg-success-soft text-success"
											: "bg-muted text-muted-foreground",
									)}
								>
									{step.done ? (
										<CheckIcon className="size-3.5" />
									) : (
										<span>{i + 1}</span>
									)}
								</div>
								{i < steps.length - 1 && (
									<div
										className={cn(
											"w-px flex-1 my-1",
											step.done ? "bg-success" : "bg-border",
										)}
									/>
								)}
							</div>

							<div className="flex-1 min-w-0 pb-3">
								<p
									className={cn(
										"text-sm font-medium leading-tight",
										step.done && "text-emerald-500",
									)}
								>
									{step.title}
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									{step.description}
								</p>
								{step.id === "engine" && !step.done && (
									<Link
										to="/store"
										className="inline-block mt-1.5 text-xs font-medium text-accent hover:underline"
									>
										Go to Store →
									</Link>
								)}
								{step.id === "generate" && !steps[0].done && (
									<p className="text-xs text-muted-foreground/60 mt-1">
										Complete step 1 first
									</p>
								)}
								{step.id === "generate" && steps[0].done && !step.done && (
									<p className="text-xs text-muted-foreground/60 mt-1">
										Use the text box below
									</p>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
