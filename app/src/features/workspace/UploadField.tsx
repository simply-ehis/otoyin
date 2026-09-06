import { Badge, Spinner } from "@/ui/primitives";

/**
 * Accessible audio file picker: the label IS the drop target and the
 * keyboard control, wrapping a hidden input (no document.createElement).
 */
export function UploadField({
	id,
	label,
	fileName,
	uploading,
	onFile,
}: {
	id: string;
	label: string;
	fileName: string;
	uploading: boolean;
	onFile: (file: File) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<label
				htmlFor={id}
				className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-sunken px-3 text-xs text-foreground transition-colors hover:border-strong focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
			>
				<input
					id={id}
					type="file"
					accept="audio/*"
					className="hidden"
					disabled={uploading}
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) {
							onFile(f);
						}
					}}
				/>
				{uploading ? <Spinner size="xs" className="mr-1.5" /> : null}
				{uploading ? "Uploading…" : label}
			</label>
			{fileName ? <Badge tone="neutral">{fileName}</Badge> : null}
		</div>
	);
}
