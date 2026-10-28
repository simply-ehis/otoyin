import { useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { ScreenHeader } from "@/ui/states";

/**
 * Timecode display: show and set a timecode value (HH:MM:SS:FF) for the
 * current playhead or cursor position. Used by the workspace timeline and
 * ADR workflows.
 */
export function TimecodeDisplay() {
	const [timecode, setTimecode] = useState("00:00:00:00");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/[^0-9:]/g, "");
		setTimecode(value);
	};

	return (
		<div className="flex flex-col gap-4 p-6">
			<ScreenHeader title="Timecode" description="Set or view the current playhead timecode" />
			<div className="flex flex-col gap-2">
				<label htmlFor="tc-input" className="text-sm font-medium text-muted-foreground">
					Timecode (HH:MM:SS:FF)
				</label>
				<Input
					id="tc-input"
					value={timecode}
					onChange={handleChange}
					placeholder="00:00:00:00"
					maxLength={11}
				/>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={() => setTimecode("00:00:00:00")}>
					Reset
				</Button>
				<Button>Apply</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Current timecode: <span className="font-mono text-foreground">{timecode}</span>
			</p>
		</div>
	);
}
