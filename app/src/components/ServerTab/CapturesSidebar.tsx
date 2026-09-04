import {
	InformationCircleIcon as Info,
	ComputerDesktopIcon as Laptop,
	LockClosedIcon as Lock,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { DictationReadinessChecklist } from "@/components/CapturesTab/DictationReadinessChecklist";
import { useDictationReadiness } from "@/lib/hooks/useDictationReadiness";

const isWindows =
	typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

export function CapturesSidebar() {
	const { t } = useTranslation();
	const readiness = useDictationReadiness();

	return (
		<aside className="hidden lg:block w-[280px] shrink-0 space-y-6 sticky top-0">
			<div className="space-y-2">
				<h3 className="text-sm font-semibold">
					{t("settings.captures.sidebar.aboutTitle")}
				</h3>
				<p className="text-sm text-muted-foreground leading-relaxed">
					{t("settings.captures.sidebar.aboutBody")}
				</p>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-semibold">
					{t("settings.captures.sidebar.differencesTitle")}
				</h3>
				<ul className="space-y-3 text-sm text-muted-foreground">
					<li className="flex gap-3">
						<Lock className="size-4 shrink-0 mt-0.5 text-accent" />
						<span className="leading-relaxed">
							<span className="text-foreground font-medium">
								{t("settings.captures.sidebar.local.title")}
							</span>{" "}
							{t("settings.captures.sidebar.local.body")}
						</span>
					</li>
					<li className="flex gap-3">
						<Volume2 className="size-4 shrink-0 mt-0.5 text-accent" />
						<span className="leading-relaxed">
							<span className="text-foreground font-medium">
								{t("settings.captures.sidebar.playAs.title")}
							</span>{" "}
							{t("settings.captures.sidebar.playAs.body")}
						</span>
					</li>
					<li className="flex gap-3">
						<Laptop className="size-4 shrink-0 mt-0.5 text-accent" />
						<span className="leading-relaxed">
							<span className="text-foreground font-medium">
								{t("settings.captures.sidebar.crossPlatform.title")}
							</span>{" "}
							{t("settings.captures.sidebar.crossPlatform.body")}
						</span>
					</li>
				</ul>
				{isWindows && (
					<div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-3">
						<div className="flex items-start gap-3">
							<Info className="size-4 shrink-0 mt-0.5 text-accent" />
							<div className="flex-1 min-w-0 space-y-0.5">
								<p className="text-sm font-medium text-foreground">
									{t("settings.captures.sidebar.windowsCaveat.title")}
								</p>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{t("settings.captures.sidebar.windowsCaveat.body")}
								</p>
							</div>
						</div>
					</div>
				)}
			</div>

			{!readiness.allReady && (
				<div className="space-y-2">
					<h3 className="text-sm font-semibold">
						{t("captures.readiness.title")}
					</h3>
					<DictationReadinessChecklist readiness={readiness} compact />
				</div>
			)}
		</aside>
	);
}
