import {
	ArrowsRightLeftIcon,
	ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/states";

/**
 * Dedicated translation interface (text → text across 50+ languages).
 * Uses the existing /translate API; offline Argos packs are installed
 * from the Store (see the pack hint when the backend reports none).
 */
export function TranslateView() {
	const { t } = useTranslation();
	const [source, setSource] = useState("auto");
	const [target, setTarget] = useState("en");
	const [input, setInput] = useState("");
	const [output, setOutput] = useState<string | null>(null);
	const [detected, setDetected] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: languages } = useQuery({
		queryKey: ["translate-languages"],
		queryFn: () => apiClient.getTranslateLanguages(),
		staleTime: 1000 * 60 * 60,
		retry: 1,
	});
	const langEntries = Object.entries(languages?.languages ?? {}).sort(
		([, a], [, b]) => a.localeCompare(b),
	);

	const doTranslate = async () => {
		const text = input.trim();
		if (!text || busy) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const res = await apiClient.translateText(text, source, target);
			setOutput(res.translated_text);
			setDetected(res.detected_lang || null);
		} catch (e: unknown) {
			setOutput(null);
			setDetected(null);
			const msg = e instanceof Error ? e.message : String(e);
			setError(msg);
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	};

	const swap = () => {
		if (source === "auto") {
			return;
		}
		setSource(target);
		setTarget(source);
		setOutput(null);
		setDetected(null);
	};

	const copyOutput = async () => {
		if (!output) {
			return;
		}
		try {
			await navigator.clipboard.writeText(output);
		} catch (e: unknown) {
			showStudioErrorToast(e);
		}
	};

	const selectClass =
		"h-8 rounded-md border border-input bg-background px-2 text-xs";

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title={t("translate.title")}
				description={t("translate.description")}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					{t("translate.sourceLanguage")}
					<select
						value={source}
						onChange={(e) => setSource(e.target.value)}
						className={selectClass}
						aria-label={t("translate.sourceLanguage")}
					>
						<option value="auto">{t("translate.autoDetect")}</option>
						{langEntries.map(([code, name]) => (
							<option key={code} value={code}>
								{name}
							</option>
						))}
					</select>
				</label>
				<Button
					variant="ghost"
					size="sm"
					onClick={swap}
					disabled={source === "auto"}
					title={t("translate.swap")}
					aria-label={t("translate.swap")}
				>
					<ArrowsRightLeftIcon className="size-4" />
				</Button>
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					{t("translate.targetLanguage")}
					<select
						value={target}
						onChange={(e) => setTarget(e.target.value)}
						className={selectClass}
						aria-label={t("translate.targetLanguage")}
					>
						{langEntries.map(([code, name]) => (
							<option key={code} value={code}>
								{name}
							</option>
						))}
					</select>
				</label>
			</div>
			<textarea
				value={input}
				onChange={(e) => setInput(e.target.value)}
				rows={6}
				maxLength={20000}
				placeholder={t("translate.inputPlaceholder")}
				aria-label={t("translate.inputPlaceholder")}
				className="w-full resize-none max-h-[400px] overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
			/>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					onClick={doTranslate}
					disabled={busy || !input.trim()}
				>
					{busy ? t("translate.translating") : t("translate.translate")}
				</Button>
				<span className="text-xs tabular-nums text-muted-foreground">
					{input.length.toLocaleString()} / 20,000
				</span>
			</div>
			{error ? (
				<div className="rounded-md border border-destructive/40 bg-danger-soft px-3 py-2 text-xs text-danger-text">
					<p>{error}</p>
					<p className="mt-1">
						{t("translate.offlineHint")}{" "}
						<Link to="/store" className="underline hover:no-underline">
							{t("translate.openStore")}
						</Link>
					</p>
				</div>
			) : null}
			{output !== null && !error ? (
				<div className="rounded-md border border-border bg-card p-3">
					<div className="mb-1 flex items-center justify-between gap-2">
						<p className="text-xs font-medium text-muted-foreground">
							{t("translate.translated")}
							{detected && source === "auto" ? ` · ${detected}` : null}
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={copyOutput}
							title={t("translate.copy")}
							aria-label={t("translate.copy")}
						>
							<ClipboardDocumentIcon className="size-4" />
						</Button>
					</div>
					<p className="whitespace-pre-wrap text-sm leading-relaxed">
						{output}
					</p>
				</div>
			) : null}
		</div>
	);
}
