import type { UseFormReturn } from "react-hook-form";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { useEngineCapabilities } from "./EngineModelSelector";

const FALLBACK_S2_TAGS = [
	"[angry]",
	"[sad]",
	"[whisper]",
	"[shout]",
	"[laugh]",
	"[sigh]",
	"[excited]",
	"[surprised]",
] as const;

interface S2EmotionChipsProps {
	form: UseFormReturn<GenerationFormValues>;
	engine?: string;
	textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}

export function S2EmotionChips({
	form,
	engine,
	textareaRef,
}: S2EmotionChipsProps) {
	const caps = useEngineCapabilities()[engine ?? ""];
	const tags =
		caps?.supported_tags?.length && caps.supported_tags.length > 0
			? caps.supported_tags
			: engine === "fish_speech_s2"
				? [...FALLBACK_S2_TAGS]
				: [];

	if (engine !== "fish_speech_s2" || tags.length === 0) {
		return null;
	}

	const insert = (tag: string) => {
		const cur = form.getValues("text") ?? "";
		const el = textareaRef?.current;
		const start = el?.selectionStart ?? cur.length;
		const end = el?.selectionEnd ?? cur.length;
		const next = `${cur.slice(0, start)}${tag} ${cur.slice(end)}`;
		form.setValue("text", next, { shouldDirty: true, shouldValidate: true });
		requestAnimationFrame(() => {
			if (el) {
				const pos = start + tag.length + 1;
				el.focus();
				el.setSelectionRange(pos, pos);
			}
		});
	};

	return (
		<div className="flex flex-wrap gap-2 pb-2">
			{tags.map((t) => (
				<button
					key={t}
					type="button"
					onClick={() => insert(t)}
					className="rounded-full border border-accent/30 bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent-foreground/80 hover:bg-accent/20 transition-colors"
					title={`Insert ${t}`}
				>
					{t}
				</button>
			))}
		</div>
	);
}
