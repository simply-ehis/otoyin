import { HeartIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { Button } from "@/ui/button";

const PRESETS = [5, 10, 25, 50];

// Donation checkout page — replace with your Stripe/Payment link.
const DONATE_CHECKOUT_URL = "https://buy.stripe.com/test_donation";

export function DonateCard() {
	const [amount, setAmount] = useState(10);

	const openDonate = () => {
		const url = `${DONATE_CHECKOUT_URL}?amount=${amount}`;
		window.open(url, "_blank", "noopener,noreferrer");
	};

	return (
		<div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-blue-500/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-sm">
			<div
				aria-hidden
				className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-pink-500/30 blur-3xl"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-12 -left-8 size-44 rounded-full bg-blue-500/30 blur-3xl"
			/>

			<div className="relative flex items-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
					<HeartIcon className="size-6 text-pink-300" />
				</div>
				<div>
					<h3 className="text-lg font-bold tracking-tight text-foreground">
						Support otoyin
					</h3>
					<p className="text-xs text-muted-foreground">
						Keep it free, private, and offline-first.
					</p>
				</div>
			</div>

			<p className="relative mt-4 text-sm leading-relaxed text-muted-foreground">
				otoyin is built and maintained by one person. If it saves you time or
				money, a small donation keeps the project alive and the models free for
				everyone.
			</p>

			<div className="relative mt-5">
				<div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Choose an amount
				</div>
				<div className="flex flex-wrap gap-2">
					{PRESETS.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => setAmount(p)}
							className={
								"rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
								(amount === p
									? "border-pink-400/60 bg-pink-500/30 text-foreground"
									: "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10")
							}
						>
							${p}
						</button>
					))}
				</div>
			</div>

			<Button
				size="sm"
				onClick={openDonate}
				className="relative mt-5 w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-400 hover:to-purple-400"
			>
				<HeartIcon className="size-3.5" /> Donate ${amount}
			</Button>

			<p className="relative mt-3 text-center text-[11px] text-muted-foreground">
				Opens checkout in your browser
			</p>
		</div>
	);
}
