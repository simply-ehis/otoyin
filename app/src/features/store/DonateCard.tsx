import { HeartIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { showStudioErrorToast } from "@/lib/errors";
import {
	getDeviceId,
	marketplaceClient,
	openExternalUrl,
} from "@/lib/marketplace";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { useToast } from "@/ui/use-toast";

const PRESETS = [5, 10, 25, 50];

/**
 * Donate card: voluntary custom-amount contributions via Paddle.
 * Not a catalog product (fixed prices can't express "pay what you want")
 * and mints no license — the thank-you is the product. Reuses the same
 * browser → poll loop as checkout, including Check-again recovery.
 */
export function DonateCard() {
	const { toast } = useToast();
	const [amount, setAmount] = useState("10");
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);
	const [pendingOrderRef, setPendingOrderRef] = useState<string | null>(null);
	const [thankedAmount, setThankedAmount] = useState<number | null>(null);

	const parsedAmount = Number(amount);
	const validAmount =
		Number.isFinite(parsedAmount) && parsedAmount >= 1 && parsedAmount <= 10000;

	const pollDonation = async (orderRef: string) => {
		const result = await marketplaceClient.pollForLicense(
			orderRef,
			getDeviceId(),
		);
		if (result.donated) {
			setThankedAmount(Number(result.amount_usd) || parsedAmount);
			setPendingOrderRef(null);
		} else {
			// A license payload here would mean backend misrouting — surface it.
			throw new Error("Unexpected response for a donation order.");
		}
	};

	const donate = async (orderRef?: string) => {
		setBusy(true);
		try {
			if (orderRef) {
				await pollDonation(orderRef);
				return;
			}
			if (!validAmount) {
				toast({
					title: "Enter an amount between $1 and $10,000",
					variant: "destructive",
				});
				return;
			}
			const checkout = await marketplaceClient.createDonation(
				parsedAmount,
				getDeviceId(),
				email.trim(),
			);
			await openExternalUrl(checkout.checkout_url);
			setPendingOrderRef(checkout.order_ref);
			await pollDonation(checkout.order_ref);
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setBusy(false);
		}
	};

	if (thankedAmount !== null) {
		return (
			<output className="rounded-lg border border-success/40 bg-success-soft px-4 py-3">
				<p className="flex items-center gap-2 text-sm font-medium text-success-text">
					<HeartIcon className="size-4" aria-hidden="true" />
					Thank you for the ${thankedAmount.toFixed(2)} donation — it keeps
					Otoyin independent.
				</p>
			</output>
		);
	}

	return (
		<section
			aria-label="Support Otoyin with a donation"
			className="rounded-lg border border-border bg-card px-4 py-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
					<HeartIcon
						className="size-4 shrink-0 text-accent"
						aria-hidden="true"
					/>
					<span>
						<span className="font-medium text-foreground">Support Otoyin.</span>{" "}
						Pay what you want, one time — no account, no subscription.
					</span>
				</h2>
				<fieldset className="flex items-center gap-1">
					<legend className="sr-only">Donation amount</legend>
					{PRESETS.map((preset) => (
						<Button
							key={preset}
							size="sm"
							variant={parsedAmount === preset ? "default" : "ghost"}
							onClick={() => setAmount(String(preset))}
						>
							${preset}
						</Button>
					))}
				</fieldset>
			</div>
			<div className="mt-2 flex flex-wrap items-end gap-2">
				<Field label="Custom amount (USD)" htmlFor="donate-amount">
					<Input
						id="donate-amount"
						inputMode="decimal"
						placeholder="10"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						className="w-28"
					/>
				</Field>
				<Field label="Email (optional, for receipts)" htmlFor="donate-email">
					<Input
						id="donate-email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-52"
					/>
				</Field>
				<Button
					size="sm"
					disabled={busy}
					onClick={() => void donate()}
					className="mb-[1px]"
				>
					{busy
						? "Processing…"
						: `Donate${validAmount ? ` $${parsedAmount}` : ""}`}
				</Button>
				{pendingOrderRef ? (
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={() => void donate(pendingOrderRef)}
					>
						{busy ? "Checking…" : "Check again — I already paid"}
					</Button>
				) : null}
			</div>
		</section>
	);
}
