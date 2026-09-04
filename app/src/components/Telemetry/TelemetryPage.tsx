import {
	ArrowPathIcon,
	BoltIcon,
	ClockIcon,
	CpuChipIcon,
	FunnelIcon,
	SignalIcon,
	SignalSlashIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { EventLog } from "@/components/Telemetry/EventLog";
import { EventTimeline } from "@/components/Telemetry/EventTimeline";
import { StatCard } from "@/components/Telemetry/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { apiClient } from "@/lib/api/client";

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

const TIME_RANGES: { label: string; value: string }[] = [
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

function bucketForRange(range: string): string {
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

export function TelemetryPage() {
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(false);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
	const [events, setEvents] = useState<TelemetryEvent[]>([]);
	const [timeRange, setTimeRange] = useState("7d");
	const [filterType, setFilterType] = useState("_all");
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
			const since = sinceDate(timeRange);
			const bucket = bucketForRange(timeRange);

			const [summaryRes, timelineRes, eventsRes] = await Promise.all([
				apiClient.getTelemetrySummary(),
				apiClient.getTelemetryTimeline({ since, bucket }),
				apiClient.getTelemetryEvents({
					since,
					limit: 100,
					...(filterType !== "_all" ? { event_type: filterType } : {}),
				}),
			]);

			setSummary(summaryRes);
			setTimeline(timelineRes.timeline ?? []);
			setEvents(eventsRes.events ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load telemetry");
		} finally {
			setLoading(false);
		}
	}, [timeRange, filterType]);

	useEffect(() => {
		if (enabled) {
			load();
		}
	}, [enabled, load]);

	const handleToggle = async (next: boolean) => {
		try {
			const res = await apiClient.toggleTelemetry(next);
			setEnabled(Boolean(res.enabled));
			if (res.enabled) {
				load();
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
			<div className="space-y-6">
				<div className="flex items-center gap-3">
					<div className="size-3 rounded-full bg-muted-foreground/20 animate-pulse" />
					<h1 className="text-xl font-semibold">Telemetry</h1>
					<Badge variant="secondary">Loading</Badge>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div
						className={`size-3 rounded-full ${enabled ? "bg-green-500" : "bg-muted-foreground/40"}`}
					/>
					<h1 className="text-xl font-semibold">Telemetry</h1>
					<Badge variant={enabled ? "default" : "secondary"}>
						{enabled ? "Active" : "Disabled"}
					</Badge>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={load}
						disabled={!enabled || loading}
					>
						<ArrowPathIcon
							className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
					<Button
						variant={enabled ? "destructive" : "default"}
						size="sm"
						onClick={() => handleToggle(!enabled)}
					>
						{enabled ? (
							<>
								<SignalSlashIcon className="size-4 mr-1" />
								Disable
							</>
						) : (
							<>
								<SignalIcon className="size-4 mr-1" />
								Enable
							</>
						)}
					</Button>
				</div>
			</div>

			{!enabled && (
				<Card className="border-dashed">
					<CardContent className="py-12 text-center space-y-3">
						<SignalSlashIcon className="size-10 mx-auto text-muted-foreground/40" />
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							Telemetry is disabled. Enable it in{" "}
							<Link
								to="/settings"
								className="underline hover:text-foreground transition-colors"
							>
								Privacy Settings
							</Link>{" "}
							to help improve AI Studio with anonymous usage data.
						</p>
					</CardContent>
				</Card>
			)}

			{error && (
				<Card className="border-destructive/50 bg-destructive/5">
					<CardContent className="py-3 text-sm text-destructive">
						{error}
					</CardContent>
				</Card>
			)}

			{enabled && (
				<>
					<div className="flex items-center gap-3">
						<FunnelIcon className="size-4 text-muted-foreground" />
						<Select value={timeRange} onValueChange={setTimeRange}>
							<SelectTrigger className="w-[180px]">
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
						<Select value={filterType} onValueChange={setFilterType}>
							<SelectTrigger className="w-[200px]">
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

					<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							title="Total Events"
							value={formatNumber(summary?.total_events ?? 0)}
							icon={<BoltIcon className="size-4" />}
						/>
						<StatCard
							title="Active Days"
							value={summary?.active_days ?? 0}
							icon={<ClockIcon className="size-4" />}
						/>
						<StatCard
							title="Event Types"
							value={Object.keys(summary?.event_counts ?? {}).length}
							icon={<CpuChipIcon className="size-4" />}
						/>
						<StatCard
							title="Most Frequent"
							value={topEvents[0]?.name ?? "\u2014"}
							icon={<BoltIcon className="size-4" />}
							description={
								topEvents[0]
									? `${formatNumber(topEvents[0].count)} events`
									: undefined
							}
						/>
					</div>

					{timeline.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium">
									Event Volume Over Time
								</CardTitle>
							</CardHeader>
							<CardContent>
								<EventTimeline data={timeline} />
							</CardContent>
						</Card>
					)}

					<div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium">
									Top Events
								</CardTitle>
							</CardHeader>
							<CardContent>
								{topEvents.length === 0 ? (
									<p className="text-sm text-muted-foreground text-center py-4">
										No data yet.
									</p>
								) : (
									<div className="space-y-3">
										{topEvents.map((ev) => {
											const maxCount = topEvents[0].count || 1;
											const pct = Math.round((ev.count / maxCount) * 100);
											return (
												<div key={ev.name} className="space-y-1">
													<div className="flex items-center justify-between text-sm">
														<span className="font-mono text-xs">{ev.name}</span>
														<span className="text-muted-foreground">
															{formatNumber(ev.count)}
														</span>
													</div>
													<div className="h-1.5 rounded-full bg-muted overflow-hidden">
														<div
															className="h-full rounded-full bg-primary transition-[width]"
															style={{ width: `${pct}%` }}
														/>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</CardContent>
						</Card>

						<div className="lg:col-span-2">
							<Card>
								<CardHeader>
									<CardTitle className="text-sm font-medium">
										Recent Events
									</CardTitle>
								</CardHeader>
								<CardContent>
									<EventLog events={events} />
								</CardContent>
							</Card>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
