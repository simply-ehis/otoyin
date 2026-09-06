import { BoltIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { useEffectsStore } from "@/stores/effectsStore";
import { Button } from "@/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/ui/card";
import { SearchInput } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";

interface CommunityPreset {
	id: string;
	name: string;
	description: string;
	author: string;
	category: string;
	tags: string[];
	effects_chain: Record<string, unknown>[];
	is_featured: boolean;
}

export function CommunityPresetsPage() {
	const navigate = useNavigate();
	const setSelectedPresetId = useEffectsStore((s) => s.setSelectedPresetId);
	const [presets, setPresets] = useState<CommunityPreset[]>([]);
	const [categories, setCategories] = useState<string[]>([]);
	const [selectedCategory, setSelectedCategory] = useState("__all__");
	const [searchQuery, setSearchQuery] = useState("");
	const [loading, setLoading] = useState(true);

	const loadPresets = useCallback(async () => {
		setLoading(true);
		try {
			const category =
				selectedCategory === "__all__" ? undefined : selectedCategory;
			const data = await apiClient.listCommunityPresets(
				category,
				searchQuery || undefined,
			);
			setPresets(data);
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setLoading(false);
		}
	}, [selectedCategory, searchQuery]);

	useEffect(() => {
		let cancelled = false;
		apiClient
			.listPresetCategories()
			.then((data) => {
				if (!cancelled) {
					setCategories(data);
				}
			})
			.catch((error: unknown) => showStudioErrorToast(error));
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		void loadPresets();
	}, [loadPresets]);

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Community Presets"
				description="Effect chains shared by the community"
				actions={
					<Badge tone="neutral">
						{presets.length} preset{presets.length === 1 ? "" : "s"}
					</Badge>
				}
			/>

			<div className="flex flex-wrap gap-2">
				<div className="relative min-w-52 flex-1">
					<MagnifyingGlassIcon
						aria-hidden="true"
						className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<SearchInput
						placeholder="Search presets…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 pl-9 text-xs"
						aria-label="Search presets"
					/>
				</div>
				<Select value={selectedCategory} onValueChange={setSelectedCategory}>
					<SelectTrigger
						className="h-8 w-40 text-xs"
						aria-label="Filter by category"
					>
						<SelectValue placeholder="All categories" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All categories</SelectItem>
						{categories.map((cat) => (
							<SelectItem key={cat} value={cat}>
								{cat}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{loading ? (
				<LoadingState label="Loading presets" />
			) : presets.length === 0 ? (
				<EmptyState
					title="No presets found"
					body="Try a different search or category."
				/>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{presets.map((preset) => (
						<Card
							key={preset.id}
							className={preset.is_featured ? "border-primary" : undefined}
						>
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between gap-2">
									<CardTitle className="text-lg">{preset.name}</CardTitle>
									{preset.is_featured ? (
										<BoltIcon
											className="size-4 shrink-0 text-primary"
											aria-label="Featured preset"
										/>
									) : null}
								</div>
								<p className="text-sm text-muted-foreground">
									{preset.description}
								</p>
								<p className="text-xs text-muted-foreground">
									by {preset.author} · {preset.category}
								</p>
							</CardHeader>
							<CardBody className="space-y-3">
								<div className="flex flex-wrap gap-1">
									{preset.tags.map((tag) => (
										<Badge key={tag} tone="neutral">
											{tag}
										</Badge>
									))}
								</div>
								<Button
									type="button"
									size="sm"
									className="w-full"
									onClick={() => {
										setSelectedPresetId(preset.id);
										void navigate({ to: "/workspace/effects" });
									}}
								>
									Apply Preset
								</Button>
							</CardBody>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
