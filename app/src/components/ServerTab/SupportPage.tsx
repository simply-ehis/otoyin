import { CheckCircleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import type { SupportCategory } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { useSupportRequest } from "@/lib/hooks/useContent";

const CATEGORIES: { value: SupportCategory; label: string }[] = [
	{ value: "bug", label: "Bug report" },
	{ value: "feature", label: "Feature request" },
	{ value: "billing", label: "Billing / license" },
	{ value: "account", label: "Account" },
	{ value: "feedback", label: "Feedback" },
	{ value: "other", label: "Other" },
];

export function SupportPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [category, setCategory] = useState<SupportCategory>("feedback");
	const [message, setMessage] = useState("");
	const [ticketId, setTicketId] = useState<string | null>(null);
	const support = useSupportRequest();

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (message.trim().length < 5) {
			showStudioErrorToast(
				new Error("Please add a few details to your message."),
			);
			return;
		}
		try {
			const res = await support.mutateAsync({
				name: name || undefined,
				email: email || undefined,
				category,
				message: message.trim(),
			});
			setTicketId(res.id);
			setMessage("");
			setName("");
			setEmail("");
		} catch (err) {
			showStudioErrorToast(err);
		}
	};

	return (
		<div className="mx-auto max-w-3xl py-6">
			<header className="mb-5">
				<h1 className="flex items-center gap-2 text-xl font-semibold">
					<EnvelopeIcon className="size-5" /> Contact & Support
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Reach the Otoyin team or browse help. We respond to every message.
				</p>
			</header>

			<div className="mb-6 flex flex-wrap gap-2 text-sm">
				<a
					href="https://discord.gg/Otoyin"
					target="_blank"
					rel="noreferrer"
					className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/40"
				>
					Discord
				</a>
				<a
					href="https://github.com/Otoyin/issues"
					target="_blank"
					rel="noreferrer"
					className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/40"
				>
					GitHub Issues
				</a>
				<a
					href="https://docs.Otoyin.app"
					target="_blank"
					rel="noreferrer"
					className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/40"
				>
					Documentation
				</a>
			</div>

			{ticketId && (
				<div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
					<CheckCircleIcon className="size-5" />
					Message received — ticket #{ticketId}. We'll get back to you by email.
				</div>
			)}

			<form onSubmit={submit} className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label className="block text-sm">
						<span className="text-muted-foreground">Name (optional)</span>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
							placeholder="Your name"
						/>
					</label>
					<label className="block text-sm">
						<span className="text-muted-foreground">Email (optional)</span>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
							placeholder="you@example.com"
						/>
					</label>
				</div>

				<label className="block text-sm">
					<span className="text-muted-foreground">Category</span>
					<select
						value={category}
						onChange={(e) => setCategory(e.target.value as SupportCategory)}
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
					>
						{CATEGORIES.map((c) => (
							<option key={c.value} value={c.value}>
								{c.label}
							</option>
						))}
					</select>
				</label>

				<label className="block text-sm">
					<span className="text-muted-foreground">Message</span>
					<textarea
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						rows={5}
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
						placeholder="Tell us what's going on…"
					/>
				</label>

				<Button
					type="submit"
					disabled={support.isPending}
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
				>
					{support.isPending ? <Spinner size="sm" className="mr-1" /> : null}
					{support.isPending ? "Sending…" : "Send message"}
				</Button>
			</form>
		</div>
	);
}
