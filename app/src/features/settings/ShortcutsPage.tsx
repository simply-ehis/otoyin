import { CommandLineIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Card, CardBody, CardTitle } from "@/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";

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

function formatShortcut(keys: string): string {
	return keys
		.replace("ctrl", "Ctrl")
		.replace("shift", "Shift")
		.replace("alt", "Alt")
		.replace("cmd", "⌘")
		.replace("enter", "Enter")
		.replace("escape", "Esc")
		.replace("delete", "Del")
		.replace("+", " + ");
}

/**
 * Keyboard shortcut reference: keymap picker + shortcuts grouped by
 * category. Read-only reference (editing lives in the capture flow).
 */
export function ShortcutsPage() {
	const [keymaps, setKeymaps] = useState<Keymap[]>([]);
	const [selected, setSelected] = useState("otoyin");
	const [current, setCurrent] = useState<Keymap | null>(null);
	const [loading, setLoading] = useState(true);

	const loadKeymaps = useCallback(async () => {
		try {
			setKeymaps(await apiClient.listKeymaps());
		} catch (error: unknown) {
			showStudioErrorToast(error);
		} finally {
			setLoading(false);
		}
	}, []);

	const loadKeymap = useCallback(async (id: string) => {
		try {
			const data = await apiClient.getKeymap(id);
			setCurrent(data.keymap);
		} catch (error: unknown) {
			showStudioErrorToast(error);
		}
	}, []);

	useEffect(() => {
		void loadKeymaps();
	}, [loadKeymaps]);
	useEffect(() => {
		void loadKeymap(selected);
	}, [selected, loadKeymap]);

	const grouped: Record<string, Shortcut[]> = {};
	for (const s of current?.shortcuts ?? []) {
		const list = grouped[s.category];
		if (list) {
			list.push(s);
		} else {
			grouped[s.category] = [s];
		}
	}

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<ScreenHeader
				title="Keyboard shortcuts"
				actions={
					<Select value={selected} onValueChange={setSelected}>
						<SelectTrigger className="w-[200px]" aria-label="Keymap">
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
				}
			/>
			{loading ? (
				<LoadingState label="Loading keymaps" lines={6} />
			) : current ? (
				<Card>
					<CardTitle>{current.name}</CardTitle>
					<CardBody className="mt-4 flex flex-col gap-6">
						{Object.entries(grouped).map(([category, shortcuts]) => (
							<section key={category}>
								<h3 className="mb-3 text-sm font-medium text-muted-foreground">
									{category}
								</h3>
								<ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{shortcuts.map((s) => (
										<li
											key={s.id}
											className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
										>
											<span className="min-w-0 truncate text-sm text-foreground">
												{s.description}
											</span>
											<kbd className="shrink-0 rounded-sm border border-border bg-sunken px-2 py-0.5 font-mono text-xs text-muted-foreground">
												{formatShortcut(s.keys)}
											</kbd>
										</li>
									))}
								</ul>
							</section>
						))}
					</CardBody>
				</Card>
			) : (
				<EmptyState
					icon={<CommandLineIcon aria-hidden="true" />}
					title="No keymap selected"
					body="Pick a keymap above to see its shortcuts."
				/>
			)}
		</div>
	);
}
