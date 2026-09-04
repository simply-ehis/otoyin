import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/Spinner";
import { usePlatform } from "@/platform/PlatformContext";
import { ModelDeleteDialog } from "./ModelDeleteDialog";
import { ModelDetailDialog } from "./ModelDetailDialog";
import { ModelList } from "./ModelList";
import { ModelMigration } from "./ModelMigration";
import { ModelStorage } from "./ModelStorage";
import { useModelManagement } from "./useModelManagement";

type ModelManagementVM = ReturnType<typeof useModelManagement>;

function ModelManagementView(vm: ModelManagementVM) {
	const { t } = useTranslation();
	const platform = usePlatform();
	const {
		modelStatus,
		isLoading,
		cacheDir,
		hfModelInfo,
		hfLoading,
		catalog,
		entitlements,
		erroredDownloads,
		errorCount,
		downloadProgressMap,
		handleDownload,
		handleCancel,
		cancelMutation,
		clearAllMutation,
		deleteMutation,
		unloadMutation,
		detailOpen,
		setDetailOpen,
		freshSelectedModel,
		selectedState,
		selectedError,
		license,
		migrating,
		setMigrating,
		migrationProgress,
		setMigrationProgress,
		pendingMigrateDir,
		setPendingMigrateDir,
		consoleOpen,
		setConsoleOpen,
		deleteDialogOpen,
		setDeleteDialogOpen,
		modelToDelete,
		setModelToDelete,
		sections,
		getModelState,
		openModelDetail,
		formatSize,
	} = vm;

	return (
		<div className="flex flex-col h-full">
			<div className="shrink-0 pb-3">
				<h1 className="text-base font-semibold">{t("models.title")}</h1>
				<p className="text-xs text-muted-foreground">{t("models.subtitle")}</p>
			</div>
			{platform.metadata.isTauri && cacheDir && (
				<ModelStorage
					cacheDir={cacheDir}
					migrating={migrating}
					setPendingMigrateDir={setPendingMigrateDir}
				/>
			)}
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<Spinner size="md" />
				</div>
			) : (
				modelStatus && (
					<ModelList
						sections={sections}
						getModelState={getModelState}
						openModelDetail={openModelDetail}
						downloadProgressMap={downloadProgressMap}
						consoleOpen={consoleOpen}
						setConsoleOpen={setConsoleOpen}
						clearAllMutation={clearAllMutation}
						erroredDownloads={erroredDownloads}
						errorCount={errorCount}
						formatSize={formatSize}
					/>
				)
			)}{" "}
			<ModelDetailDialog
				detailOpen={detailOpen}
				setDetailOpen={setDetailOpen}
				freshSelectedModel={freshSelectedModel}
				selectedState={selectedState}
				selectedError={selectedError}
				hfLoading={hfLoading}
				hfModelInfo={hfModelInfo}
				license={license}
				downloadProgressMap={downloadProgressMap}
				handleDownload={handleDownload}
				handleCancel={handleCancel}
				cancelMutation={cancelMutation}
				unloadMutation={unloadMutation}
				setModelToDelete={setModelToDelete}
				setDeleteDialogOpen={setDeleteDialogOpen}
				catalog={catalog}
				entitlements={entitlements}
			/>
			<ModelDeleteDialog
				deleteDialogOpen={deleteDialogOpen}
				setDeleteDialogOpen={setDeleteDialogOpen}
				modelToDelete={modelToDelete}
				deleteMutation={deleteMutation}
			/>
			<ModelMigration
				pendingMigrateDir={pendingMigrateDir}
				setPendingMigrateDir={setPendingMigrateDir}
				migrating={migrating}
				setMigrating={setMigrating}
				migrationProgress={migrationProgress}
				setMigrationProgress={setMigrationProgress}
			/>
		</div>
	);
}

export function ModelManagement() {
	const vm = useModelManagement();
	return <ModelManagementView {...vm} />;
}
