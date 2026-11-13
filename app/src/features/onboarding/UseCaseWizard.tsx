import {
	BookOpenIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PhoneIcon,
	PlayIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentStep } from "@/features/onboarding/AgentStep";
import { ModelsStep } from "@/features/onboarding/ModelsStep";
import { tabByPath } from "@/lib/tabs/registry";
import { cn } from "@/lib/utils/cn";
import {
	USE_CASE_PROFILES,
	type UseCaseKey,
	useWorkspaceStore,
} from "@/stores/workspaceStore";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";

const USE_CASE_ICONS: Record<UseCaseKey, typeof SparklesIcon> = {
	tts: MicrophoneIcon,
	podcast: PhoneIcon,
	audiobook: BookOpenIcon,
	music: MusicalNoteIcon,
	voiceChanger: SparklesIcon,
};

const USE_CASE_KEYS = Object.keys(USE_CASE_PROFILES) as UseCaseKey[];

const STEP_IDS = ["welcome", "usecase", "models", "agent", "generate"] as const;
type StepId = (typeof STEP_IDS)[number];

/**
 * First-launch onboarding tour for the whole app.
 * Step 1 (use case) decides which sidebar tabs are visible. The steps that
 * follow cover getting this machine ready: models for the chosen picks, the
 * assistant/coding agent, and generating + listening.
 */
