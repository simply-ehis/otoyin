import {
	ChevronDownIcon,
	MicrophoneIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

const VIRTUALIZE_ABOVE = 30;

interface CloneSidebarProps {
	voices: VoiceProfileResponse[];
	onVoiceSelected: (voiceId: string) => void;
	onCreateVoice: () => void;
	selectedVoiceId: string | null;
}

function VoiceCard({
	voice,
	selected,
	onSelect,
}: {
	voice: VoiceProfileResponse;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"group relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition-all duration-150",
				selected
					? "bg-accent-muted text-accent-ink border border-accent shadow-[inset_0_1px_0_rgb(0_0_0/10%)]"
					: "border-transparent hover:bg-muted/50 hover:shadow-[0_6px_18px_rgb(0_0_0/10%)]",
			)}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			aria-label={`Open ${voice.name}`}
			aria-pressed={selected}
		>
			<div className="grid size-7 place-items-center overflow-hidden rounded-full bg-secondary text-foreground shrink-0">
				<MicrophoneIcon className="size-3.5" aria-hidden="true" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium truncate text-foreground">
					{voice.name}
				</p>
				<p className="text-xs text-muted-foreground truncate">
					{voice.language ?? "—"} · {voice.sample_count ?? 0} samples
				</p>
			</div>
			{selected && (
				<ChevronDownIcon
					className="size-4 text-accent shrink-0"
					aria-hidden="true"
				/>
			)}
		</button>
	);
}

export function CloneSidebar({
	voices,
	onVoiceSelected,
	onCreateVoice,
	selectedVoiceId,
}: CloneSidebarProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [filter, setFilter] = useState("");

	const filtered = useMemo(
		() =>
			voices.filter(
				(v) =>
					!filter ||
					v.name.toLowerCase().includes(filter.toLowerCase()) ||
					v.language?.toLowerCase().includes(filter.toLowerCase()),
			),
		[voices, filter],
	);

	const virtualizer = useVirtualizer({
		count: filtered.length > VIRTUALIZE_ABOVE ? filtered.length : 0,
		getScrollElement: () => scrollRef.current ?? null,
		estimateSize: () => 64,
		overscan: 6,
		getItemKey: (index) => filtered[index]?.id ?? index,
	});

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-none bg-transparent py-0 ring-0">
			<div className="px-2.5 pt-2.5 pb-1 sticky top-0 z-20 space-y-2 bg-background/95 backdrop-blur-sm">
				<div className="relative">
					<MicrophoneIcon
						className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Search voices"
						aria-label="Search voices"
						className="h-8 bg-muted/50 pl-8"
					/>
				</div>
				{filtered.length > 1 ? (
					<Button
						size="sm"
						variant="outline"
						className="w-full text-xs"
						onClick={onCreateVoice}
					>
						<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
						Clone a voice
					</Button>
				) : null}
			</div>

			<div
				ref={scrollRef}
				className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
			>
				{filtered.length === 0 ? (
					<div className="px-4 py-12 text-center text-xs text-muted-foreground">
						No matching voices
					</div>
				) : filtered.length <= VIRTUALIZE_ABOVE ? (
					<div className="flex flex-col gap-1 p-2">
						{filtered.map((voice) => (
							<VoiceCard
								key={voice.id}
								voice={voice}
								selected={selectedVoiceId === voice.id}
								onSelect={() => onVoiceSelected(voice.id)}
							/>
						))}
					</div>
				) : (
					<div
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((row) => {
							const voice = filtered[row.index];
							if (!voice) {
								return null;
							}
							return (
								<div
									key={row.key}
									ref={virtualizer.measureElement}
									data-index={row.index}
									className="absolute top-0 left-0 w-full px-2 pb-1.5"
									style={{ transform: `translateY(${row.start}px)` }}
								>
									<VoiceCard
										voice={voice}
										selected={selectedVoiceId === voice.id}
										onSelect={() => onVoiceSelected(voice.id)}
									/>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
