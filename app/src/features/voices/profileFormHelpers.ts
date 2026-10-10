import { z } from "zod";
import type { VoiceAttributes } from "@/lib/api/types";
import {
	DEFAULT_ENGINE_OPTIONS,
	PRESET_ONLY_ENGINES,
} from "@/lib/constants/engines";
import { LANGUAGE_CODES, type LanguageCode } from "@/lib/constants/languages";

export const MAX_AUDIO_DURATION_SECONDS = 30;

// Re-export for backward compatibility
export { PRESET_ONLY_ENGINES, DEFAULT_ENGINE_OPTIONS };

export function makeProfileSchema(t: (key: string) => string) {
	const baseProfileSchema = z.object({
		name: z.string().min(1, t("profileForm.validation.nameRequired")).max(100),
		description: z.string().max(500).optional(),
		language: z.enum(LANGUAGE_CODES as [LanguageCode, ...LanguageCode[]]),
		personality: z.string().max(2000).optional(),
		sampleFile: z.instanceof(File).optional(),
		referenceText: z.string().max(1000).optional(),
		avatarFile: z.instanceof(File).optional(),
		voiceDescription: z.string().max(1000).optional(),
		voiceAttributes: z.custom<VoiceAttributes>().optional(),
	});

	return baseProfileSchema.refine(
		(data) => {
			if (
				data.sampleFile &&
				(!data.referenceText || data.referenceText.trim().length === 0)
			) {
				return false;
			}
			return true;
		},
		{
			message: t("profileForm.validation.referenceRequired"),
			path: ["referenceText"],
		},
	);
}

export type ProfileFormValues = {
	name: string;
	description?: string;
	language: LanguageCode;
	personality?: string;
	sampleFile?: File;
	referenceText?: string;
	avatarFile?: File;
	voiceDescription?: string;
	voiceAttributes?: VoiceAttributes;
};

// Helper to convert File to base64
export async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// Helper to convert base64 to File
export function base64ToFile(
	base64: string,
	fileName: string,
	fileType: string,
): File {
	const arr = base64.split(",");
	const bstr = atob(arr[1]);
	let n = bstr.length;
	const u8arr = new Uint8Array(n);
	while (n--) {
		u8arr[n] = bstr.charCodeAt(n);
	}
	return new File([u8arr], fileName, { type: fileType });
}
