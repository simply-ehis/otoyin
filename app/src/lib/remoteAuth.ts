/**
 * Remote engine handshake (owner design).
 *
 * When the UI targets a non-loopback backend (`serverStore.mode === "remote"`),
 * the backend may be started with `--remote`, which binds 0.0.0.0 and demands
 * `Authorization: Bearer <token>` on every non-health request (see
 * backend/server.py — RemoteAuthMiddleware, mirror of `--remote`).
 *
 * The token is chosen by the operator who starts the engine — set the
 * `OTOYIN_REMOTE_TOKEN` environment variable on the remote engine, or copy
 * the one it prints at startup. It is never written to settings.json, never
 * kept in localStorage — it lives in the OS credential store only.
 *
 * Loopback mode needs no header (the middleware does not exist there); the
 * apiClient attaches the header automatically whenever a token is stored, so
 * split deployments work with zero per-call wiring in feature code.
 */

import {
	deleteCredential,
	getCredential,
	setCredential,
} from "@/lib/settings/credentialStore";

const SERVICE = "otoyin";
const USERNAME = "remote_backend_token";

let cache: string | null | undefined;

/** Read the remote token from the OS credential store (cached). */
export async function loadRemoteToken(): Promise<string | null> {
	if (cache === undefined) {
		cache = (await getCredential(SERVICE, USERNAME).catch(() => null)) ?? null;
	}
	return cache;
}

/** Drop the cached token so the next load re-reads the store. */
export function invalidateRemoteTokenCache(): void {
	cache = undefined;
}

/** Persist a token in the OS credential store. Returns false on failure. */
export async function saveRemoteToken(token: string): Promise<boolean> {
	const ok = await setCredential(SERVICE, USERNAME, token);
	if (ok) {
		cache = token;
	}
	return ok;
}

/** Remove the stored token. Returns false on failure. */
export async function clearRemoteToken(): Promise<boolean> {
	const ok = await deleteCredential(SERVICE, USERNAME);
	if (ok) {
		cache = null;
	}
	return ok;
}

/** Headers to merge into a backend call. Empty object when no token stored. */
export async function remoteAuthHeaders(): Promise<Record<string, string>> {
	const token = await loadRemoteToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}
