import {
	CheckCircleIcon as CircleCheck,
	XCircleIcon as CircleX,
	ArrowTopRightOnSquareIcon as ExternalLink,
	ServerIcon as HardDrive,
	KeyIcon as Key,
	SparklesIcon as Sparkles,
	UserGroupIcon as Users,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/Spinner";
import { StarRating } from "@/components/ui/star-rating";
import type {
	ActiveDownloadTask,
	Catalog,
	EntitlementResponse,
	HuggingFaceModelInfo,
	ModelStatus,
} from "@/lib/api/types";
import type {
	CancelMutationLike,
	ModelState,
	UnloadMutationLike,
} from "./ModelDetailActions";
import { DetailActions } from "./ModelDetailActions";
import { DetailCardInfo, SampleAudioPreview } from "./ModelMetadata";
import {
	EmotionSelector,
	TagPreview,
	VoiceMixer,
	VoiceSelector,
} from "./ModelVoiceComponents";
import { formatSize, MODEL_DESCRIPTIONS } from "./modelUtils";
import { getPaidProduct, hasLicense } from "./useModelSections";

interface ModelDetailDialogProps {
	detailOpen: boolean;
	setDetailOpen: (open: boolean) => void;
	freshSelectedModel: ModelStatus | null;
	selectedState: ModelState | null;
	selectedError?: ActiveDownloadTask;
	hfLoading: boolean;
	hfModelInfo?: HuggingFaceModelInfo;
	license?: string;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	handleDownload: (modelName: string) => void;
	handleCancel: (modelName: string) => void;
	cancelMutation: CancelMutationLike;
	unloadMutation: UnloadMutationLike;
	setModelToDelete: (model: {
		name: string;
		displayName: string;
		sizeMb?: number;
	}) => void;
	setDeleteDialogOpen: (open: boolean) => void;
	catalog?: Catalog;
	entitlements?: EntitlementResponse;
}

export function ModelDetailDialog({
	detailOpen,
	setDetailOpen,
	freshSelectedModel,
	selectedState,
	selectedError,
	hfLoading,
	hfModelInfo,
	license,
	downloadProgressMap,
	handleDownload,
	handleCancel,
	cancelMutation,
	unloadMutation,
	setModelToDelete,
	setDeleteDialogOpen,
	catalog,
	entitlements,
}: ModelDetailDialogProps) {
	return (
		<Dialog open={detailOpen} onOpenChange={setDetailOpen}>
			<DialogContent className="sm:max-w-md">
				{freshSelectedModel && (
					<DetailContent
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
				)}
			</DialogContent>
		</Dialog>
	);
}

interface DetailContentProps {
	freshSelectedModel: ModelStatus;
	selectedState: ModelState | null;
	selectedError?: ActiveDownloadTask;
	hfLoading: boolean;
	hfModelInfo?: HuggingFaceModelInfo;
	license?: string;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	handleDownload: (modelName: string) => void;
	handleCancel: (modelName: string) => void;
	cancelMutation: CancelMutationLike;
	unloadMutation: UnloadMutationLike;
	setModelToDelete: (model: {
		name: string;
		displayName: string;
		sizeMb?: number;
	}) => void;
	setDeleteDialogOpen: (open: boolean) => void;
	catalog?: Catalog;
	entitlements?: EntitlementResponse;
}

function DetailContent({
	freshSelectedModel,
	selectedState,
	selectedError,
	hfLoading,
	hfModelInfo,
	license,
	downloadProgressMap,
	handleDownload,
	handleCancel,
	cancelMutation,
	unloadMutation,
	setModelToDelete,
	setDeleteDialogOpen,
	catalog,
	entitlements,
}: DetailContentProps) {
	const { t } = useTranslation();
	const paidProduct = getPaidProduct(freshSelectedModel.model_name, catalog);
	const licensed = hasLicense(
		freshSelectedModel.model_name,
		catalog,
		entitlements,
	);
	const [selectedVoice, setSelectedVoice] = useState<string | undefined>();
	const [mixedVoices, setMixedVoices] = useState<string[]>([]);
	const [selectedEmotion, setSelectedEmotion] = useState<string | undefined>();

	const presetVoices = freshSelectedModel.preset_voices ?? [];
	const hasPresetVoices = presetVoices.length > 0;
	const supportsMixing = freshSelectedModel.supports_voice_mixing ?? false;
	const hasEmotionControl = freshSelectedModel.emotion_control ?? false;
	const hasParalinguisticTags = freshSelectedModel.paralinguistic_tags ?? false;
	const supportedTags = freshSelectedModel.supported_tags ?? [];

	const toggleMixedVoice = (voiceId: string) => {
		setMixedVoices((prev) =>
			prev.includes(voiceId)
				? prev.filter((id) => id !== voiceId)
				: [...prev, voiceId].slice(-3),
		);
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle className="text-base">
					{freshSelectedModel.display_name}
				</DialogTitle>
				<DialogDescription className="flex items-center gap-2">
					{freshSelectedModel.hf_repo_id ? (
						<a
							href={`https://huggingface.co/${freshSelectedModel.hf_repo_id}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 hover:underline text-xs"
						>
							{freshSelectedModel.hf_repo_id}
							<ExternalLink className="size-3" />
						</a>
					) : (
						<span className="text-xs">{freshSelectedModel.model_name}</span>
					)}
				</DialogDescription>
			</DialogHeader>

			<div className="space-y-3 pt-1">
				<div className="flex items-center gap-2 flex-wrap">
					{freshSelectedModel.loaded && (
						<Badge className="text-xs h-4 bg-accent/15 text-accent border-accent/30">
							<CircleCheck className="size-3 mr-0.5" />
							{t("models.status.loaded")}
						</Badge>
					)}
					{paidProduct && !licensed && (
						<Badge className="text-xs h-4 bg-amber-500/15 text-amber-500 border-amber-500/30">
							<Key className="size-3 mr-0.5" />${paidProduct.price_usd}
						</Badge>
					)}
					{paidProduct && licensed && (
						<Badge className="text-xs h-4 bg-green-500/15 text-green-500 border-green-500/30">
							<Key className="size-3 mr-0.5" />
							{t("models.status.licensed")}
						</Badge>
					)}
					{selectedState?.hasError && (
						<Badge variant="destructive" className="text-xs h-4">
							<CircleX className="size-3 mr-0.5" />
							{t("common.error")}
						</Badge>
					)}
					{freshSelectedModel.engine && (
						<Badge variant="outline" className="text-xs h-4 px-1">
							{freshSelectedModel.engine}
						</Badge>
					)}
					{hasPresetVoices && (
						<Badge variant="outline" className="text-xs h-4 px-1">
							<Users className="size-3 mr-0.5" />
							{t("models.detail.voicesCount", { count: presetVoices.length })}
						</Badge>
					)}{" "}
					{supportsMixing && (
						<Badge
							variant="outline"
							className="text-xs h-4 px-1 border-amber-500/30 text-amber-500"
						>
							<Sparkles className="size-3 mr-0.5" />
							{t("models.detail.mixing")}
						</Badge>
					)}
				</div>

				{freshSelectedModel.quality_score != null &&
					freshSelectedModel.quality_score > 0 && (
						<div className="pt-1">
							<StarRating
								score={freshSelectedModel.quality_score}
								category={freshSelectedModel.category}
								size="md"
							/>
						</div>
					)}

				{hfLoading && freshSelectedModel.hf_repo_id && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
						<Spinner size="xs" />
						{t("models.detail.loadingInfo")}
					</div>
				)}

				{MODEL_DESCRIPTIONS[freshSelectedModel.model_name] && (
					<p className="text-xs text-muted-foreground leading-relaxed">
						{MODEL_DESCRIPTIONS[freshSelectedModel.model_name]}
					</p>
				)}

				<DetailCardInfo hfModelInfo={hfModelInfo} license={license} />

				<SampleAudioPreview
					repoId={freshSelectedModel.hf_repo_id}
					hfModelInfo={hfModelInfo}
				/>

				{freshSelectedModel.downloaded && freshSelectedModel.size_mb && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<HardDrive className="size-3" />
						<span>
							{t("models.detail.onDisk", {
								size: formatSize(freshSelectedModel.size_mb),
							})}
						</span>
					</div>
				)}

				{selectedError?.error && (
					<div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
						{selectedError.error}
					</div>
				)}

				{hasPresetVoices && (
					<div className="border-t pt-3">
						<VoiceSelector
							voices={presetVoices}
							selectedVoice={selectedVoice}
							onSelectVoice={setSelectedVoice}
						/>
					</div>
				)}

				{supportsMixing && hasPresetVoices && (
					<div className="border-t pt-3">
						<VoiceMixer
							voices={presetVoices}
							selectedVoices={mixedVoices}
							onToggleVoice={toggleMixedVoice}
						/>
					</div>
				)}

				{hasEmotionControl && (
					<div className="border-t pt-3">
						<EmotionSelector
							selectedEmotion={selectedEmotion}
							onSelectEmotion={setSelectedEmotion}
						/>
					</div>
				)}

				{hasParalinguisticTags && supportedTags.length > 0 && (
					<div className="border-t pt-3">
						<TagPreview tags={supportedTags} />
					</div>
				)}

				<DetailActions
					freshSelectedModel={freshSelectedModel}
					selectedState={selectedState}
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
			</div>
		</>
	);
}
