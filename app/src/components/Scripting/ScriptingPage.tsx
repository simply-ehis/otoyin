import {
	CodeBracketIcon as Code2,
	PlayIcon as Play,
	CommandLineIcon as Terminal,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeConsole } from "@/components/ui/code-console";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface ScriptFunction {
	name: string;
	description: string;
	parameters: Record<string, { type: string; description: string }>;
}

export function ScriptingPage() {
	const { toast } = useToast();
	const [functions, setFunctions] = useState<ScriptFunction[]>([]);
	const [selectedFunc, setSelectedFunc] = useState<string>("");
	const [paramsJson, setParamsJson] = useState("{}");
	const [result, setResult] = useState<string | null>(null);
	const [executing, setExecuting] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		apiClient
			.listScriptingFunctions()
			.then((data: ScriptFunction[]) => {
				setFunctions(data);
				if (data.length > 0) {
					setSelectedFunc(data[0].name);
				}
			})
			.catch((err) => {
				debug.warn("[scripting] list functions failed:", err);
				setFunctions([]);
			})
			.finally(() => {
				setLoading(false);
			});
	}, []);

	const currentFunc = functions.find((f) => f.name === selectedFunc);

	const handleExecute = async () => {
		if (!selectedFunc) {
			return;
		}
		setExecuting(true);
		setResult(null);
		try {
			const parsed = JSON.parse(paramsJson);
			const res = await apiClient.executeScriptingFunction(
				selectedFunc,
				parsed,
			);
			setResult(JSON.stringify(res, null, 2));
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Execution failed";
			setResult(msg);
			toast({
				title: "Script Error",
				description: msg,
				variant: "destructive",
			});
		} finally {
			setExecuting(false);
		}
	};

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Terminal className="size-5" />
						Scripting API
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground py-8 text-center">
						Loading functions…
					</p>
				</CardContent>
			</Card>
		);
	}

	if (functions.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Terminal className="size-5" />
						Scripting API
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
						<Code2 className="size-12 opacity-30" />
						<p className="text-sm">
							Connect to backend to view available scripting functions
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Terminal className="size-6" />
				<h1 className="text-2xl font-bold">Scripting API</h1>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Available Functions</CardTitle>
					</CardHeader>
					<CardContent>
						{functions.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No functions available.
							</p>
						) : (
							<div className="space-y-3">
								{functions.map((fn) => (
									<button
										key={fn.name}
										type="button"
										onClick={() => setSelectedFunc(fn.name)}
										className={cn(
											"w-full text-left p-3 rounded-md border text-sm transition-colors",
											selectedFunc === fn.name
												? "border-accent bg-accent/10"
												: "border-border hover:bg-muted",
										)}
									>
										<div className="font-mono text-xs font-medium">
											{fn.name}
										</div>
										<div className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
											{fn.description}
										</div>
									</button>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Execute Function</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="func-select">Function</Label>
							<Select value={selectedFunc} onValueChange={setSelectedFunc}>
								<SelectTrigger
									id="func-select"
									aria-label="Select scripting function"
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
						</div>

						{currentFunc?.parameters &&
							Object.keys(currentFunc.parameters).length > 0 && (
								<div className="space-y-2">
									<Label htmlFor="params">Parameters (JSON)</Label>
									{Object.entries(currentFunc.parameters).map(
										([key, param]) => (
											<div key={key} className="text-xs text-muted-foreground">
												<code className="text-accent">{key}</code>:{" "}
												{param.description}
											</div>
										),
									)}
								</div>
							)}

						<div className="space-y-2">
							<Label htmlFor="params-json">Arguments JSON</Label>
							<Textarea
								id="params-json"
								value={paramsJson}
								onChange={(e) => setParamsJson(e.target.value)}
								className="font-mono text-xs min-h-[100px]"
								placeholder='{"key": "value"}'
							/>
						</div>

						<Button
							onClick={handleExecute}
							disabled={executing || !selectedFunc}
							title="Execute scripting function"
							aria-label="Execute scripting function"
						>
							<Play className="w-3.5 h-3.5 mr-1.5" />
							{executing ? "Executing…" : "Run"}
						</Button>
					</CardContent>
				</Card>
			</div>

			{result !== null && (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm flex items-center gap-2">
							<Terminal className="size-4" />
							Result
						</CardTitle>
					</CardHeader>
					<CardContent>
						<CodeConsole className="p-4">{result}</CodeConsole>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
