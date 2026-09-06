import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";
import { type LogEntry, useLogStore } from "@/stores/logStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, "g");

function timestamp(ts: number): string {
	return new Date(ts).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

function exportName(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `otoyin-logs-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.log`;
}

type StreamFilter = "all" | "stdout" | "stderr";

function LogLine({ entry }: { entry: LogEntry }) {
	return (
		<div className="flex gap-3 font-mono text-xs leading-5 hover:bg-secondary">
			<span className="shrink-0 select-none text-muted-foreground/60">
				{timestamp(entry.timestamp)}
			</span>
			<span
				className={cn(
					"whitespace-pre-wrap break-all",
					entry.stream === "stderr"
						? "text-warning-text"
						: "text-muted-foreground",
				)}
			>
				{entry.line}
			</span>
		</div>
	);
}

/**
 * Server log viewer: stream filter, text search, auto-scroll with
 * manual override, copy/export/clear. Terminal surface, solid.
 */
export function LogsPage() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const platform = usePlatform();
	const entries = useLogStore((s) => s.entries);
	const clear = useLogStore((s) => s.clear);
	const containerRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const [query, setQuery] = useState("");
	const [stream, setStream] = useState<StreamFilter>("all");
	const [logsDir, setLogsDir] = useState("");

	useEffect(() => {
		platform.filesystem
			.getLogsDir()
			.then(setLogsDir)
			.catch((err: unknown) => {
				debug.warn("[server] get logs dir failed:", err);
			});
	}, [platform]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (stream !== "all" && entry.stream !== stream) {
				return false;
			}
			return !needle || entry.line.toLowerCase().includes(needle);
		});
	}, [entries, query, stream]);

	useEffect(() => {
		if (autoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [autoScroll]);

	const serialized = () =>
		filtered
			.map(
				(e) =>
					`${timestamp(e.timestamp)} ${e.stream === "stderr" ? "ERR" : "OUT"} ${e.line.replace(ANSI_RE, "")}`,
			)
			.join("\n");

	const copyFiltered = async () => {
		const text = serialized();
		if (!text) {
			toast({ title: t("settings.logs.exportEmpty"), variant: "destructive" });
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: t("settings.logs.copied") });
		} catch {
			toast({ title: t("settings.logs.copyFailed"), variant: "destructive" });
		}
	};

	const exportFiltered = async () => {
		const text = serialized();
		if (!text) {
			toast({ title: t("settings.logs.exportEmpty"), variant: "destructive" });
			return;
		}
		const filename = exportName(new Date());
		try {
			await platform.filesystem.saveFile(
				filename,
				new Blob([text], { type: "text/plain" }),
				[{ name: "Log", extensions: ["log", "txt"] }],
			);
			toast({ title: t("settings.logs.exportSuccess", { path: filename }) });
		} catch {
			toast({ title: t("settings.logs.exportFailed"), variant: "destructive" });
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ScreenHeader
				title={t("settings.logs.title")}
				description={t("settings.logs.lineCount", { count: entries.length })}
				actions={
					<>
						{!autoScroll ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setAutoScroll(true);
									containerRef.current?.scrollTo({
										top: containerRef.current.scrollHeight,
									});
								}}
							>
								{t("settings.logs.scrollToBottom")}
							</Button>
						) : null}
						{logsDir ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									platform.filesystem.openPath(logsDir).catch(() => {
										toast({
											title: t("settings.logs.openFolderFailed"),
											variant: "destructive",
										});
									});
								}}
							>
								{t("settings.logs.openFolder")}
							</Button>
						) : null}
						<Button variant="outline" size="sm" onClick={copyFiltered}>
							{t("settings.logs.copy")}
						</Button>
						<Button variant="outline" size="sm" onClick={exportFiltered}>
							{t("settings.logs.export")}
						</Button>
						<Button variant="outline" size="sm" onClick={clear}>
							{t("settings.logs.clear")}
						</Button>
					</>
				}
			/>
			<div className="mb-2 mt-4 flex items-center gap-2">
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t("settings.logs.searchPlaceholder")}
					aria-label={t("settings.logs.searchPlaceholder")}
					className="h-8 max-w-xs"
				/>
				<Select
					value={stream}
					onValueChange={(v) => setStream(v as StreamFilter)}
				>
					<SelectTrigger
						className="h-8 w-28"
						aria-label={t("settings.logs.streamFilter")}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t("settings.logs.filterAll")}</SelectItem>
						<SelectItem value="stdout">
							{t("settings.logs.filterStdout")}
						</SelectItem>
						<SelectItem value="stderr">
							{t("settings.logs.filterStderr")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div
				ref={containerRef}
				onScroll={() => {
					const el = containerRef.current;
					if (!el) {
						return;
					}
					setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
				}}
				className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-terminal-bg p-3"
				role="log"
				aria-label={t("settings.logs.title")}
			>
				{filtered.length === 0 ? (
					<div className="flex flex-col gap-1 font-mono text-sm text-muted-foreground/60">
						<p>
							{entries.length === 0
								? t("settings.logs.empty")
								: t("settings.logs.noMatch")}
						</p>
						{!import.meta.env?.PROD ? (
							<p>{t("settings.logs.devHint")}</p>
						) : null}
					</div>
				) : (
					filtered.map((entry) => <LogLine key={entry.id} entry={entry} />)
				)}
			</div>
		</div>
	);
}
