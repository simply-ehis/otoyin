/**
 * Instrument Library — manage installed instrument packs.
 * Ported from Resonant (© 2026 Calesthio, AGPL-3.0-only), UI on otoyin primitives.
 */
import {
	ArrowUpTrayIcon,
	MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/features/instruments/types";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/states";
import {
	useDeleteInstrumentPack,
	useInstrumentPacks,
	useUploadInstrumentPack,
} from "./useInstrumentPacks";

const SUPPORTED_FORMATS = [
	{ ext: ".sf2", label: "SoundFont 2", desc: "Standard MIDI instrument format" },
	{ ext: ".sf3", label: "SoundFont 3", desc: "OGG-compressed SoundFont" },
	{ ext: ".sfz", label: "SFZ", desc: "Text-based sampler format" },
	{ ext: ".wav/.ogg/.mp3", label: "Audio samples", desc: "Individual instrument hits" },
];

const FREE_RESOURCES = [
	{ label: "FreeSound.org", url: "https://freesound.org" },
	{ label: "MuseScore SoundFonts", url: "https://musescore.org/en/handbook/soundfonts" },
	{ label: "SF2 SoundFonts", url: "https://www.polyphone-soundfonts.com" },
];

export function InstrumentLibrary() {
	const { t } = useTranslation();
	const { data: packs = [], isLoading } = useInstrumentPacks();
	const uploadMutation = useUploadInstrumentPack();
	const deleteMutation = useDeleteInstrumentPack();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);

	const totalBytes = packs.reduce((sum, p) => sum + p.bytes, 0);
	const totalInstruments = packs.reduce(
		(sum, p) => sum + p.instruments.length,
		0,
	);

	const handleUpload = useCallback(
		async (file: File) => {
			setUploading(true);
			try {
				await uploadMutation.mutateAsync({
					file,
					name: file.name.replace(/\.[^.]+$/, ""),
				});
			} catch (err: unknown) {
				showStudioErrorToast(err);
			} finally {
				setUploading(false);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			}
		},
		[uploadMutation],
	);

	const handleFileInput = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				await handleUpload(file);
			}
		},
		[handleUpload],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file) {
				await handleUpload(file);
			}
		},
		[handleUpload],
	);

	const handleDelete = useCallback(
		(packId: string) => {
			deleteMutation.mutate(packId);
		},
		[deleteMutation],
	);

	return (
		<section
			aria-label="Instrument Library"
			className="flex h-full flex-col gap-4 overflow-y-auto p-4"
			onDrop={handleDrop}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
		>
			<ScreenHeader
				title={t("instruments.title", {
					defaultValue: "Instrument Library",
				})}
				description={t("instruments.description", {
					defaultValue:
						"Install SoundFont packs (SF2/SF3), SFZ instruments, or audio samples for use in the launcher and studio.",
				})}
				helpPath="/instruments"
			/>

			{/* Stats */}
			{packs.length > 0 && (
				<div className="flex items-center gap-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
					<span>{packs.length} packs</span>
					<span>{totalInstruments} instruments</span>
					<span>{formatBytes(totalBytes)}</span>
				</div>
			)}

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".sf2,.sf3,.sfz,.wav,.ogg,.mp3,.flac,.m4a"
				className="hidden"
				onChange={(e) => void handleFileInput(e)}
			/>

			{/* Empty state — large drop zone */}
			{packs.length === 0 && !isLoading && (
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className={cn(
						"flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
						dragOver
							? "border-accent bg-accent/5"
							: "border-border hover:border-muted-foreground/50 hover:bg-secondary/30",
					)}
				>
					<div className="flex size-14 items-center justify-center rounded-full bg-secondary">
						<MusicalNoteIcon
							className="size-7 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>
					<h3 className="mt-4 text-sm font-medium text-foreground">
						{uploading ? "Importing…" : "Drop instrument files here"}
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						or{" "}
						<span className="text-accent hover:underline">click to browse</span>
					</p>

					{/* Supported formats */}
					<div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-left">
						{SUPPORTED_FORMATS.map((fmt) => (
							<div key={fmt.ext}>
								<code className="text-xs font-medium text-foreground">
									{fmt.ext}
								</code>
								<p className="text-[11px] text-muted-foreground">{fmt.desc}</p>
							</div>
						))}
					</div>

					{/* Free resources */}
					<div className="mt-6 border-t border-border pt-4">
						<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
							Free SoundFonts
						</p>
						<div className="mt-1.5 flex flex-wrap justify-center gap-3">
							{FREE_RESOURCES.map((res) => (
								<a
									key={res.label}
									href={res.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-accent hover:underline"
									onClick={(e) => e.stopPropagation()}
								>
									{res.label} →
								</a>
							))}
						</div>
					</div>
				</button>
			)}

			{/* Drop overlay when packs exist */}
			{packs.length > 0 && dragOver ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
					<div className="rounded-lg border-2 border-dashed border-accent bg-card p-12 text-center">
						<ArrowUpTrayIcon className="mx-auto size-10 text-accent" aria-hidden="true" />
						<p className="mt-3 text-sm font-medium text-foreground">
							Drop to import instrument pack
						</p>
					</div>
				</div>
			) : null}

			{/* Actions when packs exist */}
			{packs.length > 0 && (
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={uploading}
					>
						<ArrowUpTrayIcon className="mr-1.5 size-3.5" aria-hidden="true" />
						{uploading
							? t("instruments.uploading", { defaultValue: "Uploading…" })
							: t("instruments.import", { defaultValue: "Import Instrument" })}
					</Button>
				</div>
			)}

			{/* Loading */}
			{isLoading && (
				<div className="text-xs text-muted-foreground">
					{t("common.loading", { defaultValue: "Loading…" })}
				</div>
			)}

			{/* Pack list */}
			{packs.map((pack) => (
				<div
					key={pack.id}
					className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
				>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">{pack.name}</div>
						<div className="text-xs text-muted-foreground">
							{pack.format} · {pack.instruments.length} instruments ·{" "}
							{formatBytes(pack.bytes)}
						</div>
					</div>
					<Button
						type="button"
						size="sm"
						variant="destructive"
						onClick={() => handleDelete(pack.id)}
					>
						{t("common.remove", { defaultValue: "Remove" })}
					</Button>
				</div>
			))}
		</section>
	);
}
