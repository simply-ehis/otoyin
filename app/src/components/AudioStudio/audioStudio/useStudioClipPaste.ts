import { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getClip } from "@/lib/clip";

export function useStudioClipPaste(
	addTrack: (name?: string) => string,
	updateTrack: (id: string, updates: Record<string, unknown>) => void,
	pushUndo: (label: string) => void,
) {
	const { toast } = useToast();
	return useCallback(async () => {
		let clip: import("@/lib/clip").Clip | null = null;
		try {
			clip = await getClip();
		} catch (error) {
			toast({
				title: "Paste failed",
				description: error instanceof Error ? error.message : String(error),
				variant: "destructive",
			});
			return;
		}
		if (!clip) {
			toast({
				title: "Clipboard is empty",
				description: "Copy a clip from History first",
			});
			return;
		}
		if (!clip.audioUrl) {
			toast({ title: "Clip has no audio", variant: "destructive" });
			return;
		}
		pushUndo("Paste clip");
		const id = addTrack(clip.name);
		updateTrack(id, {
			audioUrl: clip.audioUrl,
			duration: clip.durationMs / 1000,
		});
		toast({ title: "Clip pasted as track", description: clip.name });
	}, [addTrack, updateTrack, pushUndo, toast]);
}
