import {
	ArrowPathIcon,
	PlusIcon,
	XCircleIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_DESC_BATCH_FAILED, ERR_TITLE_BATCH } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/ui/dialog";
import { Input, Textarea } from "@/ui/input";
import { Badge, Label, Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/ui/table";
import { useToast } from "@/ui/use-toast";

type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface BatchJob {
	id: string;
	name: string;
	status: JobStatus;
	progress: number;
	result: Record<string, unknown> | null;
	result_path: string | null;
	error: string | null;
	created_at: string;
	completed_at: string | null;
	func_name: string;
}

interface ScriptingFunction {
	name: string;
	description: string;
	params: Record<string, string>;
}

const STATUS_TONE: Record<
	JobStatus,
	"neutral" | "accent" | "success" | "danger"
> = {
	pending: "neutral",
	running: "accent",
	completed: "success",
	failed: "danger",
	cancelled: "neutral",
};

const FILTERS: (JobStatus | null)[] = [
	null,
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
];

function formatDate(iso: string | null) {
	if (!iso) {
		return "—";
	}
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function BatchQueueView() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [newJobName, setNewJobName] = useState("");
	const [selectedFunc, setSelectedFunc] = useState("");
	const [funcArgsText, setFuncArgsText] = useState("{}");

	const jobsQuery = useQuery({
		queryKey: ["batch-jobs"],
		queryFn: () => apiClient.listBatchJobs(),
		refetchInterval: 3000,
	});

	const functionsQuery = useQuery({
		queryKey: ["scripting-functions"],
		queryFn: () => apiClient.listScriptingFunctions(),
		enabled: dialogOpen,
	});

	const createMut = useMutation({
		mutationFn: () => {
			let funcArgs: Record<string, unknown> = {};
			try {
				funcArgs = JSON.parse(funcArgsText) as Record<string, unknown>;
			} catch {
				throw new Error("Invalid JSON in arguments. Check your JSON syntax.");
			}
			return apiClient.createBatchJob(
				newJobName || selectedFunc || "Batch Job",
				selectedFunc,
				funcArgs,
			);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["batch-jobs"] });
			setDialogOpen(false);
			setNewJobName("");
			setSelectedFunc("");
			setFuncArgsText("{}");
			toast({ title: "Job created" });
		},
		onError: () =>
			toast({
				title: ERR_TITLE_BATCH,
				description: ERR_DESC_BATCH_FAILED,
				variant: "destructive",
			}),
	});

	const cancelMut = useMutation({
		mutationFn: (jobId: string) => apiClient.cancelBatchJob(jobId),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["batch-jobs"] }),
		onError: () =>
			toast({
				title: ERR_TITLE_BATCH,
				description: ERR_DESC_BATCH_FAILED,
				variant: "destructive",
			}),
	});

	const rawJobs = (jobsQuery.data?.jobs ?? []) as BatchJob[];
	const filteredJobs = statusFilter
		? rawJobs.filter((j) => j.status === statusFilter)
		: rawJobs;
	const functions = (functionsQuery.data ?? []) as ScriptingFunction[];

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Batch Queue"
				description="Run scripting functions across many files"
				actions={
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							title="Refresh queue"
							aria-label="Refresh queue"
							onClick={() =>
								void queryClient.invalidateQueries({ queryKey: ["batch-jobs"] })
							}
						>
							{jobsQuery.isLoading ? (
								<Spinner size="xs" />
							) : (
								<ArrowPathIcon className="size-3.5" aria-hidden="true" />
							)}
						</Button>
						<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
							<DialogTrigger asChild>
								<Button type="button" size="sm" className="h-7 text-xs">
									<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
									New Job
								</Button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-lg">
								<DialogHeader>
									<DialogTitle>Create batch job</DialogTitle>
								</DialogHeader>
								<div className="space-y-3">
									<div className="space-y-1">
										<Label htmlFor="batch-name">Job name</Label>
										<Input
											id="batch-name"
											className="h-8 text-xs"
											placeholder="My batch job"
											value={newJobName}
											onChange={(e) => setNewJobName(e.target.value)}
										/>
									</div>
									<div className="space-y-1">
										<Label>Scripting function</Label>
										<div className="max-h-48 space-y-2 overflow-y-auto">
											{functions.map((fn) => (
												<button
													key={fn.name}
													type="button"
													aria-pressed={selectedFunc === fn.name}
													className={cn(
														"w-full rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
														selectedFunc === fn.name
															? "border-accent bg-accent-muted"
															: "border-border bg-card hover:border-strong",
													)}
													onClick={() => setSelectedFunc(fn.name)}
												>
													<span className="font-medium text-foreground">
														{fn.name}
													</span>{" "}
													<span className="text-muted-foreground">
														{fn.description}
													</span>
												</button>
											))}
											{functions.length === 0 && <Spinner size="xs" />}
										</div>
									</div>
									<div className="space-y-1">
										<Label htmlFor="batch-args">Arguments (JSON)</Label>
										<Textarea
											id="batch-args"
											className="h-20 font-mono text-xs"
											placeholder='{"key": "value"}'
											value={funcArgsText}
											onChange={(e) => setFuncArgsText(e.target.value)}
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										type="button"
										size="sm"
										className="h-8 w-full text-xs"
										disabled={createMut.isPending || !selectedFunc}
										onClick={() => createMut.mutate()}
									>
										{createMut.isPending ? (
											<Spinner size="xs" className="mr-1" />
										) : null}
										Create Job
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				}
			/>

			<fieldset
				className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0"
				aria-label="Filter by status"
			>
				{FILTERS.map((status) => (
					<button
						key={status ?? "all"}
						type="button"
						aria-pressed={statusFilter === status}
						className={cn(
							"rounded-full border px-3 py-1 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							statusFilter === status
								? "border-accent bg-accent-muted text-accent"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
						onClick={() => setStatusFilter(status)}
					>
						{status ?? "All"}{" "}
						{status
							? rawJobs.filter((j) => j.status === status).length
							: rawJobs.length}
					</button>
				))}
			</fieldset>

			{jobsQuery.isLoading ? (
				<LoadingState label="Loading batch jobs" />
			) : jobsQuery.isError ? (
				<EmptyState
					title="Batch jobs couldn't load"
					body="Check the server connection and try refreshing."
				/>
			) : filteredJobs.length === 0 ? (
				<EmptyState
					title={statusFilter ? `No ${statusFilter} jobs` : "No batch jobs yet"}
					body={
						statusFilter
							? "No jobs currently have this status."
							: "Create a batch job to process multiple files at once."
					}
					action={
						!statusFilter ? (
							<Button
								type="button"
								size="sm"
								className="h-8 text-xs"
								onClick={() => setDialogOpen(true)}
							>
								<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
								Create First Job
							</Button>
						) : undefined
					}
				/>
			) : (
				<Table>
					<TableHead>
						<TableRow>
							<TableHeaderCell>Job</TableHeaderCell>
							<TableHeaderCell>Status</TableHeaderCell>
							<TableHeaderCell>Progress</TableHeaderCell>
							<TableHeaderCell>Created</TableHeaderCell>
							<TableHeaderCell>Result / Error</TableHeaderCell>
							<TableHeaderCell>Actions</TableHeaderCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{filteredJobs.map((job) => (
							<TableRow key={job.id}>
								<TableCell>
									<div
										className="max-w-50 truncate font-medium"
										title={job.name}
									>
										{job.name}
									</div>
									<div className="mt-0.5 font-mono text-xs text-muted-foreground">
										{job.id.slice(0, 8)}
										{job.func_name ? ` · ${job.func_name}` : ""}
									</div>
								</TableCell>
								<TableCell>
									<Badge tone={STATUS_TONE[job.status] ?? "neutral"}>
										{job.status}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<Progress
											value={job.progress * 100}
											className="h-1.5 w-24"
											label={`${job.name} progress`}
										/>
										<span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
											{Math.round(job.progress * 100)}%
										</span>
									</div>
								</TableCell>
								<TableCell>
									<div>{formatDate(job.created_at)}</div>
									{job.completed_at ? (
										<div className="text-xs text-muted-foreground">
											done {formatDate(job.completed_at)}
										</div>
									) : null}
								</TableCell>
								<TableCell>
									{job.status === "failed" && job.error ? (
										<span
											className="block max-w-50 truncate text-xs text-destructive"
											title={job.error}
										>
											{job.error}
										</span>
									) : job.status === "completed" && job.result ? (
										<span
											className="block max-w-50 truncate text-xs text-muted-foreground"
											title={JSON.stringify(job.result)}
										>
											{JSON.stringify(job.result).slice(0, 60)}
										</span>
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell>
									{job.status === "pending" || job.status === "running" ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs text-destructive hover:text-destructive"
											title="Cancel job"
											aria-label={`Cancel ${job.name}`}
											disabled={cancelMut.isPending}
											onClick={() => cancelMut.mutate(job.id)}
										>
											<XCircleIcon className="size-3.5" aria-hidden="true" />
										</Button>
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
