import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { showStudioErrorToast } from "@/lib/errors";
import {
	clearRemoteToken,
	loadRemoteToken,
	saveRemoteToken,
} from "@/lib/remoteAuth";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useToast } from "@/ui/use-toast";
import { SettingRow } from "./rows";

/**
 * "Remote token" row shown on the General settings page when network access
 * is in remote mode. The token is what an engine started with `--remote`
 * (or `OTOYIN_REMOTE_TOKEN`) expects as `Authorization: Bearer …` on every
 * non-health request — see backend/server.py RemoteAuthMiddleware and
 * app/src/lib/remoteAuth.ts for the full handshake.
 *
 * The token lives only in the OS credential store (username
 * `remote_backend_token`, service `otoyin`) — never in settings.json, never
 * in localStorage.
 */
export function RemoteEngineToken() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const [draft, setDraft] = useState("");
	const [hasToken, setHasToken] = useState<boolean | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		void loadRemoteToken().then((token) => setHasToken(Boolean(token)));
	}, []);

	const save = async () => {
		const trimmed = draft.trim();
		if (!trimmed || saving) {
			return;
		}
		setSaving(true);
		const ok = await saveRemoteToken(trimmed);
		setSaving(false);
		if (ok) {
			setDraft("");
			setHasToken(true);
			toast({
				title: t(
					"settings.general.remoteToken.savedTitle",
					"Remote token saved",
				),
				description: t(
					"settings.general.remoteToken.savedBody",
					"Sent as the Authorization header to the remote engine.",
				),
			});
		} else {
			showStudioErrorToast(
				new Error("Could not save the token to the OS credential store"),
			);
		}
	};

	const clear = async () => {
		const ok = await clearRemoteToken();
		if (ok) {
			setHasToken(false);
			toast({
				title: t(
					"settings.general.remoteToken.clearedTitle",
					"Remote token cleared",
				),
				description: t(
					"settings.general.remoteToken.clearedBody",
					"The remote engine will ask for it again on every request.",
				),
			});
		}
	};

	return (
		<SettingRow
			htmlFor="remote-engine-token"
			title={t("settings.general.remoteToken.title", "Remote token")}
			description={t(
				"settings.general.remoteToken.description",
				"The token to reach an engine started with --remote / OTOYIN_REMOTE_TOKEN. Stored in the OS credential store, never in settings.json.",
			)}
		>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<Input
					id="remote-engine-token"
					type="password"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder={
						hasToken
							? t(
									"settings.general.remoteToken.placeholderStored",
									"Stored — paste to replace",
								)
							: t(
									"settings.general.remoteToken.placeholderEmpty",
									"Paste the token from the engine console",
								)
					}
					className="max-w-xs"
					autoComplete="off"
				/>
				<Button
					size="sm"
					onClick={() => void save()}
					disabled={saving || !draft.trim()}
				>
					{t("settings.general.remoteToken.save", "Save")}
				</Button>
				{hasToken ? (
					<Button size="sm" variant="outline" onClick={() => void clear()}>
						{t("settings.general.remoteToken.clear", "Clear")}
					</Button>
				) : null}
			</div>
		</SettingRow>
	);
}
