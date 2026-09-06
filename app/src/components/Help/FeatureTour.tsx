import {
	CheckIcon,
	CpuChipIcon,
	CubeTransparentIcon,
	MicrophoneIcon,
	QuestionMarkCircleIcon,
	RectangleStackIcon,
	SparklesIcon,
	SpeakerWaveIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface TourStep {
	id: string;
	title: string;
	body: string;
	Icon: typeof SparklesIcon;
}

const TOUR_STEPS: TourStep[] = [
	{
		id: "welcome",
		title: "Welcome to otoyin",
		body: "Your offline AI voice studio. Everything runs on-device — no cloud dependency for core features.",
		Icon: MicrophoneIcon,
	},
	{
		id: "sidebar",
		title: "Navigate",
		body: "Use the sidebar to switch between Voice generation, Audio Studio, Mixer, and more.",
		Icon: RectangleStackIcon,
	},
	{
		id: "generate",
		title: "Generate speech",
		body: "Type text, pick a voice or profile, and hit Generate. If no engine is installed yet, download one from the Models tab first.",
		Icon: SpeakerWaveIcon,
	},
	{
		id: "models",
		title: "Download models",
		body: "Engines need models downloaded first. Visit the Marketplace to browse and install them.",
		Icon: CubeTransparentIcon,
	},
	{
		id: "assistant",
		title: "AI Assistant",
		body: "Open the local LLM assistant — it can call 120+ studio tools through voice or text.",
		Icon: CpuChipIcon,
	},
	{
		id: "f1",
		title: "Get help",
		body: "Press F1 to search features and tools. Ctrl+K opens the command palette.",
		Icon: QuestionMarkCircleIcon,
	},
];

export function FeatureTour({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [step, setStep] = useState(0);

	const modelStatus = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		enabled: open,
	});

	const hasTtsEngine =
		(modelStatus.data?.models ?? []).some(
			(m) => m.category === "tts" && m.downloaded,
		) ?? false;

	useEffect(() => {
		if (!open) {
			return;
		}
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
			if (e.key === "ArrowRight" || e.key === "Enter") {
				e.preventDefault();
				if (step < TOUR_STEPS.length - 1) {
					setStep(step + 1);
				} else {
					onClose();
				}
			}
			if (e.key === "ArrowLeft" && step > 0) {
				setStep(step - 1);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, step, onClose]);

	useEffect(() => {
		if (open && step >= TOUR_STEPS.length) {
			onClose();
		}
	}, [open, step, onClose]);

	if (!open || step >= TOUR_STEPS.length) {
		return null;
	}

	const current = TOUR_STEPS[step];
	const isLast = step === TOUR_STEPS.length - 1;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Welcome tour"
			tabIndex={-1}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					onClose();
				}
				if (e.key === "Tab") {
					const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
					);
					const first = focusable[0];
					const last = focusable[focusable.length - 1];
					if (e.shiftKey && document.activeElement === first) {
						e.preventDefault();
						last.focus();
					} else if (!e.shiftKey && document.activeElement === last) {
						e.preventDefault();
						first.focus();
					}
				}
			}}
		>
			<div className="relative w-full max-w-sm mx-4">
				{/* Card */}
				<div className="bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden">
					{/* Close */}
					<button
						type="button"
						onClick={onClose}
						className="absolute top-4 right-4 z-10 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
						aria-label="Skip tour"
					>
						<XMarkIcon className="size-4" />
					</button>

					{/* Content */}
					<div className="px-8 pt-8 pb-6">
						<div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent-muted text-accent">
							<current.Icon className="size-5" />
						</div>
						<h3 className="text-lg font-semibold tracking-tight mb-2">
							{current.title}
						</h3>
						<p className="text-sm text-muted-foreground leading-relaxed">
							{current.body}
						</p>
						{current.id === "models" && (
							<div className="mt-4">
								{hasTtsEngine ? (
									<p className="text-xs text-emerald-500">
										? You have a TTS engine ready.
									</p>
								) : (
									<Link
										to="/store"
										onClick={onClose}
										className="block w-full text-center px-4 py-3 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
									>
										Get from Store
									</Link>
								)}
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="px-8 pb-6">
						{/* Dot indicators */}
						<div className="flex items-center justify-center gap-2 mb-5">
							{TOUR_STEPS.map((s, i) => (
								<button
									key={s.id}
									type="button"
									onClick={() => setStep(i)}
									aria-label={`Go to step ${i + 1}`}
									className={cn(
										"rounded-full transition-all duration-300",
										i === step
											? "w-5 h-1.5 bg-primary"
											: "w-1.5 h-1.5 bg-strong hover:brightness-110",
									)}
								/>
							))}
						</div>

						{/* Actions */}
						<div className="flex items-center gap-2">
							{step > 0 && (
								<button
									type="button"
									onClick={() => setStep(step - 1)}
									className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
								>
									Back
								</button>
							)}
							<button
								type="button"
								onClick={isLast ? onClose : () => setStep(step + 1)}
								className={cn(
									"flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
									isLast
										? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--elevation-floating)]"
										: "bg-primary text-primary-foreground hover:bg-primary/90",
								)}
							>
								{isLast ? (
									<>
										<CheckIcon className="size-4" />
										Let's go
									</>
								) : (
									<>
										<SparklesIcon className="size-3.5" />
										Next
									</>
								)}
							</button>
						</div>
					</div>
				</div>

				{/* Keyboard hint */}
				<p className="text-center text-xs text-muted-foreground/40 mt-3">
					Esc to skip
				</p>
			</div>
		</div>
	);
}
