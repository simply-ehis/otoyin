import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";

const ENVIRONMENTS = [
	"car_interior",
	"coffee_shop",
	"bedroom",
	"church",
	"studio_booth",
] as const;

interface Props {
	environment: string;
	onEnvironmentChange: (v: string) => void;
	convolutionMix: number;
	onConvolutionMixChange: (v: number) => void;
	dopplerIntensity: number;
	onDopplerChange: (v: number) => void;
	binaural: boolean;
	onBinauralChange: (v: boolean) => void;
	steamAudioAvailable: boolean;
}

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
}: Props) {
	return (
		<>
			{/* Engine badge */}
			<div className="flex items-center gap-2">
				<Badge
					variant={steamAudioAvailable ? "default" : "secondary"}
					className="text-xs"
				>
					{steamAudioAvailable ? "Steam Audio" : "NumPy Fallback"}
				</Badge>
				{!steamAudioAvailable && (
					<span className="text-xs text-muted-foreground">
						Download Steam Audio for real HRTF
					</span>
				)}
			</div>

			{/* Environment */}
			<div className="space-y-1.5">
				<Label className="text-xs">Environment</Label>
				<Select value={environment} onValueChange={onEnvironmentChange}>
					<SelectTrigger className="h-8 text-xs">
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

			{/* Convolution mix */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs">Convolution Mix</Label>
					<span className="text-xs font-mono text-muted-foreground">
						{(convolutionMix * 100).toFixed(0)}%
					</span>
				</div>
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[convolutionMix]}
					onValueChange={([v]) => onConvolutionMixChange(v)}
				/>
			</div>

			{/* Doppler */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs">Doppler Effect</Label>
					<span className="text-xs font-mono text-muted-foreground">
						{dopplerIntensity.toFixed(2)}
					</span>
				</div>
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[dopplerIntensity]}
					onValueChange={([v]) => onDopplerChange(v)}
				/>
			</div>

			{/* Binaural toggle */}
			<div className="flex items-center justify-between">
				<Label className="text-xs">HRTF Binaural</Label>
				<Toggle
					checked={binaural}
					onCheckedChange={onBinauralChange}
					label={binaural ? "HRTF Binaural on" : "HRTF Binaural off"}
					className="h-6 px-2 text-xs"
				/>
			</div>
		</>
	);
}
