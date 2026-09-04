import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils/cn";
import { usePlatform } from "@/platform/PlatformContext";
import { type LogEntry, useLogStore } from "@/stores/logStore";
import { debug } from "../../lib/utils/debug";

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_RE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, "g");

function formatTime(timestamp: number): string {
	const d = new Date(timestamp);
	return d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

function formatFilenameDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return [
		d.getFullYear(),
		pad(d.getMonth() + 1),
		pad(d.getDate()),
		"-",
		pad(d.getHours()),
		pad(d.getMinutes()),
		pad(d.getSeconds()),
	].join("");
}

function stripAnsi(line: string): string {
	return line.replace(ANSI_ESCAPE_RE, "");
}

function formatLogEntries(entries: LogEntry[]): string {
	return entries
		.map(
			(e) =>
				`${formatTime(e.timestamp)} ${e.stream === "stderr" ? "ERR" : "OUT"} ${stripAnsi(e.line)}`,
		)
		.join("\n");
}

type StreamFilter = "all" | "stdout" | "stderr";

function LogLine({ entry }: { entry: LogEntry }) {
	return (
		<div className="flex gap-3 font-mono text-xs leading-5 hover:bg-muted/30">
			<span className="text-muted-foreground/50 select-none shrink-0">
				{formatTime(entry.timestamp)}
			</span>
			<span
				className={cn(
					"whitespace-pre-wrap break-all",
					entry.stream === "stderr"
						? "text-orange-400/80"
						: "text-muted-foreground",
				)}
			>
				{entry.line}
			</span>
		</div>
	);
}

export function LogsPage() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const platform = usePlatform();
	const entries = useLogStore((s) => s.entries);
	const clear = useLogStore((s) => s.clear);
	const containerRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const [query, setQuery] = useState("");
	const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
	const [logsDir, setLogsDir] = useState("");

	useEffect(() => {
		platform.filesystem
			.getLogsDir()
			.then(setLogsDir)
			.catch((err) => {
				debug.warn("[server] get logs dir failed:", err);
			});
	}, [platform]);

	const filteredEntries = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (streamFilter !== "all" && entry.stream !== streamFilter) {
				return false;
			}
			if (needle && !entry.line.toLowerCase().includes(needle)) {
				return false;
			}
			return true;
		});
	}, [entries, query, streamFilter]);

	// Auto-scroll to bottom when new entries arrive
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll when the visible log changes
	useEffect(() => {
		if (autoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [filteredEntries, autoScroll]);

	// Detect manual scroll to disable auto-scroll
	const handleScroll = () => {
		const el = containerRef.current;
		if (!el) {
			return;
		}
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		setAutoScroll(atBottom);
	};

	const copyFiltered = async () => {
		const text = formatLogEntries(filteredEntries);
		if (!text) {
			toast({
				title: t("settings.logs.exportEmpty"),
				variant: "destructive",
			});
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: t("settings.logs.copied") });
		} catch {
			toast({
				title: t("settings.logs.copyFailed"),
				variant: "destructive",
			});
		}
	};

	const exportFiltered = async () => {
		const text = formatLogEntries(filteredEntries);
		if (!text) {
			toast({
				title: t("settings.logs.exportEmpty"),
				variant: "destructive",
			});
			return;
		}
		const filename = `Otoyin-logs-${formatFilenameDate(new Date())}.log`;
		try {
			await platform.filesystem.saveFile(
				filename,
				new Blob([text], { type: "text/plain" }),
				[{ name: "Log", extensions: ["log", "txt"] }],
			);
			toast({ title: t("settings.logs.exportSuccess", { path: filename }) });
		} catch {
			toast({
				title: t("settings.logs.exportFailed"),
				variant: "destructive",
			});
		}
	};

	const openLogFolder = async () => {
		if (!logsDir) {
			return;
		}
		try {
			await platform.filesystem.openPath(logsDir);
		} catch {
			toast({
				title: t("settings.logs.openFolderFailed"),
				variant: "destructive",
			});
		}
	};

	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="flex items-center justify-between mb-3">
				<div>
					<h3 className="text-sm font-medium">{t("settings.logs.title")}</h3>
					<p className="text-sm text-muted-foreground">
						{t("settings.logs.lineCount", { count: entries.length })}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{!autoScroll && (
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
					)}
					{logsDir && (
						<Button variant="outline" size="sm" onClick={openLogFolder}>
							{t("settings.logs.openFolder")}
						</Button>
					)}
					<Button variant="outline" size="sm" onClick={copyFiltered}>
						{t("settings.logs.copy")}
					</Button>
					<Button variant="outline" size="sm" onClick={exportFiltered}>
						{t("settings.logs.export")}
					</Button>
					<Button variant="outline" size="sm" onClick={clear}>
						{t("settings.logs.clear")}
					</Button>
				</div>
			</div>

			<div className="flex items-center gap-2 mb-2">
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t("settings.logs.searchPlaceholder")}
					className="h-8 max-w-xs"
				/>
				<Select
					value={streamFilter}
					onValueChange={(v) => setStreamFilter(v as StreamFilter)}
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
				onScroll={handleScroll}
				className="flex-1 min-h-0 overflow-y-auto rounded-md border bg-terminal-bg p-3"
			>
				{filteredEntries.length === 0 ? (
					<div className="text-sm text-muted-foreground/50 font-mono space-y-1">
						<p>
							{entries.length === 0
								? t("settings.logs.empty")
								: t("settings.logs.noMatch")}
						</p>
						{!import.meta.env?.PROD && <p>{t("settings.logs.devHint")}</p>}
					</div>
				) : (
					filteredEntries.map((entry) => (
						<LogLine key={entry.id} entry={entry} />
					))
				)}
			</div>
		</div>
	);
}
