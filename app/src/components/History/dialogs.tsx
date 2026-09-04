import { EffectsChainEditor } from "@/components/Effects/EffectsChainEditor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import type { HistoryTableController } from "./hooks/useHistoryTable";

export function DeleteDialog({ c }: { c: HistoryTableController }) {
	const { t } = c;
	return (
		<Dialog open={c.deleteDialogOpen} onOpenChange={c.setDeleteDialogOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("history.deleteDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("history.deleteDialog.body", {
							name: c.generationToDelete?.name,
						})}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							c.setDeleteDialogOpen(false);
							c.setGenerationToDelete(null);
						}}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={c.handleDeleteConfirm}
						disabled={c.deleteGeneration.isPending}
					>
						{c.deleteGeneration.isPending
							? t("history.deleteDialog.deleting")
							: t("common.delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ClearFailedDialog({ c }: { c: HistoryTableController }) {
	const { t } = c;
	return (
		<Dialog
			open={c.clearFailedDialogOpen}
			onOpenChange={c.setClearFailedDialogOpen}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("history.clearFailedDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("history.clearFailedDialog.body", { count: c.failedCount })}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => c.setClearFailedDialogOpen(false)}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={c.handleClearFailedConfirm}
						disabled={c.clearFailed.isPending}
					>
						{c.clearFailed.isPending
							? t("history.clearFailedDialog.clearing")
							: t("history.clearFailedDialog.clearAll")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ImportDialog({ c }: { c: HistoryTableController }) {
	const { t } = c;
	return (
		<Dialog open={c.importDialogOpen} onOpenChange={c.setImportDialogOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("history.importDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("history.importDialog.body", { name: c.selectedFile?.name })}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							c.setImportDialogOpen(false);
							c.setSelectedFile(null);
							if (c.fileInputRef.current) {
								c.fileInputRef.current.value = "";
							}
						}}
					>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={c.handleImportConfirm}
						disabled={c.importGeneration.isPending || !c.selectedFile}
					>
						{c.importGeneration.isPending
							? t("history.importDialog.importing")
							: t("history.importDialog.action")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function EffectsDialog({ c }: { c: HistoryTableController }) {
	const { t } = c;
	return (
		<Dialog open={c.effectsDialogOpen} onOpenChange={c.setEffectsDialogOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{t("history.effectsDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("history.effectsDialog.body")}
					</DialogDescription>
				</DialogHeader>
				{c.effectsTargetVersions.length > 1 && (
					<div className="space-y-1.5">
						<label
							htmlFor="effects-source"
							className="text-xs font-medium text-muted-foreground"
						>
							{t("history.effectsDialog.sourceLabel")}
						</label>
						<Select
							value={c.effectsSourceVersionId ?? ""}
							onValueChange={(val) => c.setEffectsSourceVersionId(val || null)}
						>
							<SelectTrigger id="effects-source" className="h-8 text-xs">
								<SelectValue
									placeholder={t("history.effectsDialog.sourcePlaceholder")}
								/>
							</SelectTrigger>
							<SelectContent>
								{c.effectsTargetVersions.map((v) => (
									<SelectItem key={v.id} value={v.id} className="text-xs">
										{v.label}
										{v.effects_chain && v.effects_chain.length > 0 && (
											<span className="text-muted-foreground ml-1.5">
												({v.effects_chain.map((e) => e.type).join(" + ")})
											</span>
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				<div className="py-2 max-h-80 overflow-y-auto">
					<EffectsChainEditor
						value={c.effectsChain}
						onChange={c.setEffectsChain}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => c.setEffectsDialogOpen(false)}
					>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={c.handleApplyEffectsConfirm}
						disabled={c.applyingEffects || c.effectsChain.length === 0}
					>
						{c.applyingEffects
							? t("history.effectsDialog.applying")
							: t("history.effectsDialog.apply")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
