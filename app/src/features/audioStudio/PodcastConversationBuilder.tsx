"use client";

import {
	Bars3Icon as GripVertical,
	MicrophoneIcon as Mic,
	PlusIcon as Plus,
	TrashIcon as Trash,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirstDownloadedTtsEngine } from "@/lib/hooks/useFirstDownloadedTtsEngine";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label, Separator } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";

export interface ConversationLine {
	id: string;
	speaker: string;
	text: string;
	engine: string;
	profileId: string | null;
	startMode: "relative_to_previous" | "absolute";
	startOffsetMs: number;
	overlapMs: number;
	track: number;
}

export interface VoiceProfile {
	id: string;
	name: string;
	voice_type: "preset" | "cloned" | "designed";
	preset_engine?: string | null;
	preset_voice_id?: string | null;
	language: string;
}

interface PodcastConversationBuilderProps {
	profiles: VoiceProfile[];
	engines: string[];
	onLinesChange: (lines: ConversationLine[]) => void;
	initialLines?: ConversationLine[];
}

export function PodcastConversationBuilder({
	profiles,
	engines,
	onLinesChange,
	initialLines = [],
}: PodcastConversationBuilderProps) {
	const { t } = useTranslation();
	// Default each new line to the first DOWNLOADED engine offered in `engines`,
	// never a hardcoded "kokoro". Falls back to the first offered engine, then "".
	const firstEngine = useFirstDownloadedTtsEngine();
	const defaultEngine =
		engines.find((e) => e === firstEngine) ?? engines[0] ?? "";
	const [lines, setLines] = useState<ConversationLine[]>(
		initialLines.length > 0
			? initialLines
			: [
					{
						id: crypto.randomUUID(),
						speaker: "Host",
						text: "Welcome to the podcast...",
						engine: defaultEngine,
						profileId: profiles[0]?.id ?? null,
						startMode: "relative_to_previous",
						startOffsetMs: 0,
						overlapMs: 0,
						track: 0,
					},
					{
						id: crypto.randomUUID(),
						speaker: "Guest",
						text: "Thanks for having me...",
						engine: defaultEngine,
						profileId: profiles[1]?.id ?? profiles[0]?.id ?? null,
						startMode: "relative_to_previous",
						startOffsetMs: 0,
						overlapMs: 0,
						track: 1,
					},
				],
	);

	const addLine = () => {
		const newLine: ConversationLine = {
			id: crypto.randomUUID(),
			speaker: `Speaker ${lines.length + 1}`,
			text: "",
			engine: defaultEngine,
			profileId: profiles[lines.length % profiles.length]?.id ?? null,
			startMode: "relative_to_previous",
			startOffsetMs: 0,
			overlapMs: 0,
			track: lines.length % 2,
		};
		setLines((prev) => {
			const next = [...prev, newLine];
			onLinesChange(next);
			return next;
		});
	};

	const removeLine = (id: string) => {
		if (lines.length <= 1) {
			return;
		}
		setLines((prev) => {
			const next = prev.filter((l) => l.id !== id);
			onLinesChange(next);
			return next;
		});
	};

	const updateLine = (id: string, patch: Partial<ConversationLine>) => {
		setLines((prev) => {
			const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
			onLinesChange(next);
			return next;
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">
					{t("podcast.conversation.title")}
				</h3>
				<Button variant="outline" size="sm" onClick={addLine}>
					<Plus className="size-3.5 mr-1.5" />
					{t("podcast.conversation.addLine")}
				</Button>
			</div>

			<Separator />

			{engines.length === 0 && (
				<p className="text-xs text-muted-foreground">
					{t("podcast.conversation.noEngines")}
				</p>
			)}

			<div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin">
				{lines.map((line, index) => (
					<div
						key={line.id}
						className={cn(
							"flex items-start gap-3 p-3 rounded-lg border bg-card",
							index % 2 === 0 ? "border-accent-muted" : "border-strong",
						)}
					>
						<button
							type="button"
							className="flex flex-col items-center justify-center pt-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
							onMouseDown={(e) => e.preventDefault()}
						>
							<GripVertical className="h-4 w-4" />
						</button>

						<div className="flex-1 min-w-0 space-y-2">
							<div className="flex items-center gap-2 flex-wrap">
								<Input
									type="text"
									value={line.speaker}
									onChange={(e) =>
										updateLine(line.id, { speaker: e.target.value })
									}
									placeholder={t("podcast.conversation.speakerPlaceholder")}
									className="w-32 text-xs"
									aria-label={t("podcast.conversation.speakerLabel")}
								/>
								<Label className="text-xs text-muted-foreground shrink-0">
									{t("podcast.conversation.engine")}
								</Label>
								<Select
									value={line.engine}
									onValueChange={(v) => updateLine(line.id, { engine: v })}
								>
									<SelectTrigger className="w-36 h-7 text-xs">
										<SelectValue
											placeholder={t("podcast.conversation.selectEngine")}
										/>
									</SelectTrigger>
									<SelectContent>
										{engines.map((e) => (
											<SelectItem key={e} value={e}>
												{e}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Label className="text-xs text-muted-foreground shrink-0">
									{t("podcast.conversation.profile")}
								</Label>
								<Select
									value={line.profileId ?? ""}
									onValueChange={(v) =>
										updateLine(line.id, { profileId: v || null })
									}
								>
									<SelectTrigger className="w-40 h-7 text-xs">
										<SelectValue
											placeholder={t("podcast.conversation.selectProfile")}
										/>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="" disabled>
											{t("podcast.conversation.noProfile")}
										</SelectItem>
										{profiles.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name} ({p.voice_type})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<Label className="text-xs text-muted-foreground shrink-0 w-16">
									{t("podcast.conversation.text")}
								</Label>
								<Input
									type="text"
									value={line.text}
									onChange={(e) =>
										updateLine(line.id, { text: e.target.value })
									}
									placeholder={t("podcast.conversation.textPlaceholder")}
									className="flex-1 text-xs"
									aria-label={t("podcast.conversation.textLabel")}
								/>
							</div>

							<div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
								<div className="flex items-center gap-1">
									<Label className="shrink-0">
										{t("podcast.conversation.startMode")}
									</Label>
									<Select
										value={line.startMode}
										onValueChange={(v) =>
											updateLine(line.id, {
												startMode:
													v === "absolute"
														? "absolute"
														: "relative_to_previous",
											})
										}
									>
										<SelectTrigger className="w-40 h-7 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="relative_to_previous">
												{t("podcast.conversation.relativeToPrevious")}
											</SelectItem>
											<SelectItem value="absolute">
												{t("podcast.conversation.absolute")}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="flex items-center gap-1">
									<Label className="shrink-0">
										{t("podcast.conversation.offsetMs")}
									</Label>
									<Input
										type="number"
										value={line.startOffsetMs}
										onChange={(e) =>
											updateLine(line.id, {
												startOffsetMs: parseInt(e.target.value, 10) || 0,
											})
										}
										className="w-20 text-xs"
										min={0}
										step={100}
									/>
								</div>
								<div className="flex items-center gap-1">
									<Label className="shrink-0">
										{t("podcast.conversation.overlapMs")}
									</Label>
									<Input
										type="number"
										value={line.overlapMs}
										onChange={(e) =>
											updateLine(line.id, {
												overlapMs: parseInt(e.target.value, 10) || 0,
											})
										}
										className="w-20 text-xs"
										min={0}
										step={100}
									/>
								</div>
								<div className="flex items-center gap-1">
									<Label className="shrink-0">
										{t("podcast.conversation.track")}
									</Label>
									<Input
										type="number"
										value={line.track}
										onChange={(e) =>
											updateLine(line.id, {
												track: parseInt(e.target.value, 10) || 0,
											})
										}
										className="w-12 text-xs"
										min={0}
										max={3}
									/>
								</div>
							</div>
						</div>

						<button
							type="button"
							className="p-1 text-muted-foreground hover:text-destructive hover:bg-danger-soft rounded transition-colors active:scale-[0.97]"
							onClick={() => removeLine(line.id)}
							aria-label={t("podcast.conversation.removeLine")}
						>
							<Trash className="h-4 w-4" />
						</button>
					</div>
				))}
			</div>

			{lines.length === 0 && (
				<div className="text-center py-8 text-muted-foreground">
					<Mic className="size-8 mx-auto mb-2 text-muted-foreground/30" />
					<p className="text-sm">{t("podcast.conversation.noLines")}</p>
				</div>
			)}
		</div>
	);
}
