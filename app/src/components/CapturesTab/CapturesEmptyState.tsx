import { ChatBubbleBottomCenterTextIcon as Captions } from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChordKeys } from "./ChordKeys";

type ReadinessLike = {
	canRecord: boolean;
};

type Props = {
	capturesLoading: boolean;
	capturesCount: number;
	hotkeyEnabled: boolean;
	readiness: ReadinessLike;
	pushToTalkKeys: string[];
	toggleToTalkKeys: string[];
};

export function CapturesEmptyState({
	capturesLoading,
	capturesCount,
	hotkeyEnabled,
	readiness,
	pushToTalkKeys,
	toggleToTalkKeys,
}: Props) {
	const { t } = useTranslation();
	return (
		<div className="flex-1 flex items-center justify-center text-muted-foreground pt-20">
			{capturesLoading ? (
				<div className="text-center space-y-3">
					<Captions className="size-10 mx-auto opacity-40" />
					<p className="text-sm">{t("captures.empty.loading")}</p>
				</div>
			) : capturesCount ? (
				<div className="text-center space-y-3">
					<Captions className="size-10 mx-auto opacity-40" />
					<p className="text-sm">{t("captures.empty.pickOne")}</p>
				</div>
			) : hotkeyEnabled && !readiness.canRecord ? (
				<div className="max-w-sm mx-auto text-center space-y-3">
					<Captions className="size-10 mx-auto opacity-40" />
					<p className="text-sm">{t("captures.empty.none")}</p>
					<p className="text-xs text-muted-foreground leading-relaxed">
						{t("captures.empty.turnOnShortcut")}
					</p>
					<Button asChild variant="outline" size="sm">
						<Link to="/settings/captures">
							{t("captures.empty.openSettings")}
						</Link>
					</Button>
				</div>
			) : hotkeyEnabled &&
				(pushToTalkKeys.length || toggleToTalkKeys.length) ? (
				<div className="max-w-sm mx-auto text-center space-y-5">
					<div className="space-y-2">
						{pushToTalkKeys.length ? (
							<div className="flex items-center justify-center gap-3">
								<ChordKeys keys={pushToTalkKeys} />
								<span className="text-xs uppercase tracking-wider text-muted-foreground">
									{t("captures.empty.holdToRecord")}
								</span>
							</div>
						) : null}
						{toggleToTalkKeys.length ? (
							<div className="flex items-center justify-center gap-3">
								<ChordKeys keys={toggleToTalkKeys} />
								<span className="text-xs uppercase tracking-wider text-muted-foreground">
									{t("captures.empty.toggleHandsFree")}
								</span>
							</div>
						) : null}
					</div>
					<p className="text-sm">{t("captures.empty.pressShortcut")}</p>
				</div>
			) : (
				<div className="max-w-sm mx-auto text-center space-y-3">
					<Captions className="size-10 mx-auto opacity-40" />
					<p className="text-sm">{t("captures.empty.none")}</p>
					<p className="text-xs text-muted-foreground leading-relaxed">
						{t("captures.empty.turnOnShortcut")}
					</p>
					<Button asChild variant="outline" size="sm">
						<Link to="/settings/captures">
							{t("captures.empty.openSettings")}
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
