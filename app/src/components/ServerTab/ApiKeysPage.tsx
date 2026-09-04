import {
	CheckCircleIcon,
	KeyIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	type ModelProvider,
	modelProvidersClient,
} from "@/lib/api/clientProviders";
import { logger } from "@/lib/utils/debug";

const DOMAIN_LABELS: Record<string, string> = {
	llm: "LLM (Chat/Assistant)",
	tts: "TTS (Text-to-Speech)",
	stt: "STT (Speech-to-Text)",
	sfx: "SFX (Sounds/Freesound)",
	music: "Music Generation",
	vc: "Voice Conversion",
};

const DOMAIN_ORDER = ["llm", "stt", "tts", "sfx", "music", "vc"];

export function ApiKeysPage() {
	const [providers, setProviders] = useState<ModelProvider[]>([]);
	const [loading, setLoading] = useState(true);
	const [addingDomain, setAddingDomain] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<ModelProvider | null>(null);
	const [form, setForm] = useState({
		name: "",
		base_url: "",
		api_key: "",
		model: "",
	});

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setProviders(await modelProvidersClient.list());
		} catch (e: unknown) {
			logger.debug("[apikeys] list providers failed", e);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const handleCreate = async (domain: string) => {
		if (!form.base_url) {
			return;
		}
		try {
			await modelProvidersClient.create({
				domain,
				name: form.name,
				base_url: form.base_url,
				api_key: form.api_key || undefined,
				model: form.model || undefined,
			});
			setAddingDomain(null);
			setForm({ name: "", base_url: "", api_key: "", model: "" });
			await load();
		} catch (e) {
			console.error("Failed to create provider:", e);
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await modelProvidersClient.delete(id);
			await load();
		} catch (e) {
			console.error("Failed to delete provider:", e);
		}
	};

	const handleSetDefault = async (id: string, _domain: string) => {
		try {
			await modelProvidersClient.update(id, { is_default: true });
			await load();
		} catch (e) {
			console.error("Failed to set default:", e);
		}
	};

	const grouped = DOMAIN_ORDER.map((d) => ({
		domain: d,
		label: DOMAIN_LABELS[d] || d,
		providers: providers.filter((p) => p.domain === d),
	}));

	return (
		<div className="space-y-8 max-w-2xl">
			<div>
				<h2 className="text-lg font-semibold text-foreground mb-1">API Keys</h2>
				<p className="text-sm text-muted-foreground">
					Manage API keys for cloud providers. Keys are encrypted at rest.
					Stored keys are used automatically across the app.
				</p>
			</div>

			{loading ? (
				<div className="text-muted-foreground text-sm py-4">Loading�</div>
			) : (
				<div className="space-y-6">
					{grouped.map(({ domain, label, providers: items }) => (
						<div key={domain} className="border border-border rounded-lg p-4">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-medium text-foreground">{label}</h3>
								<button
									type="button"
									onClick={() =>
										setAddingDomain(addingDomain === domain ? null : domain)
									}
									className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
									title="Add"
								>
									<PlusIcon className="h-3.5 w-3.5" />
									Add
								</button>
							</div>

							{items.length === 0 && addingDomain !== domain && (
								<div className="text-xs text-muted-foreground/60">
									No keys configured for this category.
								</div>
							)}

							{items.map((p) => (
								<div
									key={p.id}
									className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30 mb-2"
								>
									<KeyIcon className="size-4 text-muted-foreground shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium truncate">
												{p.name}
											</span>
											{p.is_default && (
												<span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
													default
												</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground/60 truncate">
											{p.base_url}
											{p.has_api_key && (
												<span className="ml-2 text-green-500/80">key set</span>
											)}
										</div>
									</div>
									<div className="flex items-center gap-1 shrink-0">
										{!p.is_default && (
											<button
												type="button"
												onClick={() => handleSetDefault(p.id, p.domain)}
												className="p-1 text-muted-foreground hover:text-foreground"
												title="Set as default"
											>
												<CheckCircleIcon className="size-4" />
											</button>
										)}
										<button
											type="button"
											onClick={() => setDeleteTarget(p)}
											className="p-1 text-destructive/60 hover:text-destructive"
											title="Delete"
										>
											<TrashIcon className="size-4" />
										</button>
									</div>
								</div>
							))}

							{addingDomain === domain && (
								<div className="mt-3 p-3 rounded-md border border-border bg-muted/20 space-y-3">
									<input
										value={form.name}
										onChange={(e) =>
											setForm((prev) => ({ ...prev, name: e.target.value }))
										}
										placeholder="Name (e.g. OpenAI, Groq)"
										className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/50"
									/>
									<input
										value={form.base_url}
										onChange={(e) =>
											setForm((prev) => ({ ...prev, base_url: e.target.value }))
										}
										placeholder="Base URL (e.g. https://api.openai.com/v1)"
										className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/50"
									/>
									<input
										value={form.api_key}
										onChange={(e) =>
											setForm((prev) => ({ ...prev, api_key: e.target.value }))
										}
										placeholder="API Key"
										type="password"
										className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/50"
									/>
									<input
										value={form.model}
										onChange={(e) =>
											setForm((prev) => ({ ...prev, model: e.target.value }))
										}
										placeholder="Model ID (optional)"
										className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/50"
									/>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => handleCreate(domain)}
											className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => {
												setAddingDomain(null);
												setForm({
													name: "",
													base_url: "",
													api_key: "",
													model: "",
												});
											}}
											className="px-3 py-1.5 text-sm rounded text-muted-foreground hover:text-foreground"
										>
											Cancel
										</button>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete provider?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the {deleteTarget?.name} provider and its stored
							API key. Any models configured with this provider will stop
							working.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (deleteTarget) {
									handleDelete(deleteTarget.id);
									setDeleteTarget(null);
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
