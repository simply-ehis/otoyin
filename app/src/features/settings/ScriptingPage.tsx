import {
	CodeBracketIcon,
	CommandLineIcon,
	PlayIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { debug } from "@/lib/utils/debug";
import { Button } from "@/ui/button";
import { Card, CardBody, CardTitle } from "@/ui/card";
import { CodeConsole } from "@/ui/code-console";
import { Field, Textarea } from "@/ui/input";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

interface ScriptFunction {
	name: string;
	description: string;
	parameters: Record<string, { type: string; description: string }>;
}

/**
 * Scripting console: pick a backend function, edit JSON args, run,
 * read the result. Parameters documented inline per function.
 */
export function ScriptingPage() {
	const { toast } = useToast();
	const [functions, setFunctions] = useState<ScriptFunction[]>([]);
	const [selected, setSelected] = useState("");
	const [argsJson, setArgsJson] = useState("{}");
	const [argsError, setArgsError] = useState<string | null>(null);
	const [result, setResult] = useState<string | null>(null);
	const [executing, setExecuting] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		apiClient
			.listScriptingFunctions()
			.then((data: ScriptFunction[]) => {
				setFunctions(data);
				if (data.length > 0 && data[0]) {
					setSelected(data[0].name);
				}
			})
			.catch((err: unknown) => {
				debug.warn("[scripting] list functions failed:", err);
				setFunctions([]);
			})
			.finally(() => setLoading(false));
	}, []);

	const current = functions.find((f) => f.name === selected);

	const run = async () => {
		if (!selected) {
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(argsJson);
		} catch {
			setArgsError("Arguments must be valid JSON.");
			return;
		}
		setArgsError(null);
		setExecuting(true);
		setResult(null);
		try {
			const res = await apiClient.executeScriptingFunction(
				selected,
				parsed as Record<string, unknown>,
			);
			setResult(JSON.stringify(res, null, 2));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Execution failed";
			setResult(msg);
			toast({
				title: "Script error",
				description: msg,
				variant: "destructive",
			});
		} finally {
			setExecuting(false);
		}
	};

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<ScreenHeader title="Scripting API" />
			{loading ? (
				<LoadingState label="Loading functions" lines={5} />
			) : functions.length === 0 ? (
				<EmptyState
					icon={<CodeBracketIcon aria-hidden="true" />}
					title="No functions available"
					body="Connect to the backend to list scripting functions."
				/>
			) : (
				<>
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<Card>
							<CardTitle className="text-sm">Available functions</CardTitle>
							<CardBody className="mt-3 flex flex-col gap-2">
								{functions.map((fn) => (
									<button
										key={fn.name}
										type="button"
										onClick={() => setSelected(fn.name)}
										aria-pressed={selected === fn.name}
										className={cn(
											"w-full rounded-sm border p-3 text-left text-sm transition-colors",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											selected === fn.name
												? "border-accent/40 bg-secondary"
												: "border-border hover:bg-secondary",
										)}
									>
										<span className="block font-mono text-xs font-medium text-foreground">
											{fn.name}
										</span>
										<span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
											{fn.description}
										</span>
									</button>
								))}
							</CardBody>
						</Card>

						<Card>
							<CardTitle className="text-sm">Execute function</CardTitle>
							<CardBody className="mt-3 flex flex-col gap-4">
								<Field label="Function" htmlFor="script-func">
									<Select value={selected} onValueChange={setSelected}>
										<SelectTrigger
											id="script-func"
											aria-label="Scripting function"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{functions.map((fn) => (
												<SelectItem key={fn.name} value={fn.name}>
													{fn.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								{current && Object.keys(current.parameters).length > 0 ? (
									<ul className="flex flex-col gap-1 text-xs text-muted-foreground">
										{Object.entries(current.parameters).map(([key, param]) => (
											<li key={key}>
												<Label className="font-mono text-accent">{key}</Label>:{" "}
												{param.description}
											</li>
										))}
									</ul>
								) : null}
								<Field
									label="Arguments (JSON)"
									htmlFor="script-args"
									error={argsError ?? undefined}
								>
									<Textarea
										id="script-args"
										value={argsJson}
										onChange={(e) => setArgsJson(e.target.value)}
										className="min-h-[100px] font-mono text-xs"
										placeholder='{"key": "value"}'
										spellCheck={false}
									/>
								</Field>
								<div>
									<Button
										onClick={run}
										disabled={executing || !selected}
										loading={executing}
									>
										<PlayIcon
											className="mr-1.5 h-3.5 w-3.5"
											aria-hidden="true"
										/>
										{executing ? "Executing…" : "Run"}
									</Button>
								</div>
							</CardBody>
						</Card>
					</div>

					{result !== null ? (
						<Card>
							<CardTitle className="flex items-center gap-2 text-sm">
								<CommandLineIcon
									className="size-4 text-muted-foreground"
									aria-hidden="true"
								/>
								Result
							</CardTitle>
							<CardBody className="mt-3">
								<CodeConsole>{result}</CodeConsole>
							</CardBody>
						</Card>
					) : null}
				</>
			)}
		</div>
	);
}
