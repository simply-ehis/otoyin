import { Badge, Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { Toggle } from "@/ui/toggle";

const ENVIRONMENTS = [
	"car_interior",
	"coffee_shop",
	"bedroom",
	"church",
	"studio_booth",
] as const;

export function SpatialControls({
	environment,
	onEnvironmentChange,
	convolutionMix,
	onConvolutionMixChange,
	dopplerIntensity,
	onDopplerChange,
	binaural,
	onBinauralChange,
	steamAudioAvailable,
}: {
	environment: string;
	onEnvironmentChange: (v: string) => void;
	convolutionMix: number;
	onConvolutionMixChange: (v: number) => void;
	dopplerIntensity: number;
	onDopplerChange: (v: number) => void;
	binaural: boolean;
	onBinauralChange: (v: boolean) => void;
	steamAudioAvailable: boolean;
}) {
	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={steamAudioAvailable ? "accent" : "neutral"}>
					{steamAudioAvailable ? "Steam Audio" : "NumPy fallback"}
				</Badge>
				{!steamAudioAvailable && (
					<span className="text-xs text-muted-foreground">
						Download Steam Audio for real HRTF.
					</span>
				)}
			</div>

			<div className="space-y-1">
				<Label htmlFor="spatial-env">Environment</Label>
				<Select value={environment} onValueChange={onEnvironmentChange}>
					<SelectTrigger id="spatial-env" className="h-8 max-w-xs text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ENVIRONMENTS.map((env) => (
							<SelectItem key={env} value={env}>
								{env
									.replace(/_/g, " ")
									.replace(/\b\w/g, (c) => c.toUpperCase())}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="max-w-xs space-y-1">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="spatial-wet">Convolution mix</Label>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{(convolutionMix * 100).toFixed(0)}%
					</span>
				</div>
				<Slider
					id="spatial-wet"
					min={0}
					max={1}
					step={0.01}
					value={[convolutionMix]}
					onValueChange={([v]) => onConvolutionMixChange(v ?? 0.3)}
					aria-label="Convolution mix"
				/>
			</div>

			<div className="max-w-xs space-y-1">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="spatial-doppler">Doppler effect</Label>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{dopplerIntensity.toFixed(2)}
					</span>
				</div>
				<Slider
					id="spatial-doppler"
					min={0}
					max={1}
					step={0.01}
					value={[dopplerIntensity]}
					onValueChange={([v]) => onDopplerChange(v ?? 0)}
					aria-label="Doppler effect"
				/>
			</div>

			<div className="flex items-center justify-between gap-2">
				<Label htmlFor="spatial-binaural">HRTF binaural</Label>
				<Toggle
					id="spatial-binaural"
					pressed={binaural}
					onPressedChange={onBinauralChange}
					className="h-6 px-2 text-xs"
					aria-label={binaural ? "HRTF binaural on" : "HRTF binaural off"}
				>
					{binaural ? "On" : "Off"}
				</Toggle>
			</div>
		</>
	);
}
