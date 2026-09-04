const isMacOS = navigator.userAgent.includes("Mac");

export function TitleBarDragRegion() {
	return (
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
	);
}
