import { useEffect } from "react";
import { usePlatform } from "@/platform/PlatformContext";
import { useToast } from "@/ui/use-toast";

/**
 * Subscribes to `server-error` events from the Rust sidecar and shows a
 * toast. Mount once at the top of the app (AppFrame).
 */
export function useServerErrorToast() {
	const { toast } = useToast();
	const platform = usePlatform();

	useEffect(() => {
		const unsub = platform.lifecycle.subscribeToServerErrors((err) => {
			const detail = err.errors?.length ? `\n${err.errors.join("\n")}` : "";
			toast({
				title: "Server failed to start",
				description: `${err.message}${detail}`.trim(),
				variant: "destructive",
			});
		});
		return unsub;
	}, [toast, platform]);
}
