import * as React from "react";

/**
 * Canonical toast store. Same consumer shape as before
 * (`useToast`, `toast`, `Toast`, `dismiss`) — fresh implementation.
 * Toasts auto-dismiss in 4s at the viewport; errors persist until closed.
 */

export interface Toast {
	title?: React.ReactNode;
	description?: React.ReactNode;
	variant?: "default" | "destructive" | "success";
	duration?: number;
	action?: React.ReactNode;
}

interface ToastRecord extends Toast {
	id: string;
	open: boolean;
}

const TOAST_LIMIT = 5;
const DEFAULT_DURATION = 4000;

let count = 0;
function genId() {
	count = (count + 1) % Number.MAX_SAFE_INTEGER;
	return `t${count}`;
}

let memoryState: ToastRecord[] = [];
const listeners = new Set<(toasts: ToastRecord[]) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
	for (const listener of listeners) {
		listener([...memoryState]);
	}
}

function scheduleRemove(id: string, duration: number) {
	if (timers.has(id)) {
		return;
	}
	// `Infinity` means "persist until dismissed or updated" (e.g. the updater
	// flow's available/downloading/ready toasts). Browsers coerce a setTimeout
	// delay of Infinity to 0ms via ToInt32 — guard explicitly so persistent
	// toasts don't flash and vanish.
	if (!Number.isFinite(duration)) {
		return;
	}
	const timer = setTimeout(() => {
		timers.delete(id);
		memoryState = memoryState.filter((t) => t.id !== id);
		emit();
	}, duration);
	timers.set(id, timer);
}

export function toast(props: Toast) {
	const id = genId();
	const duration =
		props.duration ??
		(props.variant === "destructive" ? 8000 : DEFAULT_DURATION);
	memoryState = [{ ...props, id, open: true }, ...memoryState].slice(
		0,
		TOAST_LIMIT,
	);
	emit();
	scheduleRemove(id, duration);
	return {
		id,
		dismiss: () => dismissToast(id),
		update: (newProps: Partial<Toast>) => {
			memoryState = memoryState.map((t) =>
				t.id === id ? { ...t, ...newProps } : t,
			);
			emit();
		},
	};
}

export function dismissToast(id?: string) {
	if (id) {
		const timer = timers.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.delete(id);
		}
		memoryState = memoryState.filter((t) => t.id !== id);
	} else {
		for (const timer of timers.values()) {
			clearTimeout(timer);
		}
		timers.clear();
		memoryState = [];
	}
	emit();
}

export function useToast() {
	const [toasts, setToasts] = React.useState<ToastRecord[]>(memoryState);
	React.useEffect(() => {
		listeners.add(setToasts);
		setToasts([...memoryState]);
		return () => {
			listeners.delete(setToasts);
		};
	}, []);
	return { toasts, toast, dismiss: dismissToast };
}

export type { ToastRecord };
