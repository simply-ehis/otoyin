/**
 * Instrument Library — manage installed instrument packs.
 * Ported from Resonant (© 2026 Calesthio, AGPL-3.0-only), UI on otoyin primitives.
 */
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/features/instruments/types";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/states";
import {
	useDeleteInstrumentPack,
	useInstrumentPacks,
	useUploadInstrumentPack,
} from "./useInstrumentPacks";

export function InstrumentLibrary() {
	const { t } = useTranslation();
	const { data: packs = [], isLoading } = useInstrumentPacks();
	const uploadMutation = useUploadInstrumentPack();
	const deleteMutation = useDeleteInstrumentPack();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	const totalBytes = packs.reduce((sum, p) => sum + p.bytes, 0);
	const totalInstruments = packs.reduce(
		(sum, p) => sum + p.instruments.length,
		0,
	);

	const handleUpload = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}
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

	const handleDelete = useCallback(
		(packId: string) => {
			deleteMutation.mutate(packId);
		},
		[deleteMutation],
	);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title={t("instruments.title", {
					defaultValue: "Instrument Library",
				})}
				description={t("instruments.description", {
					defaultValue:
						"Install SoundFont packs (SF2/SF3), SFZ instruments, or audio samples for use in the launcher and studio.",
				})}
			/>

			{/* Stats */}
			<div className="flex items-center gap-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
				<span>{packs.length} packs</span>
				<span>{totalInstruments} instruments</span>
				<span>{formatBytes(totalBytes)}</span>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2">
				<input
					ref={fileInputRef}
					type="file"
					accept=".sf2,.sf3,.sfz,.wav,.ogg,.mp3,.flac,.m4a"
					className="hidden"
					onChange={(e) => void handleUpload(e)}
				/>
				<Button
					type="button"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={uploading}
				>
					{uploading
						? t("instruments.uploading", { defaultValue: "Uploading…" })
						: t("instruments.import", { defaultValue: "Import Instrument" })}
				</Button>
			</div>

			{/* Pack list */}
			{isLoading && (
				<div className="text-xs text-muted-foreground">
					{t("common.loading", { defaultValue: "Loading…" })}
				</div>
			)}

			{packs.length === 0 && !isLoading && (
				<div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
					{t("instruments.empty", {
						defaultValue:
							"No instrument packs installed. Import a SoundFont (SF2/SF3), SFZ, or audio file to get started.",
					})}
				</div>
			)}

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
		</div>
	);
}
