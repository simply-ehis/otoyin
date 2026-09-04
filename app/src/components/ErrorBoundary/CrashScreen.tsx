import { ArrowPathIcon as RefreshCw } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { CodeConsole } from "@/components/ui/code-console";
import type { StudioError } from "@/lib/errors";

interface CrashScreenProps {
	error: StudioError;
	onRetry?: () => void;
	originalError?: Error;
}

/** A waveform that runs normally, then flatlines — the visual for "the signal died". */
function FlatlinedWaveform() {
	const bars = [8, 14, 22, 16, 28, 12, 24, 18, 10, 20, 6];
	return (
		<svg
			viewBox="0 0 220 48"
			className="h-12 w-full max-w-[220px]"
			role="img"
			aria-label="Audio signal cutting out"
		>
			<title>Audio signal cutting out</title>
			{bars.map((h, i) => (
				<rect
					key={h}
					x={i * 11}
					y={24 - h / 2}
					width={5}
					height={h}
					rx={1.5}
					className="fill-muted-foreground/50"
					style={{
						animation: `crash-bar-fade 1.8s ease-in-out ${i * 0.05}s infinite alternate`,
					}}
				/>
			))}
			{/* the flatline picking up where the bars die out */}
			<line
				x1={bars.length * 11 + 4}
				y1={24}
				x2={210}
				y2={24}
				strokeWidth={2}
				className="stroke-destructive"
				strokeLinecap="round"
			/>
			<circle cx={210} cy={24} r={3} className="fill-destructive">
				<animate
					attributeName="opacity"
					values="1;0.2;1"
					dur="1.4s"
					repeatCount="indefinite"
				/>
			</circle>
			<style>{`
    @keyframes crash-bar-fade {
     from { opacity: 0.85; transform: scaleY(1); }
     to { opacity: 0.35; transform: scaleY(0.6); }
    }
   `}</style>
		</svg>
	);
}

export function CrashScreen({
	error,
	onRetry,
	originalError,
}: CrashScreenProps) {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-8">
			<Card className="max-w-lg w-full border-destructive/30 shadow-xl">
				<CardHeader className="text-center pb-2">
					<div className="mx-auto mb-4 flex h-16 items-center justify-center">
						<FlatlinedWaveform />
					</div>
					<h2 className="text-2xl font-bold tracking-tight text-foreground">
						{error.title}
					</h2>
				</CardHeader>
				<CardContent className="text-center space-y-4">
					<p className="text-muted-foreground leading-relaxed">
						{error.message}
					</p>
					{originalError && (
						<details className="text-left">
							<summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
								Console log
							</summary>
							<CodeConsole maxHeight="8rem" className="mt-2">
								{originalError.stack ?? originalError.message}
							</CodeConsole>
						</details>
					)}
				</CardContent>
				{error.retryable && onRetry && (
					<CardFooter className="justify-center pt-0">
						<Button variant="outline" onClick={onRetry}>
							<RefreshCw className="mr-2 size-4" />
							Retry
						</Button>
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
