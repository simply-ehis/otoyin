import { SignalIcon as AudioLines } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

import type { HistoryResponse } from "@/lib/api/types";

interface VersionListProps {
	gen: HistoryResponse;
	onPlayVersion: (
		generationId: string,
		versionId: string,
		text: string,
		profileId: string,
	) => void;
	onSwitchVersion: (generationId: string, versionId: string) => void;
}

export function VersionList({
	gen,
	onPlayVersion,
	onSwitchVersion,
}: VersionListProps) {
	return (
		<motion.div
			initial={{ height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			exit={{ height: 0, opacity: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
			className="overflow-hidden"
		>
			<div className="border-t border-border/50">
				<div className="divide-y divide-border/40">
					{gen.versions?.map((v) => {
						const sourceVersion = v.source_version_id
							? gen.versions?.find((sv) => sv.id === v.source_version_id)
							: null;
						const showSource =
							!!sourceVersion?.effects_chain &&
							sourceVersion.effects_chain.length > 0;

						return (
							<button
								key={v.id}
								type="button"
								className="flex items-center gap-2 w-full h-9 px-3 text-left hover:bg-muted/50 transition-colors"
								onClick={() => {
									onPlayVersion(gen.id, v.id, gen.text, gen.profile_id);
									if (!v.is_default) {
										onSwitchVersion(gen.id, v.id);
									}
								}}
							>
								<AudioLines className="size-3 shrink-0 text-muted-foreground" />
								<span className="truncate text-xs font-medium">{v.label}</span>
								{v.effects_chain && v.effects_chain.length > 0 && (
									<span className="text-xs text-muted-foreground truncate">
										{v.effects_chain.map((e) => e.type).join(" ? ")}
									</span>
								)}
								{showSource && (
									<span className="text-xs text-muted-foreground/60 truncate">
										from {sourceVersion?.label}
									</span>
								)}
								<span className="flex-1" />
								{v.is_default && (
									<span className="text-xs bg-accent-muted text-accent px-1.5 py-0.5 rounded-full">
										active
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</motion.div>
	);
}
