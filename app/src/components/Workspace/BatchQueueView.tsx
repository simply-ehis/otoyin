import {
	ExclamationCircleIcon as AlertCircle,
	CheckCircleIcon as CheckCircle2,
	ClockIcon as Clock,
	ListBulletIcon as ListTree,
	PlayIcon as Play,
	PlusIcon as Plus,
	ArrowPathIcon as RefreshCw,
	XCircleIcon as XCircle,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { ERR_DESC_BATCH_FAILED, ERR_TITLE_BATCH } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";

interface BatchJob {
	id: string;
	name: string;
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
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

const statusConfig: Record<
	string,
	{
		label: string;
		icon: typeof Clock;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	pending: { label: "Pending", icon: Clock, variant: "secondary" },
	running: { label: "Running", icon: Play, variant: "default" },
	completed: { label: "Completed", icon: CheckCircle2, variant: "outline" },
	failed: { label: "Failed", icon: AlertCircle, variant: "destructive" },
	cancelled: { label: "Cancelled", icon: XCircle, variant: "secondary" },
};

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
	const [statusFilter, setStatusFilter] = useState<string | null>(null);
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
				funcArgs = JSON.parse(funcArgsText);
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
			queryClient.invalidateQueries({ queryKey: ["batch-jobs"] });
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
			queryClient.invalidateQueries({ queryKey: ["batch-jobs"] }),
		onError: () =>
			toast({
				title: ERR_TITLE_BATCH,
				description: ERR_DESC_BATCH_FAILED,
				variant: "destructive",
			}),
	});

	const rawJobs: BatchJob[] =
		(jobsQuery.data as { jobs?: BatchJob[] })?.jobs ?? [];
	const filteredJobs = statusFilter
		? rawJobs.filter((j) => j.status === statusFilter)
		: rawJobs;

	const functions: ScriptingFunction[] =
		(functionsQuery.data as ScriptingFunction[]) ?? [];

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				title="Batch Queue"
				actions={
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							title="Refresh"
							onClick={() =>
								queryClient.invalidateQueries({ queryKey: ["batch-jobs"] })
							}
						>
							{jobsQuery.isLoading ? (
								<Spinner size="sm" />
							) : (
								<RefreshCw className="h-3.5 w-3.5" />
							)}
						</Button>
						<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
							<DialogTrigger asChild>
								<Button size="sm" className="h-7 text-xs">
									<Plus className="h-3.5 w-3.5 mr-1" /> New Job
								</Button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-lg">
								<DialogHeader>
									<DialogTitle className="text-sm">
										Create Batch Job
									</DialogTitle>
								</DialogHeader>
								<div className="space-y-3">
									<div>
										<Label className="text-xs">Job Name</Label>
										<Input
											className="h-8 text-xs mt-1"
											placeholder="My batch job"
											value={newJobName}
											onChange={(e) => setNewJobName(e.target.value)}
										/>
									</div>
									<div>
										<Label className="text-xs">Scripting Function</Label>
										<div className="grid grid-cols-1 gap-2 mt-1 max-h-48 overflow-y-auto">
											{functions.map((fn) => (
												<button
													key={fn.name}
													type="button"
													className={cn(
														"text-left px-3 py-2 rounded-lg border text-xs transition-colors",
														selectedFunc === fn.name
															? "border-accent bg-accent/10"
															: "border-border bg-card hover:border-accent/50",
													)}
													onClick={() => setSelectedFunc(fn.name)}
												>
													<span className="font-medium text-foreground">
														{fn.name}
													</span>
													<span className="text-muted-foreground ml-2">
														{fn.description}
													</span>
												</button>
											))}
											{functions.length === 0 && (
												<Spinner
													label="Loading functions…"
													className="py-2 justify-start"
												/>
											)}
										</div>
									</div>
									<div>
										<Label className="text-xs">Arguments (JSON)</Label>
										<Textarea
											className="text-xs mt-1 h-20 font-mono"
											placeholder='{"key": "value"}'
											value={funcArgsText}
											onChange={(e) => setFuncArgsText(e.target.value)}
										/>
									</div>
									<Button
										size="sm"
										className="w-full h-8 text-xs"
										disabled={createMut.isPending || !selectedFunc}
										onClick={() => createMut.mutate()}
									>
										{createMut.isPending ? (
											<Spinner size="sm" className="mr-1" />
										) : (
											<Plus className="h-3.5 w-3.5 mr-1" />
										)}
										Create Job
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				}
			/>

			{/* Status filter */}
			<div className="flex items-center gap-2">
				{[null, "pending", "running", "completed", "failed", "cancelled"].map(
					(status) => (
						<button
							key={status ?? "all"}
							type="button"
							className={cn(
								"text-xs px-3 py-1 rounded-full border transition-colors",
								statusFilter === status
									? "border-accent bg-accent/10 text-accent"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setStatusFilter(status)}
						>
							{status ?? "All"}{" "}
							{status
								? rawJobs.filter((j) => j.status === status).length
								: rawJobs.length}
						</button>
					),
				)}
			</div>

			{/* Job list */}
			{jobsQuery.isLoading ? (
				<LoadingState />
			) : jobsQuery.isError ? (
				<EmptyState
					variant="error"
					icon={<ListTree />}
					title="Failed to load batch jobs"
					description="Something went wrong while fetching the queue. Try refreshing."
				/>
			) : filteredJobs.length === 0 ? (
				<EmptyState
					icon={<ListTree />}
					title={statusFilter ? `No ${statusFilter} jobs` : "No batch jobs yet"}
					description={
						statusFilter
							? `There are no jobs with the “${statusFilter}” status.`
							: "Create a batch job to process multiple files at once."
					}
					action={
						!statusFilter && (
							<Button
								size="sm"
								className="h-8 text-xs"
								onClick={() => setDialogOpen(true)}
							>
								<Plus className="h-3.5 w-3.5 mr-1" /> Create First Job
							</Button>
						)
					}
				/>
			) : (
				<div className="flex-1 overflow-y-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="border-b border-border text-muted-foreground">
								<th className="text-left py-2 px-2 font-medium">Job</th>
								<th className="text-left py-2 px-2 font-medium w-24">Status</th>
								<th className="text-left py-2 px-2 font-medium w-32">
									Progress
								</th>
								<th className="text-left py-2 px-2 font-medium w-36">
									Created
								</th>
								<th className="text-left py-2 px-2 font-medium">
									Result / Error
								</th>
								<th className="text-right py-2 px-2 font-medium w-16">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredJobs.map((job) => {
								const cfg = statusConfig[job.status] ?? statusConfig.pending;
								const Icon = cfg.icon;
								return (
									<tr key={job.id} className="hover:bg-muted/30">
										<td className="py-3 px-2">
											<div
												className="text-foreground font-medium truncate max-w-[200px]"
												title={job.name}
											>
												{job.name}
											</div>
											<div className="text-xs text-muted-foreground font-mono mt-0.5">
												{job.id.slice(0, 8)}{" "}
												{job.func_name && `· ${job.func_name}`}
											</div>
										</td>
										<td className="py-3 px-2">
											<Badge
												variant={cfg.variant}
												className="text-xs uppercase flex items-center gap-1 w-fit"
											>
												<Icon className="size-3" />
												{cfg.label}
											</Badge>
										</td>
										<td className="py-3 px-2">
											{job.status === "running" || job.status === "pending" ? (
												<div className="flex items-center gap-2">
													<Progress
														value={job.progress * 100}
														className="h-1.5 flex-1"
													/>
													<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
														{Math.round(job.progress * 100)}%
													</span>
												</div>
											) : (
												<Progress
													value={job.progress * 100}
													className="h-1.5 w-24 opacity-50"
												/>
											)}
										</td>
										<td className="py-3 px-2 text-muted-foreground">
											<div>{formatDate(job.created_at)}</div>
											{job.completed_at && (
												<div className="text-xs text-muted-foreground/60">
													done {formatDate(job.completed_at)}
												</div>
											)}
										</td>
										<td className="py-3 px-2">
											{job.status === "failed" && job.error && (
												<span
													className="text-destructive text-xs block truncate max-w-[200px]"
													title={job.error}
												>
													{job.error}
												</span>
											)}
											{job.status === "completed" && job.result && (
												<span
													className="text-xs text-muted-foreground truncate max-w-[200px] block"
													title={JSON.stringify(job.result)}
												>
													{JSON.stringify(job.result).slice(0, 60)}
													{JSON.stringify(job.result).length > 60 ? "…" : ""}
												</span>
											)}
											{job.status === "pending" || job.status === "running" ? (
												<span className="text-xs text-muted-foreground">
													—
												</span>
											) : null}
										</td>
										<td className="py-3 px-2 text-right">
											{job.status === "pending" || job.status === "running" ? (
												<button
													type="button"
													className="p-1 text-destructive/60 hover:text-destructive transition-colors"
													title="Cancel job"
													onClick={() => cancelMut.mutate(job.id)}
												>
													<XCircle className="h-3.5 w-3.5" />
												</button>
											) : (
												<span className="text-muted-foreground/30 text-xs">
													—
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
