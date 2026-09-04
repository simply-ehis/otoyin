export function automationCurve(
	points: { time: number; value: number }[],
	n: number,
	sr: number,
	fallback: number,
): Float32Array {
	const out = new Float32Array(n);
	if (!points.length) {
		out.fill(fallback);
		return out;
	}
	const times = points.map((p) => p.time);
	const vals = points.map((p) => p.value);
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		let v = fallback;
		if (t <= times[0]) {
			v = vals[0];
		} else if (t >= times[times.length - 1]) {
			v = vals[vals.length - 1];
		} else {
			for (let j = 0; j < times.length - 1; j++) {
				if (t >= times[j] && t <= times[j + 1]) {
					const f = (t - times[j]) / (times[j + 1] - times[j]);
					v = vals[j] + (vals[j + 1] - vals[j]) * f;
					break;
				}
			}
		}
		out[i] = v;
	}
	return out;
}
