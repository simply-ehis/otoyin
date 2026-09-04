import { CommandLineIcon as Keyboard } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";

interface Shortcut {
	id: string;
	action: string;
	category: string;
	keys: string;
	description: string;
	enabled: boolean;
}

interface Keymap {
	id: string;
	name: string;
	shortcuts: Shortcut[];
}

export function ShortcutsPage() {
	const [keymaps, setKeymaps] = useState<Keymap[]>([]);
	const [selectedKeymap, setSelectedKeymap] = useState("otoyin");
	const [currentKeymap, setCurrentKeymap] = useState<Keymap | null>(null);
	const [loading, setLoading] = useState(true);

	const loadKeymaps = useCallback(async () => {
		try {
			const data = await apiClient.listKeymaps();
			setKeymaps(data);
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setLoading(false);
		}
	}, []);

	const loadKeymap = useCallback(async (id: string) => {
		try {
			const data = await apiClient.getKeymap(id);
			setCurrentKeymap(data.keymap);
		} catch (error) {
			showStudioErrorToast(error);
		}
	}, []);

	useEffect(() => {
		loadKeymaps();
	}, [loadKeymaps]);

	useEffect(() => {
		loadKeymap(selectedKeymap);
	}, [selectedKeymap, loadKeymap]);

	const formatShortcut = (keys: string) => {
		return keys
			.replace("ctrl", "Ctrl")
			.replace("shift", "Shift")
			.replace("alt", "Alt")
			.replace("cmd", "⌘")
			.replace("enter", "Enter")
			.replace("escape", "Esc")
			.replace("delete", "Del")
			.replace("+", " + ");
	};

	const groupedShortcuts =
		currentKeymap?.shortcuts.reduce(
			(acc, shortcut) => {
				if (!acc[shortcut.category]) {
					acc[shortcut.category] = [];
				}
				acc[shortcut.category].push(shortcut);
				return acc;
			},
			{} as Record<string, Shortcut[]>,
		) || {};

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center gap-3">
				<Keyboard className="size-6" />
				<h1 className="text-2xl font-bold">Keyboard Shortcuts</h1>
			</div>

			<div className="flex gap-4 items-center">
				<span className="text-sm text-muted-foreground">Keymap:</span>
				<Select value={selectedKeymap} onValueChange={setSelectedKeymap}>
					<SelectTrigger className="w-[200px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{keymaps.map((km) => (
							<SelectItem key={km.id} value={km.id}>
								{km.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{loading ? (
				<div className="text-center py-12 text-muted-foreground">
					Loading keymaps…
				</div>
			) : currentKeymap ? (
				<Card>
					<CardHeader>
						<CardTitle>{currentKeymap.name}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						{Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
							<div key={category}>
								<h3 className="text-sm font-medium text-muted-foreground mb-3">
									{category}
								</h3>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
									{shortcuts.map((shortcut) => (
										<div
											key={shortcut.id}
											className="flex items-center justify-between p-3 border rounded-md"
										>
											<span className="text-sm">{shortcut.description}</span>
											<kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
												{formatShortcut(shortcut.keys)}
											</kbd>
										</div>
									))}
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			) : (
				<div className="text-center py-12 text-muted-foreground">
					No keymap selected
				</div>
			)}
		</div>
	);
}
