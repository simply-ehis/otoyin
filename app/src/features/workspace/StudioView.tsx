import { ArrowUpTrayIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RecordTakeButton } from "@/features/capture/RecordTakeButton";
import { BeatMapPanel } from "@/features/instruments/BeatMapPanel";
import { DrumMachinePanel } from "@/features/instruments/DrumMachinePanel";
import { InstrumentBrowser } from "@/features/instruments/InstrumentBrowser";
import { InstrumentPreview } from "@/features/instruments/InstrumentPreview";
import { apiClient } from "@/lib/api/client";
import { ERR_DESC_SFX_FAILED, ERR_TITLE_SFX } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/input";
import { Label, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";
import { FreeSoundsPanel } from "./SoundEffectsView";

const NOISE_TYPES = ["white", "pink", "brown", "blue", "violet"];

const [openSection, setOpenSection] = useState<string | null>(null);

function SfxPanel() {
	const { toast } = useToast();
	const [prompt, setPrompt] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const mut = useMutation({
		mutationFn: () => apiClient.generateSFX({ prompt, duration_seconds: 5 }),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({
				title: ERR_TITLE_SFX,
				description: ERR_DESC_SFX_FAILED,
				variant: "destructive",
			}),
	});

	const handleFileDrop = (file: File) => {
		if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
			toast({
				title: "Unsupported file type",
				description: "Drop a .txt or .md file to use as the SFX prompt.",
				variant: "destructive",
			});
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result;
			if (typeof content === "string") {
				setPrompt(content.trim());
			}
		};
		reader.readAsText(file);
	};

	return (
		<div className="max-w-xl space-y-3">
			<Label htmlFor="sfx-prompt">Describe the sound effect</Label>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: file-drop zone (mouse-only enhancement); the prompt input stays keyboard-accessible and file picking has button alternatives. */}
			<div
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					const file = e.dataTransfer.files[0];
					if (file) {
						handleFileDrop(file);
					}
				}}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={(e) => {
					e.preventDefault();
					setDragOver(false);
				}}
				className={cn(
					"relative rounded-md border-2 border-dashed transition-colors",
					dragOver ? "border-accent bg-accent/5" : "border-transparent",
				)}
			>
				<Textarea
					id="sfx-prompt"
					placeholder="Rain on a tin roof, distant thunder"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					className="min-h-24 text-sm"
				/>
				{dragOver ? (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-accent/10">
						<span className="flex items-center gap-2 text-sm font-medium text-accent">
							<ArrowUpTrayIcon className="size-4" aria-hidden="true" />
							Drop .txt or .md file
						</span>
					</div>
				) : null}
			</div>
			<p className="text-xs text-muted-foreground/70">
				Drop a .txt or .md file onto the text area
			</p>
			<Button
				type="button"
				size="sm"
				disabled={!prompt.trim() || mut.isPending}
				title="Generate sound effect"
				aria-label="Generate sound effect"
				onClick={() => mut.mutate()}
			>
				{mut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				{mut.isPending ? "Generating…" : "Generate with Stable Audio Open"}
			</Button>
		</div>
	);
}

function NoisePanel() {
	const { toast } = useToast();
	const [type, setType] = useState("white");
	const mut = useMutation({
		mutationFn: () =>
			apiClient.generateNoise({
				noise_type: type,
				duration: 3,
				amplitude: 0.5,
			}),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({ title: "Noise generation failed", variant: "destructive" }),
	});

	return (
		<div className="max-w-xl space-y-3">
			<Label htmlFor="noise-type">Noise color</Label>
			<Select value={type} onValueChange={setType}>
				<SelectTrigger id="noise-type" className="h-8 w-44 text-xs">
					<SelectValue placeholder="Noise type" />
				</SelectTrigger>
				<SelectContent>
					{NOISE_TYPES.map((n) => (
						<SelectItem key={n} value={n}>
							{n.charAt(0).toUpperCase() + n.slice(1)} noise
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				size="sm"
				disabled={mut.isPending}
				title="Generate noise"
				aria-label="Generate noise"
				onClick={() => mut.mutate()}
			>
				{mut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				{mut.isPending ? "Generating…" : "Generate"}
			</Button>
		</div>
	);
}

export function StudioView() {
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Studio" />
			<Tabs defaultValue="instruments">
				<TabsList aria-label="Studio sections">
					<TabsTrigger value="instruments">Instruments</TabsTrigger>
					<TabsTrigger value="sfx">SFX</TabsTrigger>
					<TabsTrigger value="noise">Noise</TabsTrigger>
					<TabsTrigger value="free-sounds">Free Sounds</TabsTrigger>
				</TabsList>
				<TabsContent value="instruments">
					<InstrumentPreview />
					<div className="space-y-2">
						{[
							{ id: "instruments", label: "Instruments", node: <InstrumentBrowser /> },
							{ id: "drums", label: "Drum machine", node: <DrumMachinePanel /> },
							{ id: "beatmap", label: "Beat map", node: <BeatMapPanel /> },
						].map((sec) => {
							const open = openSection === sec.id;
							return (
								<div key={sec.id} className="rounded-md border border-border bg-card">
									<button
										type="button"
										className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
										aria-expanded={open}
										onClick={() =>
											setOpenSection(open ? "" : sec.id)
										}
									>
										{sec.label}
										<ChevronDownIcon
											className={cn(
												"size-3.5 transition-transform",
												open && "rotate-180",
											)}
											aria-hidden="true"
										/>
									</button>
									{open ? (
										<div className="border-t border-border p-3">{sec.node}</div>
									) : null}
								</div>
							);
						})}
					</div>
				</TabsContent>
				<TabsContent value="sfx">
					<SfxPanel />
				</TabsContent>
				<TabsContent value="noise">
					<NoisePanel />
				</TabsContent>
				<TabsContent value="free-sounds">
					<FreeSoundsPanel />
				</TabsContent>
			</Tabs>
			{/* Floating record-take action */}
			<div className="fixed bottom-6 right-6 z-40">
				<div className="rounded-full border border-border bg-card p-2 shadow-lg">
					<RecordTakeButton filenameBase="studio-take" />
				</div>
			</div>
		</div>
	);
}
