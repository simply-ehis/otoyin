import {
	MicrophoneIcon,
	PencilIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { ChainEditor } from "@/features/effects/ChainEditor";
import { apiClient } from "@/lib/api/client";
import type { EffectConfig } from "@/lib/api/types";
import {
	LANGUAGE_CODES,
	LANGUAGE_OPTIONS,
	type LanguageCode,
} from "@/lib/constants/languages";
import {
	useDeleteAvatar,
	useProfile,
	useUpdateProfile,
	useUploadAvatar,
} from "@/lib/hooks/useProfiles";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormProvider,
} from "@/ui/form";
import { Input, Textarea } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { useToast } from "@/ui/use-toast";
import { SampleList } from "./SampleList";

function profileSchema(invalidName: string) {
	return z.object({
		name: z.string().min(1, invalidName).max(100),
		description: z.string().max(500).optional(),
		language: z.enum(LANGUAGE_CODES as [LanguageCode, ...LanguageCode[]]),
	});
}

type InspectorValues = {
	name: string;
	description?: string;
	language: LanguageCode;
};

/**
 * Voice inspector (right rail): avatar, rename, language, default
 * effects chain, samples. Saves explicitly when dirty.
 */
export function VoiceInspector({ profileId }: { profileId: string }) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { data: profile } = useProfile(profileId);
	const updateProfile = useUpdateProfile();
	const uploadAvatar = useUploadAvatar();
	const deleteAvatar = useDeleteAvatar();
	const avatarRef = useRef<HTMLInputElement>(null);

	const [preview, setPreview] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState(false);
	const [chain, setChain] = useState<EffectConfig[]>([]);
	const [chainDirty, setChainDirty] = useState(false);

	const form = useForm<InspectorValues>({
		resolver: zodResolver(
			profileSchema(t("profileForm.validation.nameRequired")),
		),
		defaultValues: { name: "", description: "", language: "en" },
	});

	useEffect(() => {
		if (profile) {
			form.reset({
				name: profile.name,
				description: profile.description || "",
				language: profile.language as LanguageCode,
			});
			setChain(profile.effects_chain ?? []);
			setChainDirty(false);
		}
	}, [profile, form]);

	useEffect(() => {
		if (profile?.avatar_path) {
			setPreview(`${serverUrl}/profiles/${profile.id}/avatar`);
		} else {
			setPreview(null);
		}
		setPreviewError(false);
	}, [profile, serverUrl]);

	if (!profile) {
		return (
			<p className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
				{t("voiceInspector.loading")}
			</p>
		);
	}

	const dirty = form.formState.isDirty || chainDirty;

	const save = async (data: InspectorValues) => {
		try {
			await updateProfile.mutateAsync({
				profileId,
				data: {
					name: data.name,
					description: data.description,
					language: data.language,
				},
			});
			if (chainDirty) {
				try {
					await apiClient.updateProfileEffects(
						profileId,
						chain.length > 0 ? chain : null,
					);
					setChainDirty(false);
				} catch (fxError: unknown) {
					toast({
						title: t("profileForm.toast.effectsUpdateFailed"),
						description:
							fxError instanceof Error
								? fxError.message
								: t("profileForm.toast.effectsUpdateFailedFallback"),
						variant: "destructive",
					});
					return;
				}
			}
			toast({
				title: t("profileForm.toast.voiceUpdated"),
				description: t("voiceInspector.toast.savedDescription", {
					name: data.name,
				}),
			});
		} catch (error: unknown) {
			toast({
				title: t("common.error"),
				description:
					error instanceof Error
						? error.message
						: t("profileForm.toast.saveFailed"),
				variant: "destructive",
			});
		}
	};

	const onAvatarFile = (file: File | undefined) => {
		if (!file) {
			return;
		}
		if (!file.type.startsWith("image/")) {
			toast({
				title: t("profileForm.toast.invalidFile"),
				description: t("voiceInspector.toast.invalidImageFormat"),
				variant: "destructive",
			});
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast({
				title: t("profileForm.toast.fileTooLarge"),
				description: t("profileForm.toast.imageTooLargeDescription"),
				variant: "destructive",
			});
			return;
		}
		uploadAvatar.mutate(
			{ profileId, file },
			{
				onSuccess: () => {
					setPreview(URL.createObjectURL(file));
					toast({ title: t("voiceInspector.toast.avatarUpdated") });
				},
				onError: (err: unknown) =>
					toast({
						title: t("profileForm.toast.avatarUploadFailed"),
						description:
							err instanceof Error ? err.message : t("common.unknownError"),
						variant: "destructive",
					}),
			},
		);
	};

	return (
		<FormProvider {...form}>
			<form
				onSubmit={form.handleSubmit(save)}
				className="flex h-full flex-col overflow-hidden"
			>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<div className="flex justify-center pb-3 pt-5">
						<div className="group relative">
							<span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-border bg-secondary">
								{preview && !previewError ? (
									<img
										src={preview}
										alt={profile.name}
										className="h-full w-full object-cover"
										onError={() => setPreviewError(true)}
									/>
								) : (
									<MicrophoneIcon
										className="size-8 text-muted-foreground"
										aria-hidden="true"
									/>
								)}
							</span>
							<button
								type="button"
								aria-label="Change avatar"
								title="Change avatar"
								onClick={() => avatarRef.current?.click()}
								className="absolute inset-0 grid place-items-center rounded-full bg-secondary opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
							>
								<PencilIcon
									className="size-5 text-foreground"
									aria-hidden="true"
								/>
							</button>
							{preview ? (
								<button
									type="button"
									aria-label="Remove avatar"
									disabled={deleteAvatar.isPending}
									onClick={() => {
										if (profile.avatar_path) {
											deleteAvatar.mutate(profileId, {
												onSuccess: () =>
													toast({
														title: t("profileForm.toast.avatarRemoved"),
													}),
												onError: (err: unknown) =>
													toast({
														title: t("profileForm.toast.avatarRemoveFailed"),
														description:
															err instanceof Error
																? err.message
																: t("common.unknownError"),
														variant: "destructive",
													}),
											});
										}
										setPreview(null);
										if (avatarRef.current) {
											avatarRef.current.value = "";
										}
									}}
									className="absolute bottom-0 right-0 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
								>
									<XMarkIcon className="size-3" aria-hidden="true" />
								</button>
							) : null}
						</div>
						<input
							ref={avatarRef}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							aria-label="Avatar image"
							onChange={(e) => onAvatarFile(e.target.files?.[0])}
						/>
					</div>

					<div className="flex flex-col gap-3 px-5">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("profileForm.fields.name")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("profileForm.fields.namePlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("voiceInspector.fields.description")}
									</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t(
												"profileForm.fields.descriptionPlaceholder",
											)}
											rows={2}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="language"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("profileForm.fields.language")}</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{LANGUAGE_OPTIONS.map((lang) => (
												<SelectItem key={lang.value} value={lang.value}>
													{lang.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div>
							<FormLabel>{t("profileForm.fields.defaultEffects")}</FormLabel>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{t("voiceInspector.defaultEffectsHint")}
							</p>
							<div className="mt-2">
								<ChainEditor
									value={chain}
									compact
									onChange={(next) => {
										setChain(next);
										setChainDirty(true);
									}}
								/>
							</div>
						</div>

						{dirty ? (
							<Button
								type="submit"
								className="w-full"
								disabled={updateProfile.isPending}
								loading={updateProfile.isPending}
							>
								{updateProfile.isPending
									? t("profileForm.actions.saving")
									: t("profileForm.actions.saveChanges")}
							</Button>
						) : null}
					</div>

					<div className="px-5 pb-5">
						<SampleList profileId={profileId} />
					</div>
				</div>
			</form>
		</FormProvider>
	);
}
