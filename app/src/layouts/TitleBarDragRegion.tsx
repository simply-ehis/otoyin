import {
	MinusIcon,
	Square2StackIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isMacOS = navigator.userAgent.includes("Mac");

function WindowControls() {
	// Web build has a browser chrome; the frameless Tauri shell needs its
	// own buttons. Rendered outside the drag region so clicks never start
	// a drag. Close flows through the Rust CloseRequested handler, which
	// stops the backend before the window is destroyed.
	if (!isTauri() || isMacOS) {
		return null;
	}
	const win = getCurrentWindow();
	const btn =
		"pointer-events-auto flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
	return (
		<div className="pointer-events-none fixed top-0 right-0 z-20 flex">
			<button
				type="button"
				title="Minimize"
				aria-label="Minimize"
				className={btn}
				onClick={() => void win.minimize()}
			>
				<MinusIcon className="h-4 w-4" />
			</button>
			<button
				type="button"
				title="Maximize"
				aria-label="Maximize"
				className={btn}
				onClick={() => void win.toggleMaximize()}
			>
				<Square2StackIcon className="h-4 w-4" />
			</button>
			<button
				type="button"
				title="Close"
				aria-label="Close"
				className={`${btn} hover:!bg-red-600 hover:!text-white`}
				onClick={() => void win.close()}
			>
				<XMarkIcon className="h-4 w-4" />
			</button>
		</div>
	);
}

export function TitleBarDragRegion() {
	return (
		<>
			<div
				data-tauri-drag-region
				className="pointer-events-none fixed top-0 left-0 right-0 z-10"
				style={{ height: isMacOS ? 28 : 32 }}
				aria-hidden="true"
			>
				<div
					className="pointer-events-auto h-full w-full"
					data-tauri-drag-region
				/>
			</div>
			<WindowControls />
		</>
	);
}
