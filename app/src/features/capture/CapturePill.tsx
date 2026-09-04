import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";

/**
 * Dictate-window pill state machine. Shared with the settings preview
 * and the Captures tab. Solid card shell; motion is transform/opacity
 * only (CSS bars, no animation library).
 */
export type PillState =
	| "recording"
	| "transcribing"
	| "refining"
	| "speaking"
	| "completed"
	| "rest"
	| "error"
	| "partial"
	| "offline";

const PILL_LABEL_KEYS: Record<Exclude<PillState, "rest" | "error">, string> = {
	recording: "captures.pill.recording",
	transcribing: "captures.pill.transcribing",
	refining: "captures.pill.refining",
	speaking: "captures.pill.speaking",
	completed: "captures.pill.completed",
	partial: "captures.pill.partial",
	offline: "captures.pill.offline",
};

function barModeFor(state: Exclude<PillState, "error">): "busy" | "live" | "idle" {
	if (state === "recording" || state === "speaking" || state === "partial") {
		return "live";
	}
	if (state === "completed" || state === "rest") {
		return "idle";
	}
	return "busy";
}

/** Five-bar audio meter. Bars scale vertically (transform only). */
export function PillAudioBars({ mode }: { mode: "busy" | "live" | "idle" }) {
	return (
		<div className="flex h-5 shrink-0 items-center gap-1" aria-hidden="true">
			{[0, 1, 2, 3, 4].map((i) => (
				<span
					key={`${mode}-${i}`}
					className={cn(
						"w-[3px] origin-center rounded-full bg-accent",
						mode === "idle" ? "h-2 opacity-40" : "animate-pill-bar",
					)}
					style={
						mode === "idle"
							? undefined
							: { animationDelay: `${i * (mode === "busy" ? 0.08 : 0.15)}s` }
					}
				/>
			))}
		</div>
	);
}

/** Live input-level meter with numeric readout. */
export function VUMeter({ energy, isLoud }: { energy: number; isLoud: boolean }) {
	const clamped = Math.max(0, Math.min(1, energy));
	return (
		<div className="flex min-w-[80px] max-w-[160px] items-center gap-2">
			<div
				role="progressbar"
				aria-label="Audio input level"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(clamped * 100)}
				className="relative h-3 w-full max-w-[120px] overflow-hidden rounded-full bg-sunken"
			>
				<div
					className={cn(
						"absolute inset-y-0 left-0 rounded-full",
						isLoud ? "bg-destructive" : "bg-accent",
					)}
					style={{ width: `${Math.round(clamped * 100)}%` }}
				/>
			</div>
			<span className="min-w-[3ch] font-mono text-xs tabular-nums text-accent">
				{Math.round(clamped * 100)}%
			</span>
		</div>
	);
}

function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

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
	const label = t(state === "rest" ? PILL_LABEL_KEYS.recording : PILL_LABEL_KEYS[state]);
	const live = state === "recording" || state === "partial";
	const showTranscript =
		transcript && (state === "recording" || state === "transcribing" || state === "partial" || isEditing);
	const lines = (transcript ?? "").split("\n").slice(-2);

	return (
		<div
			className={cn(
				"inline-flex h-10 items-center gap-3 rounded-full border border-border bg-card px-4 text-accent shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
				"transition-opacity duration-200",
				visible ? "opacity-100" : "pointer-events-none opacity-0",
				className,
			)}
		>
			{onStop && state === "recording" ? (
				<button
					type="button"
					onClick={onStop}
					aria-label={t("captures.pill.stopAria")}
					className="grid size-5 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className="relative flex size-2">
						<span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-70" />
						<span className="relative size-2 rounded-full bg-accent" />
					</span>
				</button>
			) : (
				<span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
			)}
			<div className="flex min-w-[104px] max-w-[320px] flex-col">
				<span className="shrink-0 truncate text-sm font-medium" style={{ minWidth: "104px" }}>
					{label}
					{!isFinal && transcript && live ? (
						<span className="ml-1.5 text-xs italic text-accent/70">
							({t("captures.pill.partial")})
						</span>
					) : null}
				</span>
				{showTranscript ? (
					isEditing ? (
						<div className="flex flex-col gap-2">
							<textarea
								value={editedText ?? transcript}
								onChange={(e) => onEditedTextChange?.(e.target.value)}
								rows={3}
								placeholder={t("captures.pill.editPlaceholder")}
								aria-label={t("captures.pill.editPlaceholder")}
								className="max-h-[120px] min-h-[60px] resize-none rounded-sm border border-input bg-sunken px-2 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none"
							/>
							<div className="flex items-center justify-end gap-2">
								<Button variant="ghost" size="sm" onClick={onCancel}>
									{t("captures.pill.cancel")}
								</Button>
								<Button size="sm" onClick={() => onAccept?.(editedText ?? transcript ?? "")}>
									{t("captures.pill.accept")}
								</Button>
							</div>
						</div>
					) : (
						<div className="mt-0.5 flex flex-col gap-0.5 text-xs">
							{lines.map((line) => (
								<span
									key={line}
									className={cn("truncate", isFinal ? "text-accent" : "italic text-accent/70")}
								>
									{line}
								</span>
							))}
							{confidence !== undefined && state === "recording" ? (
								<span className="mt-0.5 flex items-center gap-1 text-accent/70">
									<span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
									{Math.round(confidence * 100)}%
								</span>
							) : null}
							{!isEditing && !isFinal && transcript && live ? (
								<span className="mt-0.5 flex items-center justify-between">
									<span className="italic text-accent/70">({t("captures.pill.partial")})</span>
									<Button variant="ghost" size="sm" onClick={onEdit}>
										{t("captures.pill.edit")}
									</Button>
								</span>
							) : null}
						</div>
					)
				) : null}
			</div>
			{state === "recording" ? <VUMeter energy={energy ?? 0} isLoud={isLoud ?? false} /> : null}
			<PillAudioBars mode={barModeFor(state)} />
			<span className="-ml-1 shrink-0 text-xs font-medium tabular-nums text-accent/70">
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
	return (
		<button
			type="button"
			onClick={() => {
				navigator.clipboard.writeText(message).catch(() => {
					// Clipboard can be denied in rare webview configs — dismiss lands anyway.
				});
				onDismiss?.();
			}}
			title={t("captures.pill.errorCopyTooltip")}
			className={cn(
				"inline-flex h-10 max-w-[380px] items-center gap-3 rounded-full border border-destructive/40 bg-danger-soft px-4 text-danger-text transition-colors hover:bg-secondary",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
		>
			<ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate text-sm font-medium">{message}</span>
		</button>
	);
}
