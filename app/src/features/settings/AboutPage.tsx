import {
	ArrowUpRightIcon,
	GlobeAltIcon,
	LifebuoyIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import OtoyinLogo from "@/assets/Otoyin-logo.svg";
import { SPONSORS } from "@/lib/sponsors";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";

/**
 * About: brand mark, version, tagline, repo/support links, license.
 * Entrance is a short staggered rise (transform + opacity only).
 */
export function AboutPage() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const [version, setVersion] = useState("");

	useEffect(() => {
		platform.metadata
			.getVersion()
			.then(setVersion)
			.catch((err: unknown) => {
				debug.warn("[server] get version failed:", err);
				setVersion("");
			});
	}, [platform]);

	return (
		<div className="mx-auto flex h-full max-w-md items-center">
			<div className="flex flex-col items-center gap-5 text-center">
				<img
					src={OtoyinLogo}
					alt="Otoyin"
					className="animate-logo-breath size-20 object-contain"
				/>
				<div className="flex flex-col gap-1.5">
					<h1 className="text-lg font-semibold tracking-tight text-foreground">
						Otoyin
					</h1>
					<p
						className="h-4 text-xs text-muted-foreground/70"
						aria-live="polite"
					>
						{version ? `v${version}` : " "}
					</p>
				</div>
				<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
					{t("settings.about.tagline")}
				</p>
				<div className="flex flex-wrap justify-center gap-3 pt-2">
					<a
						href="https://github.com/simply-ehis/otoyin"
						target="_blank"
						rel="noopener noreferrer"
						className="group inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
					>
						<svg
							className="size-4 text-muted-foreground"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
						</svg>
						{t("settings.about.repo")}
						<ArrowUpRightIcon
							className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
							aria-hidden="true"
						/>
					</a>
					<a
						href="https://github.com/simply-ehis/otoyin/issues"
						target="_blank"
						rel="noopener noreferrer"
						className="group inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
					>
						<LifebuoyIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						{t("settings.about.support")}
						<ArrowUpRightIcon
							className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
							aria-hidden="true"
						/>
					</a>
				</div>
				<p className="inline-flex cursor-default items-center gap-2 text-xs text-muted-foreground/50">
					<GlobeAltIcon className="h-3.5 w-3.5" aria-hidden="true" />
					{t("settings.about.website")} · {t("settings.about.comingSoon")}
				</p>
				{SPONSORS.length > 0 ? (
					<div className="flex flex-col items-center gap-3 pt-4">
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
							Sponsored by
						</p>
						<div className="flex flex-wrap items-center justify-center gap-3">
							{SPONSORS.map((sponsor) => (
								<a
									key={sponsor.name}
									href={sponsor.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={sponsor.name}
									className="group flex h-12 min-w-[120px] items-center justify-center rounded-md border border-border bg-card px-4 transition-colors hover:bg-secondary"
								>
									<img
										src={sponsor.logoSrc}
										alt={sponsor.logoAlt ?? sponsor.name}
										className="h-5 w-auto max-w-[100px] object-contain opacity-80 transition-opacity group-hover:opacity-100"
									/>
								</a>
							))}
						</div>
					</div>
				) : null}
				<p className="pt-4 text-xs text-muted-foreground/50">
					<Trans
						i18nKey="settings.about.license"
						components={{
							link: (
								<a
									href="https://github.com/simply-ehis/otoyin/blob/main/LICENSE"
									target="_blank"
									rel="noopener noreferrer"
									className="transition-colors hover:text-muted-foreground"
								>
									LICENSE
								</a>
							),
						}}
					/>
				</p>
			</div>
		</div>
	);
}
