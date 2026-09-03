"use client";

import { MessageSquare, Mic, Music, Puzzle, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

interface CategoryGridProps {
	categories: Array<{
		id: string;
		name: string;
		description: string;
		icon: React.ReactNode;
		count: number;
		href: string;
	}>;
}

export function CategoryGrid({ categories }: CategoryGridProps) {
	return (
		<section className="py-16 lg:py-24">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="text-center mb-12">
					<h2 className="text-3xl font-bold tracking-tight mb-4">
						Explore by Category
					</h2>
					<p className="text-muted-foreground text-lg max-w-2xl mx-auto">
						Find the perfect model for your use case — from voice synthesis to
						music generation
					</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
					{categories.map((category) => (
						<Link
							key={category.id}
							href={category.href}
							className="group relative p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden"
						>
							<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
							<div className="relative z-10">
								<div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors mb-4">
									{category.icon}
								</div>
								<h3 className="font-semibold text-lg text-foreground mb-1">
									{category.name}
								</h3>
								<p className="text-sm text-muted-foreground mb-3 line-clamp-2">
									{category.description}
								</p>
								<div className="flex items-center justify-between pt-4 border-t border-border/50">
									<span className="text-sm text-muted-foreground">
										{category.count} models
									</span>
									<span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
										Explore
										<svg
											aria-hidden="true"
											className="h-4 w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 5l7 7-7 7"
											/>
										</svg>
									</span>
								</div>
							</div>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}

export const DEFAULT_CATEGORIES = [
	{
		id: "tts",
		name: "Voice Synthesis",
		description:
			"Text-to-speech engines for narration, dialogue, and voiceovers",
		icon: <Mic className="h-6 w-6" />,
		count: 15,
		href: "/catalog?category=tts",
	},
	{
		id: "music",
		name: "Music & SFX",
		description: "Generate music, sound effects, and audio from text prompts",
		icon: <Music className="h-6 w-6" />,
		count: 8,
		href: "/catalog?category=music",
	},
	{
		id: "stt",
		name: "Transcription",
		description: "Speech-to-text for captions, meetings, and voice notes",
		icon: <MessageSquare className="h-6 w-6" />,
		count: 8,
		href: "/catalog?category=stt",
	},
	{
		id: "llm",
		name: "LLM Planners",
		description: "Local language models for assistants, coding, and reasoning",
		icon: <Sparkles className="h-6 w-6" />,
		count: 6,
		href: "/catalog?category=llm",
	},
	{
		id: "vc",
		name: "Voice Conversion",
		description: "Transform voices while preserving content and emotion",
		icon: <Zap className="h-6 w-6" />,
		count: 5,
		href: "/catalog?category=vc",
	},
	{
		id: "translation",
		name: "Translation",
		description: "Offline translation packs for dubbing and text translation",
		icon: <MessageSquare className="h-6 w-6" />,
		count: 15,
		href: "/catalog?category=translation",
	},
	{
		id: "extras",
		name: "Extras & Tools",
		description: "Stem separation, spatial audio, and audio enhancement tools",
		icon: <Puzzle className="h-6 w-6" />,
		count: 4,
		href: "/catalog?category=extras",
	},
];
