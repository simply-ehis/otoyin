import {
	ArrowPathIcon,
	BoltIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ClockIcon,
	CpuChipIcon,
	FunnelIcon,
	SignalIcon,
	SignalSlashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Card, CardBody, CardTitle } from "@/ui/card";
import { CodeConsole } from "@/ui/code-console";
import { Badge } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ErrorState, ScreenHeader } from "@/ui/states";

interface TelemetryEvent {
	name: string;
	properties: Record<string, unknown>;
	timestamp: string;
}

interface TimelineBucket {
	bucket: string;
	count: number;
}

interface Summary {
	total_events: number;
	active_days: number;
	event_counts: Record<string, number>;
}

const TIME_RANGES = [
	{ label: "Last 24 hours", value: "1d" },
	{ label: "Last 7 days", value: "7d" },
	{ label: "Last 30 days", value: "30d" },
	{ label: "All time", value: "" },
];

function sinceDate(range: string): string {
	if (!range) {
		return "";
	}
	const d = new Date();
	if (range === "1d") {
		d.setDate(d.getDate() - 1);
	} else if (range === "7d") {
		d.setDate(d.getDate() - 7);
	} else if (range === "30d") {
		d.setDate(d.getDate() - 30);
	}
	return d.toISOString();
}

function bucketFor(range: string): string {
	if (range === "1d") {
		return "hour";
	}
	if (range === "7d" || range === "30d") {
		return "day";
	}
	return "week";
}

