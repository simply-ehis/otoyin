import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { useEngineCapabilities } from "./EngineModelSelector";

interface UseEngineSyncArgs {
	form: UseFormReturn<GenerationFormValues>;
	setSelectedEngine: (engine: string) => void;
}

interface UseEngineSyncResult {
	watchedEngine: string | undefined;
	supportsInstruct: boolean;
	supportsParalinguistic: boolean;
}

export function useEngineSync({
	form,
	setSelectedEngine,
}: UseEngineSyncArgs): UseEngineSyncResult {
	// Sync engine selection to global store so ProfileList can filter
	const watchedEngine = form.watch("engine");
	useEffect(() => {
		if (watchedEngine) {
			setSelectedEngine(watchedEngine);
		}
	}, [watchedEngine, setSelectedEngine]);

	// Live capability flags for the selected engine (sourced from getModelStatus)
	const engineCapabilities = useEngineCapabilities();
	const engineCaps = watchedEngine
		? engineCapabilities[watchedEngine]
		: undefined;
	// instruct is usable by models that support delivery control
	// (supports_instruct) or instruct-as-emotion-tag (emotion_control).
	const supportsInstruct = !!(
		engineCaps?.emotion_control || engineCaps?.supports_instruct
	);
	const supportsParalinguistic = !!engineCaps?.paralinguistic_tags;

	// Carry the instruct capability into the submission payload.
	// Use a ref for form to avoid re-firing this effect on every render
	// (form object from useForm changes reference on every render).
	const formRef = useRef(form);
	formRef.current = form;

	useEffect(() => {
		formRef.current.setValue("supportsInstruct", supportsInstruct);
	}, [supportsInstruct]);

	return { watchedEngine, supportsInstruct, supportsParalinguistic };
}
