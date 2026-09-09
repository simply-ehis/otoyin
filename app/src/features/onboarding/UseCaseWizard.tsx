import {
	BookOpenIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PhoneIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { cn } from "@/lib/utils/cn";

const USE_CASE_ICONS: Record<UseCaseKey, typeof SparklesIcon> = {
	tts: MicrophoneIcon,
	podcast: PhoneIcon,
	audiobook: BookOpenIcon,
	music: MusicalNoteIcon,
	voiceChanger: SparklesIcon,
};

const USE_CASE_KEYS = Object.keys(USE_CASE_PROFILES) as UseCaseKey[];

/**
 * First-launch onboarding wizard. Asks "What do you want to do?" with
 * multi-select use-case cards. The union of selected profiles determines
 * which sidebar tabs are visible.
 */
export function UseCaseWizard() {
	const { t } = useTranslation();
	const onboarded = useWorkspaceStore((s) => s.onboarded);
	const applyUseCases = useWorkspaceStore((s) => s.applyUseCases);
	const markOnboarded = useWorkspaceStore((s) => s.markOnboarded);
	const [selected, setSelected] = useState<Set<UseCaseKey>>(new Set());
	const [open, setOpen] = useState(!onboarded);

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

	const handleConfirm = () => {
		if (selected.size === 0) {
			// "Everything" — show all tabs
			markOnboarded();
		} else {
			applyUseCases([...selected]);
		}
		setOpen(false);
	};

	const handleSkip = () => {
		markOnboarded();
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-lg">
				<DialogTitle>
					{t("onboarding.wizard.title", "What do you want to do?")}
				</DialogTitle>
				<DialogDescription>
					{t(
						"onboarding.wizard.description",
						"Select all that apply. You can change this anytime in Settings → Workspace.",
					)}
				</DialogDescription>

				<div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
					{USE_CASE_KEYS.map((key) => {
						const profile = USE_CASE_PROFILES[key];
						const Icon = USE_CASE_ICONS[key];
						const isSelected = selected.has(key);
						return (
							<button
								key={key}
								type="button"
								onClick={() => toggle(key)}
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
								</div>
							</button>
						);
					})}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={handleSkip}>
						{t("onboarding.wizard.skip", "Show everything")}
					</Button>
					<Button onClick={handleConfirm} disabled={selected.size === 0}>
						{t("onboarding.wizard.confirm", "Continue")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
