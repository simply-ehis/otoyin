/**
 * InstrumentBrowser — GM program browser inside the Instruments tab (in place;
 * no new route or tab).
 *
 * Family chips derived from `GET /instruments/gm-types` `programs` filter the
 * 128 General-MIDI programs; clicking one auditions it through the backend
 * (`POST /instruments/gm`) and plays the rendered WAV. With no SoundFont
 * installed the backend 501s — the error box shows the reason plus a Store
 * link, the same recovery pattern TranslateView uses for missing offline packs.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { playPreviewBlob } from "@/features/workspace/playBlob";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";

const ALL_FAMILIES = "All";

export function InstrumentBrowser() {
	const { data, isPending, isError, error } = useQuery({
		queryKey: ["gm-types"],
		queryFn: () => apiClient.listGMTypes(),
	});
	const [family, setFamily] = useState(ALL_FAMILIES);
	const [auditionError, setAuditionError] = useState<string | null>(null);
	const playingRef = useRef<HTMLAudioElement | null>(null);

	// Leaving the tab must not leave an audition note ringing.
	useEffect(() => () => playingRef.current?.pause(), []);

	const audition = useMutation({
		mutationFn: (program: number) =>
			apiClient.playGMInstrument({ program, note: 60, duration: 1.0 }),
		onSuccess: (blob) => {
			setAuditionError(null);
			playingRef.current?.pause();
			playingRef.current = playPreviewBlob(blob);
		},
		onError: (err: unknown) =>
			setAuditionError(err instanceof Error ? err.message : String(err)),
	});

	const programs = data?.programs ?? [];
	const families = [ALL_FAMILIES, ...new Set(programs.map((p) => p.family))];
	const visible =
		family === ALL_FAMILIES
			? programs
			: programs.filter((p) => p.family === family);
	const errorText =
		auditionError ??
		(isError ? (error instanceof Error ? error.message : String(error)) : null);

	return (
		<div className="flex w-full flex-col gap-3">
			<fieldset className="flex min-w-0 flex-wrap gap-1">
				<legend className="sr-only">Instrument families</legend>
				{families.map((name) => (
					<Button
						aria-pressed={name === family}
						key={name}
						onClick={() => setFamily(name)}
						size="sm"
						type="button"
						variant={name === family ? "secondary" : "ghost"}
					>
						{name}
					</Button>
				))}
			</fieldset>
			{data?.note ? (
				<p className="text-muted-foreground text-xs">{data.note}</p>
			) : null}
			{data?.soundfont_available === false ? (
				<output className="block rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-xs">
					<p className="font-medium text-warning-text">
						No SoundFont installed
					</p>
					<p className="mt-1 text-muted-foreground">
						GM notes won&apos;t render until you install a GM bank.{" "}
						<Link className="underline hover:no-underline" to="/store">
							Open the Store
						</Link>
					</p>
				</output>
			) : null}
			{errorText ? (
				<div
					className="rounded-md border border-destructive/40 bg-danger-soft px-3 py-2 text-xs text-danger-text"
					role="alert"
				>
					<p>{errorText}</p>
					<p className="mt-1">
						Install an instrument pack from the Store to render GM notes.{" "}
						<Link className="underline hover:no-underline" to="/store">
							Open the Store
						</Link>
					</p>
				</div>
			) : null}
			{isPending ? (
				<Spinner size="sm" />
			) : (
				<ul className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
					{visible.map((program) => (
						<li key={program.program}>
							<Button
								className="w-full justify-start gap-2"
								loading={
									audition.isPending && audition.variables === program.program
								}
								onClick={() => audition.mutate(program.program)}
								type="button"
								variant="ghost"
							>
								<span className="text-muted-foreground text-xs tabular-nums">
									{String(program.program).padStart(3, "0")}
								</span>
								<span className="truncate">{program.name}</span>
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
