import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/input";

interface StoryLine {
	id: string;
	voice: string;
	text: string;
	tone?: string;
}

const TONE_TAGS = [
	"laughter",
	"sigh",
	"question-en",
	"whisper",
	"shout",
] as const;

const SAMPLE_LINES: StoryLine[] = [
	{
		id: "1",
		voice: "narrator",
		text: "It was a dark and stormy night.",
		tone: "whisper",
	},
	{ id: "2", voice: "hero", text: "Who goes there?", tone: "question-en" },
	{ id: "3", voice: "narrator", text: "No one answered.", tone: "sigh" },
];

export function StoryEditor() {
	const [lines, setLines] = useState<StoryLine[]>(SAMPLE_LINES);
	const [cast, setCast] = useState<Record<string, string>>({
		narrator: "",
		hero: "",
	});
	const [dragIndex, setDragIndex] = useState<number | null>(null);

	const addLine = () => {
		setLines((prev) => [
			...prev,
			{
				id: String(Date.now()),
				voice: Object.keys(cast)[0] ?? "narrator",
				text: "",
			},
		]);
	};

	const removeLine = (id: string) => {
		setLines((prev) => prev.filter((l) => l.id !== id));
	};

	const updateLine = (id: string, patch: Partial<StoryLine>) => {
		setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
	};

	const moveLine = (from: number, to: number) => {
		setLines((prev) => {
			const next = [...prev];
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);
			return next;
		});
	};

	const addCast = () => {
		const name = `character${Object.keys(cast).length + 1}`;
		setCast((prev) => ({ ...prev, [name]: "" }));
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
				<h2 className="text-sm font-medium">Story Editor</h2>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="outline" onClick={addCast}>
						<PlusIcon className="mr-1 size-4" aria-hidden="true" />
						Add cast
					</Button>
					<Button size="sm" onClick={addLine}>
						<PlusIcon className="mr-1 size-4" aria-hidden="true" />
						Add line
					</Button>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
				<aside className="w-64 shrink-0 overflow-y-auto rounded-md border border-border bg-card p-3">
					<h3 className="mb-2 text-xs font-medium text-muted-foreground">
						Cast
					</h3>
					<ul className="space-y-2">
						{Object.entries(cast).map(([name, profile]) => (
							<li key={name} className="flex flex-col gap-1">
								<span className="text-xs font-medium">{name}</span>
								<input
									className="rounded border border-border bg-background px-2 py-1 text-xs"
									placeholder="profile id"
									value={profile}
									onChange={(e) =>
										setCast((prev) => ({ ...prev, [name]: e.target.value }))
									}
								/>
							</li>
						))}
					</ul>
				</aside>
				<div className="min-w-0 flex-1 overflow-y-auto">
					<ul className="space-y-3">
						{lines.map((line, idx) => (
							<li
								key={line.id}
								draggable
								onDragStart={() => setDragIndex(idx)}
								onDragOver={(e) => e.preventDefault()}
								onDrop={() => {
									if (dragIndex !== null && dragIndex !== idx) {
										moveLine(dragIndex, idx);
									}
									setDragIndex(null);
								}}
								className={cn(
									"rounded-md border border-border bg-card p-3",
									dragIndex === idx && "opacity-50",
								)}
							>
								<div className="mb-2 flex items-center gap-2">
									<select
										className="rounded border border-border bg-background px-2 py-1 text-xs"
										value={line.voice}
										onChange={(e) =>
											updateLine(line.id, { voice: e.target.value })
										}
									>
										{Object.keys(cast).map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</select>
									<select
										className="rounded border border-border bg-background px-2 py-1 text-xs"
										value={line.tone ?? ""}
										onChange={(e) =>
											updateLine(line.id, { tone: e.target.value || undefined })
										}
									>
										<option value="">no tone</option>
										{TONE_TAGS.map((t) => (
											<option key={t} value={t}>
												[{t}]
											</option>
										))}
									</select>
									<button
										type="button"
										aria-label="Remove line"
										className="ml-auto rounded p-1 hover:bg-muted"
										onClick={() => removeLine(line.id)}
									>
										<TrashIcon className="size-4 text-muted-foreground" />
									</button>
								</div>
								<Textarea
									value={line.text}
									onChange={(e) =>
										updateLine(line.id, { text: e.target.value })
									}
									placeholder="Line text…"
									className="min-h-[60px]"
								/>
								<p className="mt-1 text-[10px] text-muted-foreground">
									Inline token: [voice:{line.voice}]
									{line.tone ? ` [${line.tone}]` : ""}
								</p>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

export default StoryEditor;
