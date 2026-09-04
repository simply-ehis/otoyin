import { ChatBubbleBottomCenterTextIcon } from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/states";
import { ChordKeys } from "./shared";

/**
 * Captures empty states: loading, pick-one, shortcut-off (with settings
 * link), and press-shortcut guidance with rendered chord caps.
 */
export function CapturesEmptyState({
	loading,
	count,
	hotkeyEnabled,
	canRecord,
	pushKeys,
	toggleKeys,
}: {
	loading: boolean;
	count: number;
	hotkeyEnabled: boolean;
	canRecord: boolean;
	pushKeys: string[];
	toggleKeys: string[];
}) {
	const { t } = useTranslation();
	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center pt-20 text-muted-foreground">
				<p className="text-sm">{t("captures.empty.loading")}</p>
			</div>
		);
	}
	if (count > 0) {
		return (
			<div className="flex flex-1 items-center justify-center pt-20 text-muted-foreground">
				<p className="text-sm">{t("captures.empty.pickOne")}</p>
			</div>
		);
	}
	if (!hotkeyEnabled || !canRecord) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<EmptyState
					icon={<ChatBubbleBottomCenterTextIcon aria-hidden="true" />}
					title={t("captures.empty.none")}
					body={t("captures.empty.turnOnShortcut")}
					action={
						<Button asChild variant="outline" size="sm">
							<Link to="/settings/captures">{t("captures.empty.openSettings")}</Link>
						</Button>
					}
				/>
			</div>
		);
	}
	if (pushKeys.length > 0 || toggleKeys.length > 0) {
		return (
			<div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-5">
				<div className="flex flex-col gap-2">
					{pushKeys.length > 0 ? (
						<p className="flex items-center justify-center gap-3">
							<ChordKeys keys={pushKeys} />
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								{t("captures.empty.holdToRecord")}
							</span>
						</p>
					) : null}
					{toggleKeys.length > 0 ? (
						<p className="flex items-center justify-center gap-3">
							<ChordKeys keys={toggleKeys} />
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								{t("captures.empty.toggleHandsFree")}
							</span>
						</p>
					) : null}
				</div>
				<p className="text-sm text-muted-foreground">{t("captures.empty.pressShortcut")}</p>
			</div>
		);
	}
	return (
		<div className="flex flex-1 items-center justify-center">
			<EmptyState
				icon={<ChatBubbleBottomCenterTextIcon aria-hidden="true" />}
				title={t("captures.empty.none")}
				body={t("captures.empty.turnOnShortcut")}
				action={
					<Button asChild variant="outline" size="sm">
						<Link to="/settings/captures">{t("captures.empty.openSettings")}</Link>
					</Button>
				}
			/>
		</div>
	);
}
