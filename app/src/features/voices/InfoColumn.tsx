import { PencilIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ChainEditor } from "@/features/effects/ChainEditor";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/ui/form";
import { Field, Input, Textarea } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { useToast } from "@/ui/use-toast";
import type { EffectConfig } from "@/lib/api/types";
import { DEFAULT_ENGINE_OPTIONS } from "@/lib/constants/engines";
import { LANGUAGE_OPTIONS } from "@/lib/constants/languages";
import {
	useDeleteAvatar,
	useUploadAvatar,
} from "@/lib/hooks/useProfiles";
import { useServerStore } from "@/stores/serverStore";

export interface InfoFormValues {
	name: string;
	description?: string;
	language: string;
	personality?: string;
	avatarFile?: File;
}

/**
 * Right column: avatar, name, description, personality, language,
 * default engine, default effects (edit mode).
 */
export function InfoColumn({
	form,
	avatarPreview,
	setAvatarPreview,
	editingId,
	editingAvatarPath,
	source,
	creating,
	defaultEngine,
	onDefaultEngine,
	showEffects,
	chain,
	onChain,
}: {
	form: UseFormReturn<InfoFormValues & Record<string, unknown>>;
	avatarPreview: string | null;
	setAvatarPreview: (v: string | null) => void;
	editingId: string | null;
	editingAvatarPath?: string;
	source: "clone" | "builtin" | "design";
	creating: boolean;
	defaultEngine: string;
	onDefaultEngine: (v: string) => void;
	showEffects: boolean;
	chain: EffectConfig[];
	onChain: (chain: EffectConfig[]) => void;
}) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const uploadAvatar = useUploadAvatar();
	const deleteAvatar = useDeleteAvatar();
	const avatarRef = useRef<HTMLInputElement>(null);
	const shownAvatar =
		avatarPreview ?? (editingAvatarPath ? `${serverUrl}/profiles/${editingId}/avatar` : null);

	const pickAvatar = (file: File | undefined) => {
		if (!file) {
			return;
		}
		if (!file.type.startsWith("image/")) {
			toast({
				title: t("profileForm.toast.invalidFile"),
				description: t("profileForm.toast.invalidImageFormat"),
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
		form.setValue("avatarFile" as never, file as never);
		setAvatarPreview(URL.createObjectURL(file));
	};

	return (
		<div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
			<div className="flex justify-center pb-2 pt-4">
				<div className="group relative">
					<span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-border bg-secondary">
						{shownAvatar ? (
							<img
								src={shownAvatar}
								alt={t("profileForm.avatar.alt")}
								className="h-full w-full object-cover"
								onError={() => setAvatarPreview(null)}
							/>
						) : (
							<span className="text-2xl font-semibold text-muted-foreground" aria-hidden="true">
								{(form.watch("name") || "?").charAt(0).toUpperCase()}
							</span>
						)}
					</span>
					<button
						type="button"
						aria-label="Change avatar"
						title="Change avatar"
						onClick={() => avatarRef.current?.click()}
						className="absolute inset-0 grid place-items-center rounded-full bg-secondary opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
					>
						<PencilIcon className="size-6 text-foreground" aria-hidden="true" />
					</button>
					{shownAvatar ? (
						<button
							type="button"
							aria-label="Remove avatar"
							disabled={deleteAvatar.isPending}
							onClick={() => {
								if (editingId && editingAvatarPath) {
									deleteAvatar.mutate(editingId, {
										onSuccess: () =>
											toast({ title: t("profileForm.toast.avatarRemoved") }),
										onError: (err: unknown) =>
											toast({
												title: t("profileForm.toast.avatarRemoveFailed"),
												description:
													err instanceof Error ? err.message : t("common.unknownError"),
												variant: "destructive",
											}),
									});
								}
								form.setValue("avatarFile" as never, undefined as never);
								setAvatarPreview(null);
								if (avatarRef.current) {
									avatarRef.current.value = "";
								}
							}}
							className="absolute bottom-0 right-0 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
						>
							<XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
						</button>
					) : null}
				</div>
				<input
					ref={avatarRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="hidden"
					aria-label="Avatar image"
					onChange={(e) => pickAvatar(e.target.files?.[0])}
				/>
			</div>

			<FormField
				control={form.control}
				name={"name" as never}
				render={({ field }) => (
					<FormItem>
						<FormLabel>{t("profileForm.fields.name")}</FormLabel>
						<FormControl>
							<Input placeholder={t("profileForm.fields.namePlaceholder")} {...field} value={(field.value as string) ?? ""} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name={"description" as never}
				render={({ field }) => (
					<FormItem>
						<FormLabel>{t("profileForm.fields.descriptionLabel")}</FormLabel>
						<FormControl>
							<Textarea placeholder={t("profileForm.fields.descriptionPlaceholder")} {...field} value={(field.value as string) ?? ""} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name={"personality" as never}
				render={({ field }) => (
					<FormItem>
						<FormLabel>{t("profileForm.fields.personalityLabel")}</FormLabel>
						<FormControl>
							<Textarea
								placeholder={t("profileForm.fields.personalityPlaceholder")}
								className="min-h-[96px]"
								{...field}
								value={(field.value as string) ?? ""}
							/>
						</FormControl>
						<p className="text-xs text-muted-foreground">{t("profileForm.fields.personalityHint")}</p>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name={"language" as never}
				render={({ field }) => (
					<FormItem>
						<FormLabel>{t("profileForm.fields.language")}</FormLabel>
						<Select onValueChange={field.onChange} value={(field.value as string) ?? "en"}>
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

			<Field label={t("profileForm.fields.defaultEngine")} htmlFor="profile-engine">
				<Select
					value={defaultEngine || "_none"}
					onValueChange={(v) => onDefaultEngine(v === "_none" ? "" : v)}
					disabled={source === "builtin"}
				>
					<SelectTrigger id="profile-engine">
						<SelectValue placeholder={t("profileForm.fields.noPreference")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="_none">{t("profileForm.fields.noPreference")}</SelectItem>
						{DEFAULT_ENGINE_OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="mt-1 text-xs text-muted-foreground">{t("profileForm.fields.defaultEngineHint")}</p>
			</Field>

			{showEffects ? (
				<div>
					<FormLabel>{t("profileForm.fields.defaultEffects")}</FormLabel>
					<p className="mb-2 mt-0.5 text-xs text-muted-foreground">
						{t("profileForm.fields.defaultEffectsHint")}
					</p>
					<ChainEditor value={chain} onChange={onChain} compact />
				</div>
			) : null}
		</div>
	);
}