function formatNumber(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}k`;
	}
	return String(n);
}

function formatBucket(raw: string): string {
	if (raw.includes(" ")) {
		return raw.split(" ")[1]?.replace(":00", "") ?? raw;
	}
	if (raw.includes("-W")) {
		return raw.split("-W")[1] ?? raw;
	}
	const d = new Date(`${raw}T00:00:00`);
	if (Number.isNaN(d.getTime())) {
		return raw;
	}
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Local telemetry dashboard: opt-in toggle, summary stats, volume
 * chart, top events, expandable event log. All data stays on-device.
 */
export function TelemetryPage() {
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(false);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
	const [events, setEvents] = useState<TelemetryEvent[]>([]);
	const [range, setRange] = useState("7d");
	const [filter, setFilter] = useState("_all");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.getTelemetryStatus()
			.then((res) => setEnabled(Boolean(res.enabled)))
			.catch(() => setEnabled(false));
	}, []);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const since = sinceDate(range);
			const [summaryRes, timelineRes, eventsRes] = await Promise.all([
				apiClient.getTelemetrySummary(),
				apiClient.getTelemetryTimeline({ since, bucket: bucketFor(range) }),
				apiClient.getTelemetryEvents({
					since,
					limit: 100,
					...(filter !== "_all" ? { event_type: filter } : {}),
				}),
			]);
			setSummary(summaryRes);
			setTimeline(timelineRes.timeline ?? []);
			setEvents(eventsRes.events ?? []);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to load telemetry");
		} finally {
			setLoading(false);
		}
	}, [range, filter]);

	useEffect(() => {
		if (enabled) {
			void load();
		}
	}, [enabled, load]);

	const toggle = async (next: boolean) => {
		try {
			const res = await apiClient.toggleTelemetry(next);
			setEnabled(Boolean(res.enabled));
			if (res.enabled) {
				void load();
			} else {
				setSummary(null);
				setTimeline([]);
				setEvents([]);
			}
		} catch {
			setError("Failed to update telemetry preference");
		}
	};

	const topEvents = summary
		? Object.entries(summary.event_counts)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5)
				.map(([name, count]) => ({ name, count }))
		: [];
	const eventTypes = summary
		? ["_all", ...Object.keys(summary.event_counts).sort()]
		: ["_all"];

	if (enabled === null) {
		return (
			<div className="flex max-w-3xl items-center gap-3">
				<span
					aria-hidden="true"
					className="size-3 animate-pulse rounded-full bg-strong"
				/>
				<h1 className="text-xl font-semibold text-foreground">Telemetry</h1>
				<Badge tone="neutral">Loading</Badge>
			</div>
		);
	}

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<ScreenHeader
				title="Telemetry"
				description="Anonymous on-device usage data. Nothing leaves your machine."
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void load()}
							disabled={!enabled || loading}
						>
							<ArrowPathIcon
								className={loading ? "mr-1 size-4 animate-spin" : "mr-1 size-4"}
								aria-hidden="true"
							/>
							Refresh
						</Button>
						<Button
							variant={enabled ? "destructive" : "default"}
							size="sm"
							onClick={() => void toggle(!enabled)}
						>
							{enabled ? (
								<>
									<SignalSlashIcon className="mr-1 size-4" aria-hidden="true" />
									Disable
								</>
							) : (
								<>
									<SignalIcon className="mr-1 size-4" aria-hidden="true" />
									Enable
								</>
							)}
						</Button>
					</>
				}
			/>

			<p className="flex items-center gap-2 text-sm text-muted-foreground">
				<span
					aria-hidden="true"
					className={
						enabled
							? "size-2.5 rounded-full bg-success"
							: "size-2.5 rounded-full bg-strong"
					}
				/>
				<Badge tone={enabled ? "success" : "neutral"}>
					{enabled ? "Active" : "Disabled"}
				</Badge>
			</p>

			{!enabled ? (
				<EmptyState
					icon={<SignalSlashIcon aria-hidden="true" />}
					title="Telemetry is disabled"
					body="Enable it to see anonymous usage data that helps improve the studio. Everything stays on this device."
				/>
			) : null}

			{error ? (
				<ErrorState
					title="Could not load telemetry"
					body={error}
					onRetry={() => void load()}
				/>
			) : null}

			{enabled ? (
				<>
					<div className="flex items-center gap-2">
						<FunnelIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<Select value={range} onValueChange={setRange}>
							<SelectTrigger className="w-[180px]" aria-label="Time range">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TIME_RANGES.map((r) => (
									<SelectItem key={r.value} value={r.value}>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={filter} onValueChange={setFilter}>
							<SelectTrigger className="w-[200px]" aria-label="Event type">
								<SelectValue placeholder="All events" />
							</SelectTrigger>
							<SelectContent>
								{eventTypes.map((t) => (
									<SelectItem key={t} value={t}>
										{t === "_all" ? "All events" : t}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							title="Total events"
							value={formatNumber(summary?.total_events ?? 0)}
							icon={<BoltIcon className="size-4" />}
						/>
						<StatCard
							title="Active days"
							value={summary?.active_days ?? 0}
							icon={<ClockIcon className="size-4" />}
						/>
						<StatCard
							title="Event types"
							value={Object.keys(summary?.event_counts ?? {}).length}
							icon={<CpuChipIcon className="size-4" />}
						/>
						<StatCard
							title="Most frequent"
							value={topEvents[0]?.name ?? "—"}
							icon={<BoltIcon className="size-4" />}
							description={
								topEvents[0]
									? `${formatNumber(topEvents[0].count)} events`
									: undefined
							}
						/>
					</div>

					{timeline.length > 0 ? (
						<Card>
							<CardTitle className="text-sm font-medium">
								Event volume
							</CardTitle>
							<CardBody className="mt-3">
								<TimelineChart data={timeline} />
							</CardBody>
						</Card>
					) : null}

					<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
						<Card>
							<CardTitle className="text-sm font-medium">Top events</CardTitle>
							<CardBody className="mt-3">
								{topEvents.length === 0 ? (
									<p className="py-4 text-center text-sm text-muted-foreground">
										No data yet.
									</p>
								) : (
									<ul className="flex flex-col gap-3">
										{topEvents.map((ev) => {
											const max = topEvents[0]?.count || 1;
											return (
												<li key={ev.name} className="flex flex-col gap-1">
													<p className="flex items-center justify-between text-sm">
														<span className="font-mono text-xs text-foreground">
															{ev.name}
														</span>
														<span className="tabular-nums text-muted-foreground">
															{formatNumber(ev.count)}
														</span>
													</p>
													<div
														className="h-1.5 overflow-hidden rounded-full bg-sunken"
														role="presentation"
													>
														<div
															className="h-full rounded-full bg-primary"
															style={{
																width: `${Math.round((ev.count / max) * 100)}%`,
															}}
														/>
													</div>
												</li>
											);
										})}
									</ul>
								)}
							</CardBody>
						</Card>
						<Card className="lg:col-span-2">
							<CardTitle className="text-sm font-medium">
								Recent events
							</CardTitle>
							<CardBody className="mt-3">
								<EventLog events={events} />
							</CardBody>
						</Card>
					</div>
				</>
			) : null}
		</div>
	);
}

function StatCard({
	title,
	value,
	icon,
	description,
}: {
	title: string;
	value: string | number;
	icon: React.ReactNode;
	description?: string;
}) {
	return (
		<Card>
			<p className="flex items-center justify-between text-sm font-medium text-muted-foreground">
				{title}
				<span aria-hidden="true">{icon}</span>
			</p>
			<p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">
				{value}
			</p>
			{description ? (
				<p className="mt-1 text-xs text-muted-foreground">{description}</p>
			) : null}
		</Card>
	);
}

function TimelineChart({ data }: { data: TimelineBucket[] }) {
	if (data.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				No timeline data.
			</p>
		);
	}
	const max = Math.max(...data.map((d) => d.count), 1);
	return (
		<div
			className="flex h-64 w-full items-end gap-1"
			role="img"
			aria-label={`Event volume, peak ${max} events`}
		>
			{data.map((d) => (
				<div
					key={d.bucket}
					title={`${d.bucket}: ${d.count}`}
					className="group relative flex h-full flex-1 flex-col items-center justify-end"
				>
					<span className="absolute -top-6 z-10 hidden whitespace-nowrap rounded-sm border border-border bg-popover px-2 py-1 text-xs text-foreground shadow-md group-hover:block">
						{d.count}
					</span>
					<div
						className="w-full rounded-t-sm bg-primary transition-colors hover:brightness-110"
						style={{ height: `${Math.max((d.count / max) * 100, 1)}%` }}
					/>
					<span className="mt-1 max-w-full truncate text-xs text-muted-foreground">
						{formatBucket(d.bucket)}
					</span>
				</div>
			))}
		</div>
	);
}

const EVENT_TONES: Record<string, "success" | "danger" | "neutral"> = {
	generation_completed: "success",
	generation_failed: "danger",
	model_downloaded: "success",
	profile_created: "neutral",
	profile_deleted: "danger",
	effects_applied: "neutral",
	app_started: "neutral",
	app_closed: "neutral",
	backend_started: "neutral",
};

function EventLog({ events }: { events: TelemetryEvent[] }) {
	const [expanded, setExpanded] = useState<number | null>(null);
	if (events.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				No events recorded yet.
			</p>
		);
	}
	return (
		<ul className="max-h-[500px] divide-y divide-border overflow-y-auto rounded-sm border border-border">
			{events.map((event, idx) => {
				const open = expanded === idx;
				const keys = Object.keys(event.properties ?? {});
				return (
					<li key={`${event.timestamp}-${idx}`} className="flex flex-col">
						<button
							type="button"
							aria-expanded={keys.length > 0 ? open : undefined}
							onClick={() => setExpanded(open ? null : idx)}
							className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
						>
							{keys.length > 0 ? (
								open ? (
									<ChevronDownIcon
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								) : (
									<ChevronRightIcon
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								)
							) : (
								<span className="w-4 shrink-0" aria-hidden="true" />
							)}
							<Badge tone={EVENT_TONES[event.name] ?? "neutral"}>
								{event.name}
							</Badge>
							<span className="flex-1 truncate text-xs text-muted-foreground">
								{new Date(event.timestamp).toLocaleString()}
							</span>
						</button>
						{open && keys.length > 0 ? (
							<div className="ml-7 px-4 pb-3">
								<CodeConsole maxHeight="15rem">
									{JSON.stringify(event.properties, null, 2)}
								</CodeConsole>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
