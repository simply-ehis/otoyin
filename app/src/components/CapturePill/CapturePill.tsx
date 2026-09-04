import { ExclamationCircleIcon as AlertCircle } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Pill state machine shared between the settings preview and the live
 * recording pill in the Captures tab.
 */
export type PillState =
	| "recording"
	| "transcribing"
	| "refining"
	| "speaking"
	| "completed"
	| "rest"
	| "error"
	| "partial" // partial transcript (intermediate result)
	| "offline"; // offline mode - server unreachable

const PILL_LABEL_KEYS: Record<Exclude<PillState, "rest" | "error">, string> = {
	recording: "captures.pill.recording",
	transcribing: "captures.pill.transcribing",
	refining: "captures.pill.refining",
	speaking: "captures.pill.speaking",
	completed: "captures.pill.completed",
	partial: "captures.pill.partial",
	offline: "captures.pill.offline",
};

function barModeFor(
	state: Exclude<PillState, "error">,
): "generating" | "playing" | "idle" {
	if (state === "recording" || state === "speaking" || state === "partial") {
		return "playing";
	}
	if (state === "completed" || state === "rest") {
		return "idle";
	}
	return "generating";
}

export function PillAudioBars({
	mode,
}: {
	mode: "generating" | "playing" | "idle";
}) {
	return (
		<div className="flex items-center gap-1 h-5 shrink-0">
			{[0, 1, 2, 3, 4].map((i) => (
				<motion.div
					key={`${mode}-${i}`}
					className={cn(
						"w-[3px] rounded-full",
						mode === "idle" ? "bg-accent/30" : "bg-accent",
					)}
					animate={
						mode === "generating"
							? { height: ["6px", "16px", "6px"] }
							: mode === "playing"
								? { height: ["8px", "14px", "4px", "12px", "8px"] }
								: { height: "8px" }
					}
					transition={
						mode === "generating"
							? {
									duration: 0.6,
									repeat: Infinity,
									delay: i * 0.08,
									ease: "easeInOut",
								}
							: mode === "playing"
								? {
										duration: 1.2,
										repeat: Infinity,
										delay: i * 0.15,
										ease: "easeInOut",
									}
								: { duration: 0.4, ease: "easeOut" }
					}
				/>
			))}
		</div>
	);
}

/**
 * VU Meter component for real-time audio level visualization.
 * Displays a bar that grows/shrinks based on the current audio energy level.
 */
