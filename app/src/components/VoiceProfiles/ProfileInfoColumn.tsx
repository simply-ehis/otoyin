import {
	PencilSquareIcon as Edit2,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { EffectsChainEditor } from "@/components/Effects/EffectsChainEditor";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EffectConfig, VoiceProfileResponse } from "@/lib/api/types";
import { LANGUAGE_OPTIONS } from "@/lib/constants/languages";
import type { ProfileFormValues } from "./profileFormHelpers";

interface ProfileInfoColumnProps {
	form: UseFormReturn<ProfileFormValues>;
	avatarPreview: string | null;
	editingProfile: VoiceProfileResponse | null;
	avatarInputRef: React.RefObject<HTMLInputElement | null>;
	onAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onRemoveAvatar: () => void;
	deleteAvatarPending: boolean;
	voiceSource: "clone" | "builtin" | "design";
	defaultEngine: string;
	onSetDefaultEngine: (v: string) => void;
	availableDefaultEngines: ReadonlyArray<{ value: string; label: string }>;
	editingVoiceType?: string;
	showEffects: boolean;
	profileEffectsChain: EffectConfig[];
	onEffectsChange: (chain: EffectConfig[]) => void;
}

export function ProfileInfoColumn(props: ProfileInfoColumnProps) {
	const { t } = useTranslation();
	const {
		form,
		avatarPreview,
		editingProfile,
		avatarInputRef,
		onAvatarFileChange,
		onRemoveAvatar,
		deleteAvatarPending,
		voiceSource,
		defaultEngine,
		onSetDefaultEngine,
		availableDefaultEngines,
		editingVoiceType,
		showEffects,
		profileEffectsChain,
		onEffectsChange,
	} = props;

	return (
		<div className="space-y-4 overflow-y-auto min-h-0">
			{/* Avatar Upload */}
			<FormField
				control={form.control}
				name="avatarFile"
				render={() => (
					<FormItem>
						<FormControl>
							<div className="flex justify-center pt-4 pb-2">
								<div className="relative group">
									<div className="size-24 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border-2 border-border">
										{avatarPreview ? (
											<img
												src={avatarPreview}
												alt={t("profileForm.avatar.alt")}
												className="h-full w-full object-cover"
											/>
										) : (
											<X className="size-10 text-muted-foreground" />
										)}
									</div>
									<button
										type="button"
										aria-label="Change avatar"
										title="Change avatar"
										onClick={() => avatarInputRef.current?.click()}
										className="absolute inset-0 rounded-full bg-accent/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
									>
										<Edit2 className="size-6 text-accent-foreground" />
									</button>
									{(avatarPreview || editingProfile?.avatar_path) && (
										<button
											type="button"
											onClick={onRemoveAvatar}
											disabled={deleteAvatarPending}
											className="absolute bottom-0 right-0 size-6 rounded-full bg-background text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground transition-colors shadow-sm border border-border"
										>
											<X className="h-3.5 w-3.5" />
										</button>
									)}
								</div>
								<input
									ref={avatarInputRef}
									type="file"
									accept="image/png,image/jpeg,image/webp"
									onChange={onAvatarFileChange}
									className="hidden"
								/>
							</div>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

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
						<FormLabel>{t("profileForm.fields.descriptionLabel")}</FormLabel>
						<FormControl>
							<Textarea
								placeholder={t("profileForm.fields.descriptionPlaceholder")}
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name="personality"
				render={({ field }) => (
					<FormItem>
						<FormLabel>{t("profileForm.fields.personalityLabel")}</FormLabel>
						<FormControl>
							<Textarea
								placeholder={t("profileForm.fields.personalityPlaceholder")}
								className="min-h-[96px]"
								{...field}
							/>
						</FormControl>
						<FormDescription>
							{t("profileForm.fields.personalityHint")}
						</FormDescription>
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
						<Select onValueChange={field.onChange} defaultValue={field.value}>
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

			<FormItem>
				<FormLabel>{t("profileForm.fields.defaultEngine")}</FormLabel>
				<Select
					value={defaultEngine || "_none"}
					onValueChange={(v) => {
						onSetDefaultEngine(v === "_none" ? "" : v);
					}}
					disabled={voiceSource === "builtin" || editingVoiceType === "preset"}
				>
					<FormControl>
						<SelectTrigger>
							<SelectValue placeholder={t("profileForm.fields.noPreference")} />
						</SelectTrigger>
					</FormControl>
					<SelectContent>
						<SelectItem value="_none">
							{t("profileForm.fields.noPreference")}
						</SelectItem>
						{availableDefaultEngines.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					{t("profileForm.fields.defaultEngineHint")}
				</p>
			</FormItem>

			{showEffects && (
				<div className="space-y-2">
					<FormLabel>{t("profileForm.fields.defaultEffects")}</FormLabel>
					<p className="text-xs text-muted-foreground">
						{t("profileForm.fields.defaultEffectsHint")}
					</p>
					<EffectsChainEditor
						value={profileEffectsChain}
						onChange={onEffectsChange}
						compact
					/>
				</div>
			)}
		</div>
	);
}
