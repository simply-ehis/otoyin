import { CheckCircleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { Banner } from "@/ui/banner";
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

/**
 * Contact & support: ticket form with validation, success confirmation
 * showing the ticket id. Quick links to Discord / issues / docs.
 */
export function SupportPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [category, setCategory] = useState<SupportCategory>("feedback");
	const [message, setMessage] = useState("");
	const [ticketId, setTicketId] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const support = useSupportRequest();

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (message.trim().length < 5) {
			setFormError("Please add a few details to your message.");
			return;
		}
		setFormError(null);
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
		} catch (err: unknown) {
			showStudioErrorToast(err);
		}
	};

	return (
		<div className="mx-auto max-w-3xl">
			<ScreenHeader
				title="Contact & support"
				description="Reach the Otoyin team or browse help. We respond to every message."
			/>
			<div className="mb-6 mt-4 flex flex-wrap gap-2 text-sm">
				{[
					{ href: "https://discord.gg/otoyin", label: "Discord" },
					{ href: "https://github.com/otoyin/issues", label: "GitHub Issues" },
					{ href: "https://docs.otoyin.app", label: "Documentation" },
				].map((l) => (
					<a
						key={l.href}
						href={l.href}
						target="_blank"
						rel="noreferrer"
						className="rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-secondary"
					>
						{l.label}
					</a>
				))}
			</div>

			{ticketId ? (
				<div className="mb-4">
					<Banner
						tone="success"
						icon={<CheckCircleIcon className="size-4" aria-hidden="true" />}
					>
						Message received — ticket #{ticketId}. We will get back to you by email.
					</Banner>
				</div>
			) : null}

			<form onSubmit={submit} className="flex flex-col gap-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Name (optional)" htmlFor="support-name">
						<Input
							id="support-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							autoComplete="name"
						/>
					</Field>
					<Field label="Email (optional)" htmlFor="support-email">
						<Input
							id="support-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							autoComplete="email"
						/>
					</Field>
				</div>
				<Field label="Category" htmlFor="support-category">
					<Select
						value={category}
						onValueChange={(v) => setCategory(v as SupportCategory)}
					>
						<SelectTrigger id="support-category">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CATEGORIES.map((c) => (
								<SelectItem key={c.value} value={c.value}>
									{c.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field label="Message" htmlFor="support-message" error={formError ?? undefined}>
					<Textarea
						id="support-message"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						rows={5}
						placeholder="Tell us what is going on…"
					/>
				</Field>
				<div>
					<Button type="submit" disabled={support.isPending} loading={support.isPending}>
						<EnvelopeIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
						{support.isPending ? "Sending…" : "Send message"}
					</Button>
				</div>
			</form>
		</div>
	);
}
