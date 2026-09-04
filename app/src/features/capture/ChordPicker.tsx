import { CommandLineIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	canonicalKeyFromEvent,
	displayLabelForKey,
	modifierSideHint,
	sortChordKeys,
} from "@/lib/utils/keyCodes";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/dialog";
import { cn } from "@/lib/utils/cn";

/**
 * Key-chord capture dialog (push-to-talk / toggle-to-talk). Records the
 * peak held set so the user can release before saving. Browser capture
 * only writes config — the Rust global hook does the real listening.
 */
export function ChordPicker({
	open,
	title,
	description,
	initialKeys,
	onSave,
	onCancel,
}: {
	open: boolean;
	title: string;
	description?: string;
	initialKeys: string[];
	onSave: (keys: string[]) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const [pressed, setPressed] = useState<Set<string>>(new Set());
	const [captured, setCaptured] = useState<string[]>(initialKeys);
	const [unsupported, setUnsupported] = useState<string | null>(null);
	const captureRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		setPressed(new Set());
		setCaptured(initialKeys);
		setUnsupported(null);
		const id = window.setTimeout(() => captureRef.current?.focus(), 50);
		return () => window.clearTimeout(id);
	}, [open, initialKeys]);

	const onKeyDown = useCallback((event: KeyboardEvent) => {
		if (event.key === "Escape" || event.key === "Tab") {
			return;
		}
		const canonical = canonicalKeyFromEvent(event);
		if (!canonical) {
			setUnsupported(event.code || event.key || "unknown");
			event.preventDefault();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		setUnsupported(null);
		setPressed((prev) => {
			if (prev.has(canonical)) {
				return prev;
			}
			const next = new Set(prev);
			next.add(canonical);
			setCaptured((prevCaptured) => {
				const candidate = sortChordKeys(Array.from(next));
				if (prev.size === 0) {
					return candidate;
				}
				return candidate.length >= prevCaptured.length ? candidate : prevCaptured;
			});
			return next;
		});
	}, []);

	const onKeyUp = useCallback((event: KeyboardEvent) => {
		if (event.key === "Escape" || event.key === "Tab") {
			return;
		}
		const canonical = canonicalKeyFromEvent(event);
		if (!canonical) {
			return;
		}
		event.preventDefault();
		setPressed((prev) => {
			if (!prev.has(canonical)) {
				return prev;
			}
			const next = new Set(prev);
			next.delete(canonical);
			return next;
		});
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
		};
	}, [open, onKeyDown, onKeyUp]);

	const shown = pressed.size > 0 ? sortChordKeys(Array.from(pressed)) : captured;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onCancel();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? <DialogDescription>{description}</DialogDescription> : null}
				</DialogHeader>
				<div
					ref={captureRef}
					tabIndex={-1}
					className="rounded-md border border-border bg-sunken p-6 outline-none focus:border-ring"
				>
					<div className="flex flex-col items-center gap-3">
						<p className="flex items-center gap-2 text-xs text-muted-foreground">
							<CommandLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
							{pressed.size > 0
								? t("captures.chord.capturing")
								: t("captures.chord.pressShortcut")}
						</p>
						<div className="flex min-h-[2.5rem] flex-wrap items-center justify-center gap-2">
							{shown.length === 0 ? (
								<span className="text-sm italic text-muted-foreground">
									{t("captures.chord.noKeys")}
								</span>
							) : (
								shown.map((k) => <ChordKey key={k} name={k} />)
							)}
						</div>
						{unsupported ? (
							<p role="alert" className="text-xs text-destructive">
								{t("captures.chord.unsupported", { key: unsupported })}
							</p>
						) : null}
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button onClick={() => onSave(captured)} disabled={captured.length === 0}>
						{t("common.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ChordKey({ name }: { name: string }) {
	const side = modifierSideHint(name);
	return (
		<span
			className={cn(
				"relative inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2",
				"border border-border bg-card font-mono text-sm font-medium text-foreground shadow-sm",
			)}
		>
			{displayLabelForKey(name)}
			{side ? (
				<span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-sm bg-accent px-0.5 text-[8px] font-bold leading-none text-white">
					{side}
				</span>
			) : null}
		</span>
	);
}
