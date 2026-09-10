import {
	CheckCircleIcon,
	KeyIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import {
	type ModelProvider,
	modelProvidersClient,
} from "@/lib/api/clientProviders";
import { showStudioErrorToast } from "@/lib/errors";
import { logger } from "@/lib/utils/debug";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";

const DOMAIN_LABELS: Record<string, string> = {
	llm: "LLM (Chat/Assistant)",
	tts: "TTS (Text-to-Speech)",
	stt: "STT (Speech-to-Text)",
	sfx: "SFX (Sounds/Freesound)",
	music: "Music Generation",
	vc: "Voice Conversion",
};

const DOMAIN_ORDER = ["llm", "stt", "tts", "sfx", "music", "vc"];

const EMPTY_FORM = { name: "", base_url: "", api_key: "", model: "" };

/**
 * BYOK provider keys per domain. Keys are encrypted at rest server-side
 * and used automatically across the app. Deletion confirms first.
 */
export function ApiKeysPage() {
	const [providers, setProviders] = useState<ModelProvider[]>([]);
	const [loading, setLoading] = useState(true);
	const [addingDomain, setAddingDomain] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<ModelProvider | null>(null);
	const [form, setForm] = useState(EMPTY_FORM);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setProviders(await modelProvidersClient.list());
		} catch (e: unknown) {
			logger.debug("[apikeys] list providers failed", e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const create = async (domain: string) => {
		if (!form.base_url.trim()) {
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
			setForm(EMPTY_FORM);
			await load();
		} catch (e: unknown) {
			showStudioErrorToast(e);
		}
	};

	const remove = async (id: string) => {
		try {
			await modelProvidersClient.delete(id);
			await load();
		} catch (e: unknown) {
			showStudioErrorToast(e);
		}
	};

	const setDefault = async (id: string) => {
		try {
			await modelProvidersClient.update(id, { is_default: true });
			await load();
		} catch (e: unknown) {
			showStudioErrorToast(e);
		}
	};

	const grouped = DOMAIN_ORDER.map((d) => ({
		domain: d,
		label: DOMAIN_LABELS[d] ?? d,
		providers: providers.filter((p) => p.domain === d),
	}));

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<ScreenHeader
				title="API keys"
			/>
			{loading ? (
				<LoadingState label="Loading providers" lines={4} />
			) : (
				<div className="flex flex-col gap-4">
					{grouped.map(({ domain, label, providers: items }) => (
						<section
							key={domain}
							className="rounded-md border border-border p-4"
						>
							<div className="mb-2 flex items-center justify-between">
								<h3 className="text-sm font-medium text-foreground">{label}</h3>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setAddingDomain(addingDomain === domain ? null : domain)
									}
								>
									<PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
									Add
								</Button>
							</div>

							{items.length === 0 && addingDomain !== domain ? (
								<p className="text-xs text-muted-foreground/70">
									No keys configured for this category.
								</p>
							) : null}

							{items.map((p) => (
								<div
									key={p.id}
									className="mb-2 flex items-center gap-3 rounded-sm bg-secondary px-3 py-2"
								>
									<KeyIcon
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
											{p.name}
											{p.is_default ? (
												<Badge tone="accent">default</Badge>
											) : null}
										</p>
										<p className="truncate text-xs text-muted-foreground/70">
											{p.base_url}
											{p.has_api_key ? (
												<span className="ml-2 text-success">key set</span>
											) : null}
										</p>
									</div>
									<span className="flex shrink-0 items-center gap-1">
										{!p.is_default ? (
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => setDefault(p.id)}
												title="Set as default"
												aria-label={`Set ${p.name} as default`}
											>
												<CheckCircleIcon
													className="size-4"
													aria-hidden="true"
												/>
											</Button>
										) : null}
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => setDeleteTarget(p)}
											title="Delete"
											aria-label={`Delete ${p.name}`}
											className="text-destructive/70 hover:text-destructive"
										>
											<TrashIcon className="size-4" aria-hidden="true" />
										</Button>
									</span>
								</div>
							))}

							{addingDomain === domain ? (
								<div className="mt-2 flex flex-col gap-3 rounded-sm border border-border bg-sunken p-3">
									<Field label="Name" htmlFor={`prov-name-${domain}`}>
										<Input
											id={`prov-name-${domain}`}
											value={form.name}
											onChange={(e) =>
												setForm((f) => ({ ...f, name: e.target.value }))
											}
											placeholder="Name (e.g. OpenAI, Groq)"
										/>
									</Field>
									<Field label="Base URL" htmlFor={`prov-url-${domain}`}>
										<Input
											id={`prov-url-${domain}`}
											value={form.base_url}
											onChange={(e) =>
												setForm((f) => ({ ...f, base_url: e.target.value }))
											}
											placeholder="Base URL (e.g. https://api.openai.com/v1)"
											inputMode="url"
										/>
									</Field>
									<Field label="API key" htmlFor={`prov-key-${domain}`}>
										<Input
											id={`prov-key-${domain}`}
											type="password"
											value={form.api_key}
											onChange={(e) =>
												setForm((f) => ({ ...f, api_key: e.target.value }))
											}
											placeholder="API key"
											autoComplete="off"
										/>
									</Field>
									<Field
										label="Model ID (optional)"
										htmlFor={`prov-model-${domain}`}
									>
										<Input
											id={`prov-model-${domain}`}
											value={form.model}
											onChange={(e) =>
												setForm((f) => ({ ...f, model: e.target.value }))
											}
											placeholder="Model ID (optional)"
										/>
									</Field>
									<div className="flex gap-2">
										<Button
											size="sm"
											onClick={() => create(domain)}
											disabled={!form.base_url.trim()}
										>
											Save
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setAddingDomain(null);
												setForm(EMPTY_FORM);
											}}
										>
											Cancel
										</Button>
									</div>
								</div>
							) : null}
						</section>
					))}
					{providers.length === 0 ? (
						<EmptyState
							icon={<KeyIcon aria-hidden="true" />}
							title="No providers yet"
							body="Add a key per domain above to use cloud models alongside local ones."
						/>
					) : null}
				</div>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogTitle>Delete provider?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the {deleteTarget?.name} provider and its stored API
						key. Models configured with this provider will stop working.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) {
									void remove(deleteTarget.id);
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
