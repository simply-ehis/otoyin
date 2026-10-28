import { Outlet } from "@tanstack/react-router";
import { AppFrame } from "@/layouts/AppFrame/AppFrame";

/**
 * Root layout for the application. Wraps AppFrame and provides the
 * TanStack Router Outlet for nested route rendering.
 */
export function RootLayout() {
	return (
		<AppFrame>
			<Outlet />
		</AppFrame>
	);
}
