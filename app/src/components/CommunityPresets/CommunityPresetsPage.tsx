import {
	MagnifyingGlassIcon as Search,
	BoltIcon as Zap,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { useEffectsStore } from "@/stores/effectsStore";

interface Preset {
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
	const [presets, setPresets] = useState<Preset[]>([]);
	const [categories, setCategories] = useState<string[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<string>("__all__");
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

	const loadCategories = useCallback(async () => {
		try {
			const data = await apiClient.listPresetCategories();
			setCategories(data);
		} catch (error) {
			showStudioErrorToast(error);
		}
	}, []);

	useEffect(() => {
		loadPresets();
		loadCategories();
	}, [loadCategories, loadPresets]);

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Community Presets</h1>
				<Badge variant="secondary">{presets.length} presets</Badge>
			</div>

			<div className="flex gap-4">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder="Search presets…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={selectedCategory} onValueChange={setSelectedCategory}>
					<SelectTrigger className="w-[150px]">
						<SelectValue placeholder="All Categories" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All Categories</SelectItem>
						{categories.map((cat) => (
							<SelectItem key={cat} value={cat}>
								{cat}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{loading ? (
				<div className="text-center py-12 text-muted-foreground">
					Loading presets…
				</div>
			) : presets.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">
					No presets found
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{presets.map((preset) => (
						<Card
							key={preset.id}
							className={preset.is_featured ? "border-primary" : ""}
						>
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between">
									<CardTitle className="text-lg">{preset.name}</CardTitle>
									{preset.is_featured && (
										<Zap className="size-4 text-primary" />
									)}
								</div>
								<p className="text-sm text-muted-foreground">
									{preset.description}
								</p>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex flex-wrap gap-1">
									{preset.tags.map((tag) => (
										<Badge key={tag} variant="secondary" className="text-xs">
											{tag}
										</Badge>
									))}
								</div>
								<Button
									size="sm"
									className="w-full"
									onClick={() => {
										setSelectedPresetId(preset.id);
										navigate({ to: "/workspace/effects" });
									}}
								>
									Apply Preset
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