export function VUMeter({
	energy,
	isLoud,
}: {
	energy: number; // 0-1 normalized energy level
	isLoud: boolean;
}) {
	// Clamp energy to 0-1 range
	const clampedEnergy = Math.max(0, Math.min(1, energy));
	const barWidth = Math.round(clampedEnergy * 100);
	const isActive = energy > 0.001;

	return (
		<div className="flex items-center gap-2 min-w-[80px] max-w-[160px]">
			<div
				className={cn(
					"relative h-3 rounded-full bg-muted overflow-hidden",
					"dark:bg-muted/50",
					isActive ? "animate-pulse-subtle" : "",
				)}
				style={{ width: "100%", maxWidth: "120px" }}
				role="progressbar"
				aria-valuenow={Math.round(energy * 100)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Audio input level"
			>
				<div
					className={cn(
						"absolute inset-y-0 rounded-full transition-all duration-75 ease-out",
						isLoud ? "bg-red-500" : "bg-accent",
					)}
					style={{ width: `${barWidth}%` }}
				/>
			</div>
			{/* Numeric indicator */}
			<span
				className={cn(
					"text-xs font-mono tabular-nums text-accent/70 min-w-[3ch]",
					"text-accent",
				)}
			>
				{Math.round(energy * 100)}%
			</span>
		</div>
	);
}

function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Floating pill shown during capture. `state` drives the label, dot animation,
 * bar motion; `elapsedMs` freezes at whatever the caller last passed in
 * (recording advances the timer, transcribing/refining hold the final value).
 * The ``error`` state renders a destructive variant — a clickable pill that
 * copies its message to the clipboard on press and calls ``onDismiss``.
 * Optional ``transcript`` shows live transcription during recording/transcribing.
 * Optional ``confidence`` (0-1) shows confidence indicator for live transcription.
 * Optional ``isFinal`` indicates if the transcript is a final result (vs partial).
 */
export function CapturePill({
	state,
	elapsedMs,
	onStop,
	errorMessage,
	onDismiss,
	className,
	transcript,
	confidence,
	isFinal,
	isEditing,
	editedText,
	onEdit,
	onAccept,
	onCancel,
	onEditedTextChange,
	energy,
	isLoud,
}: {
	state: PillState;
	elapsedMs: number;
	onStop?: () => void;
	errorMessage?: string | null;
	onDismiss?: () => void;
	className?: string;
	transcript?: string;
	confidence?: number;
	isFinal?: boolean;
	isEditing?: boolean;
	editedText?: string;
	onEdit?: () => void;
	onAccept?: (editedText: string) => void;
	onCancel?: () => void;
	onEditedTextChange?: (text: string) => void;
	energy?: number;
	isLoud?: boolean;
}) {
	const { t } = useTranslation();

	if (state === "error") {
		return (
			<ErrorPill
				message={errorMessage ?? t("captures.pill.errorFallback")}
				onDismiss={onDismiss}
				className={className}
			/>
		);
	}

	const visible = state !== "rest";
	const labelText = t(
		state === "rest" ? PILL_LABEL_KEYS.recording : PILL_LABEL_KEYS[state],
	);
	const barMode = barModeFor(state);

	const dot = (
		<span className="relative flex size-2 shrink-0">
			{state === "recording" && (
				<span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-70" />
			)}
			<span className="relative rounded-full size-2 bg-accent" />
		</span>
	);

	const stopButton =
		onStop && state === "recording" ? (
			<button
				type="button"
				onClick={onStop}
				aria-label={t("captures.pill.stopAria")}
				className="relative flex size-2 shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-accent/50"
			>
				{dot}
			</button>
		) : (
			dot
		);

	// Completed gets an inset accent stroke (via box-shadow, not Tailwind's
	// ring — ring utility doesn't compose with arbitrary shadow-[…]) to mark
	// the success moment without changing the pill's dimensions.
	const completedStroke =
		state === "completed"
			? "shadow-[inset_0_0_0_2px_hsl(var(--accent)/0.6)]"
			: null;

	const transcriptLines = transcript?.split("\n") ?? [];
	const visibleTranscriptLines = transcriptLines.slice(-2); // Show last 2 lines

	// Show confidence indicator for live transcription
	const showConfidence = confidence !== undefined && state === "recording";

	// Determine if we should show transcript (including in edit mode)
	const showTranscript =
		transcript &&
		(state === "recording" ||
			state === "transcribing" ||
			state === "partial" ||
			isEditing);

	// Build transcript elements based on state
	let transcriptElements: React.ReactNode = null;
	if (showTranscript) {
		if (isEditing) {
			transcriptElements = (
				<div className="flex flex-col gap-2">
					<textarea
						value={editedText ?? transcript}
						onChange={(e) => onEditedTextChange?.(e.target.value)}
						className="min-h-[60px] max-h-[120px] px-2 py-1.5 text-xs text-accent bg-transparent border border-accent/30 rounded focus:outline-none focus:border-accent resize-none"
						rows={3}
						placeholder={t("captures.pill.editPlaceholder")}
					/>
					<div className="flex items-center justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							className="text-xs"
						>
							{t("captures.pill.cancel")}
						</Button>
						<Button
							size="sm"
							onClick={() => onAccept?.(editedText ?? transcript)}
							className="text-xs"
						>
							{t("captures.pill.accept")}
						</Button>
					</div>
				</div>
			);
		} else {
			transcriptElements = (
				<div className="flex flex-col gap-0.5 mt-0.5 text-xs text-accent/80">
					{visibleTranscriptLines.map((line) => (
						<span
							key={line}
							className={cn(
								"truncate",
								isFinal ? "text-accent" : "text-accent/70 italic",
							)}
						>
							{line}
							{isFinal && (
								<span className="ml-1.5 text-xs text-green-500">?</span>
							)}
						</span>
					))}
					{showConfidence && (
						<div className="flex items-center gap-1 mt-0.5 text-xs text-accent/60">
							<span className="flex items-center gap-0.5">
								<span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
								<span>{Math.round(confidence * 100)}%</span>
							</span>
						</div>
					)}
					{!isEditing &&
						!isFinal &&
						transcript &&
						(state === "recording" || state === "partial") && (
							<div className="flex items-center justify-between mt-0.5">
								<span className="text-xs text-accent/50 italic">
									({t("captures.pill.partial")})
								</span>
								{transcript && (
									<Button
										variant="ghost"
										size="sm"
										onClick={onEdit}
										className="text-xs"
									>
										{t("captures.pill.edit")}
									</Button>
								)}
							</div>
						)}
				</div>
			);
		}

		return (
			<div
				className={cn(
					"inline-flex items-center gap-3 px-4 h-10 rounded-full text-accent",
					"bg-card border border-border shadow-lg",
					completedStroke,
					"transition-opacity duration-300 ease-out",
					visible ? "opacity-100" : "opacity-0 pointer-events-none",
					className,
				)}
			>
				{stopButton}
				<div className="flex flex-col min-w-[104px] max-w-[320px]">
					<span
						className="text-sm font-medium shrink-0 truncate"
						style={{ minWidth: "104px" }}
					>
						{labelText}
						{!isFinal &&
							transcript &&
							(state === "recording" || state === "partial") && (
								<span className="ml-1.5 text-xs text-accent/50 italic">
									({t("captures.pill.partial")})
								</span>
							)}
					</span>
					{transcriptElements}
				</div>
				{state === "recording" && (
					<VUMeter energy={energy ?? 0} isLoud={isLoud ?? false} />
				)}
				<PillAudioBars mode={barMode} />
				<span className="text-xs tabular-nums text-accent/70 font-medium shrink-0 -ml-1">
					{formatElapsed(elapsedMs ?? 0)}
				</span>
			</div>
		);
	}

	function ErrorPill({
		message,
		onDismiss,
		className,
	}: {
		message: string;
		onDismiss?: () => void;
		className?: string;
	}) {
		const { t } = useTranslation();
		const handleClick = async () => {
			try {
				await navigator.clipboard.writeText(message);
			} catch {
				// Clipboard access can be denied in rare webview configs — ignore,
				// we still want the dismiss to land.
			}
			onDismiss?.();
		};

		return (
			<button
				type="button"
				onClick={handleClick}
				title={t("captures.pill.errorCopyTooltip")}
				className={cn(
					"inline-flex items-center gap-3 px-4 h-10 rounded-full",
					"bg-card border border-destructive/40 shadow-lg text-destructive hover:bg-secondary",
					"max-w-[380px] transition-colors",
					"focus:outline-none focus:ring-2 focus:ring-red-400/50",
					className,
				)}
			>
				<AlertCircle className="h-3.5 w-3.5 shrink-0" />
				<span className="text-sm font-medium truncate">{message}</span>
			</button>
		);
	}
}
