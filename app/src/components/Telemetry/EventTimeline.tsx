interface TimelineBucket {
	bucket: string;
	count: number;
}

interface EventTimelineProps {
	data: TimelineBucket[];
}

function formatLabel(raw: string) {
	if (raw.includes(" ")) {
		const parts = raw.split(" ");
		return parts[1]?.replace(":00", "") ?? raw;
	}
	if (raw.includes("-W")) {
		return raw.split("-W")[1];
	}
	const d = new Date(`${raw}T00:00:00`);
	if (Number.isNaN(d.getTime())) {
		return raw;
	}
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EventTimeline({ data }: EventTimelineProps) {
	if (data.length === 0) {
		return (
			<p className="text-sm text-muted-foreground text-center py-8">
				No timeline data.
			</p>
		);
	}

	const max = Math.max(...data.map((d) => d.count), 1);

	return (
		<div className="h-64 w-full flex items-end gap-1">
			{data.map((d) => {
				const pct = (d.count / max) * 100;
				return (
					<div
						key={d.bucket}
						className="group relative flex-1 flex flex-col items-center justify-end h-full"
					>
						<div className="absolute -top-6 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow-md whitespace-nowrap z-10">
							{d.count}
						</div>
						<div
							className="w-full bg-primary/80 rounded-t-sm transition-[height,background-color] hover:bg-primary"
							style={{ height: `${Math.max(pct, 1)}%` }}
						/>
						<span className="text-xs text-muted-foreground mt-1 truncate max-w-full">
							{formatLabel(d.bucket)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