export function UseCaseWizard() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const onboarded = useWorkspaceStore((s) => s.onboarded);
	const applyUseCases = useWorkspaceStore((s) => s.applyUseCases);
	const markOnboarded = useWorkspaceStore((s) => s.markOnboarded);
	const [selected, setSelected] = useState<Set<UseCaseKey>>(new Set());
	const [step, setStep] = useState(0);
	const [open, setOpen] = useState(false);

	// Effect-driven (not initializer-driven) so replaying the tour via
	// reopenOnboarding() actually reopens the dialog.
	useEffect(() => {
		if (!onboarded) {
			setOpen(true);
		}
	}, [onboarded]);
	useEffect(() => {
		if (open) {
			setStep(0);
			setSelected(new Set());
		}
	}, [open]);

	const stepId: StepId = STEP_IDS[step] ?? "welcome";

	const toggle = (key: UseCaseKey) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const handleSkip = () => {
		markOnboarded();
		setOpen(false);
	};

	const handleUseCaseContinue = () => {
		if (selected.size > 0) {
			applyUseCases([...selected]);
		}
		setStep(2);
	};

	const goSomewhere = (to: string) => {
		markOnboarded();
		setOpen(false);
		void navigate({ to });
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-lg">
				<StepDots step={step} />
				{stepId === "welcome" ? (
					<WelcomeStep t={t} onNext={() => setStep(1)} onSkip={handleSkip} />
				) : null}
				{stepId === "usecase" ? (
					<UseCaseStep
						t={t}
						selected={selected}
						onToggle={toggle}
						onBack={() => setStep(0)}
						onSkip={handleSkip}
						onContinue={handleUseCaseContinue}
					/>
				) : null}
				{stepId === "models" ? (
					<ModelsStep
						t={t}
						selected={selected}
						onBack={() => setStep(1)}
						onNext={() => setStep(3)}
						onSkip={handleSkip}
						onOpenStore={() => goSomewhere("/store")}
					/>
				) : null}
				{stepId === "agent" ? (
					<AgentStep
						t={t}
						onBack={() => setStep(2)}
						onNext={() => setStep(4)}
						onSkip={handleSkip}
						onOpenApiKeys={() => goSomewhere("/settings/api-keys")}
					/>
				) : null}
				{stepId === "generate" ? (
					<GenerateStep
						t={t}
						onBack={() => setStep(3)}
						onFinish={() => goSomewhere("/")}
						onSkip={handleSkip}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

type T = (key: string, fallback: string) => string;

function StepDots({ step }: { step: number }) {
	const total = STEP_IDS.length;
	return (
		<output
			className="flex items-center gap-1.5"
			aria-live="polite"
			aria-label={`Step ${step + 1} of ${total}`}
		>
			{STEP_IDS.map((id, i) => (
				<span
					key={id}
					aria-hidden="true"
					className={cn(
						"h-1.5 flex-1 rounded-full",
						i <= step ? "bg-accent" : "bg-secondary",
					)}
				/>
			))}
		</output>
	);
}

function WelcomeStep({
	t,
	onNext,
	onSkip,
}: {
	t: T;
	onNext: () => void;
	onSkip: () => void;
}) {
	const points = [
		{
			icon: MicrophoneIcon,
			title: t("onboarding.welcome.generateTitle", "Generate speech"),
			body: t(
				"onboarding.welcome.generateBody",
				"Type a script, pick a voice, get studio audio.",
			),
		},
		{
			icon: PlayIcon,
			title: t("onboarding.welcome.shapeTitle", "Shape sound"),
			body: t(
				"onboarding.welcome.shapeBody",
				"Mix, add effects, and export for any platform.",
			),
		},
		{
			icon: SparklesIcon,
			title: t("onboarding.welcome.offlineTitle", "Stays on your machine"),
			body: t(
				"onboarding.welcome.offlineBody",
				"Models run locally — no cloud needed for core features.",
			),
		},
	];
	return (
		<>
			<DialogTitle>
				{t("onboarding.welcome.title", "Welcome to otoyin")}
			</DialogTitle>
			<DialogDescription>
				{t("onboarding.welcome.description", "")}
			</DialogDescription>
			<ul className="flex flex-col gap-2 py-2">
				{points.map((p) => (
					<li key={p.title} className="flex items-start gap-3">
						<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
							<p.icon className="size-4" aria-hidden="true" />
						</span>
						<span className="min-w-0">
							<span className="block text-sm font-medium">{p.title}</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">
								{p.body}
							</span>
						</span>
					</li>
				))}
			</ul>
			<DialogFooter>
				<Button variant="ghost" onClick={onSkip}>
					{t("onboarding.wizard.skipTour", "Skip tour")}
				</Button>
				<Button onClick={onNext}>
					{t("onboarding.welcome.next", "Get started")}
				</Button>
			</DialogFooter>
		</>
	);
}

function UseCaseStep({
	t,
	selected,
	onToggle,
	onBack,
	onSkip,
	onContinue,
}: {
	t: T;
	selected: Set<UseCaseKey>;
	onToggle: (key: UseCaseKey) => void;
	onBack: () => void;
	onSkip: () => void;
	onContinue: () => void;
}) {
	return (
		<>
			<DialogTitle>
				{t("onboarding.wizard.title", "What do you want to do?")}
			</DialogTitle>
			<DialogDescription>
				{t("onboarding.wizard.description", "")}
			</DialogDescription>

			<div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
				{USE_CASE_KEYS.map((key) => {
					const profile = USE_CASE_PROFILES[key];
					const Icon = USE_CASE_ICONS[key];
					const isSelected = selected.has(key);
					const tabLabels = profile.tabs
						.map((p) => {
							const entry = tabByPath(p);
							return entry ? t(entry.labelKey, entry.path) : p;
						})
						.join(", ");
					return (
						<button
							key={key}
							type="button"
							onClick={() => onToggle(key)}
							className={cn(
								"flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
								isSelected
									? "border-accent bg-accent/5"
									: "border-border hover:bg-secondary/50",
							)}
							aria-pressed={isSelected}
						>
							<div
								className={cn(
									"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
									isSelected
										? "bg-accent text-white"
										: "bg-secondary text-muted-foreground",
								)}
							>
								<Icon className="size-4" aria-hidden="true" />
							</div>
							<div className="min-w-0">
								<div className="text-sm font-medium">{profile.label}</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{profile.description}
								</div>
								<div className="mt-1 text-[10px] text-muted-foreground">
									{t("onboarding.wizard.enables", "Enables:")} {tabLabels}
								</div>
								<div className="mt-0.5 text-[10px] text-muted-foreground">
									{t("onboarding.wizard.modelSpace", "Model space:")}{" "}
									{profile.spaceEstimate}
								</div>
							</div>
						</button>
					);
				})}
			</div>

			<DialogFooter className="flex-row justify-between sm:justify-between">
				<Button variant="ghost" onClick={onBack}>
					{t("common.back", "Back")}
				</Button>
				<span className="flex gap-2">
					<Button variant="ghost" onClick={onSkip}>
						{t("onboarding.wizard.skip", "Show everything")}
					</Button>
					<Button onClick={onContinue} disabled={selected.size === 0}>
						{t("onboarding.wizard.confirm", "Continue")}
					</Button>
				</span>
			</DialogFooter>
		</>
	);
}

function GenerateStep({
	t,
	onBack,
	onFinish,
	onSkip,
}: {
	t: T;
	onBack: () => void;
	onFinish: () => void;
	onSkip: () => void;
}) {
	return (
		<>
			<DialogTitle>
				{t("onboarding.generate.title", "Generate and listen")}
			</DialogTitle>
			<DialogDescription>
				{t("onboarding.generate.description", "")}
			</DialogDescription>
			<ul className="flex flex-col gap-2 py-2">
				<li className="flex items-start gap-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<MusicalNoteIcon className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{t("onboarding.generate.writeTitle", "1. Write and generate")}
						</span>
						<span className="mt-0.5 block text-xs text-muted-foreground">
							{t(
								"onboarding.generate.writeBody",
								"Pick a voice and language, type your script, hit Generate. Watch live progress under the prompt bar.",
							)}
						</span>
					</span>
				</li>
				<li className="flex items-start gap-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<PlayIcon className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{t("onboarding.generate.listenTitle", "2. Listen and tweak")}
						</span>
						<span className="mt-0.5 block text-xs text-muted-foreground">
							{t(
								"onboarding.generate.listenBody",
								"Past takes live in History — play, retry, or delete them. The bottom bar plays anything, with speed and loop.",
							)}
						</span>
					</span>
				</li>
				<li className="flex items-start gap-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<BookOpenIcon className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{t("onboarding.generate.moreTitle", "3. Go further")}
						</span>
						<span className="mt-0.5 block text-xs text-muted-foreground">
							{t(
								"onboarding.generate.moreBody",
								"Each tab shows its own short intro card the first time you open it.",
							)}
						</span>
					</span>
				</li>
			</ul>
			<p className="text-center text-xs text-muted-foreground">
				{t(
					"onboarding.generate.ctrlKHint",
					"Tip — press Ctrl+K to search anything.",
				)}
			</p>
			<DialogFooter className="flex-row justify-between sm:justify-between">
				<Button variant="ghost" onClick={onBack}>
					{t("common.back", "Back")}
				</Button>
				<Button variant="ghost" onClick={onSkip}>
					{t("onboarding.wizard.skipTour", "Skip tour")}
				</Button>
				<Button onClick={onFinish}>
					{t("onboarding.generate.finish", "Start generating")}
				</Button>
			</DialogFooter>
		</>
	);
}
