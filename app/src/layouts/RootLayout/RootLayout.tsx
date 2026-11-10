import { Outlet } from "@tanstack/react-router";
import { AppFrame } from "@/layouts/AppFrame/AppFrame";
import { useAssistantCommands } from "@/lib/assistantCommands";

/**
 * Root layout for the application. Wraps AppFrame and provides the
 * TanStack Router Outlet for nested route rendering.
 *
 * Mounts the assistant command harness once — it listens for
 * `assistant-command` DOM events emitted by the chat stream and routes
 * them through the typed command registry (design doc §9).
 */
export function RootLayout() {
	useAssistantCommands();
	return (
		<AppFrame>
			<Outlet />
		</AppFrame>
	);
}
