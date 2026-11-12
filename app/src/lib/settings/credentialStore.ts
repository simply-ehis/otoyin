/**
 * Credential store bridge to Tauri.
 *
 * `credential_set` / `credential_get` / `credential_delete` are Rust commands
 * that read and write secrets in the OS credential store (Windows Credential
 * Manager, macOS Keychain, Linux Secret Service). Secrets are never written
 * to settings.json. When Tauri isn't available (tests, browser dev mode) the
 * calls degrade gracefully so the store still works with in-memory defaults.
 *
 * The JSON settings file only records `api_keys.<domain>.has_key` — the fact
 * that a key exists, never the key itself.
 */

import { invoke } from "@tauri-apps/api/core";

/** Store a credential in the OS credential store.
 * Returns false when the credential store fails — callers must NOT persist
 * `has_key=true` in that case, or the UI would claim a key is stored when it
 * is not. */
export async function setCredential(
	service: string,
	username: string,
	password: string,
): Promise<boolean> {
	try {
		await invoke("credential_set", { service, username, password });
		return true;
	} catch {
		// Not running under Tauri, or the store is locked/failed.
		return false;
	}
}

/** Read a credential from the OS credential store. Returns null without Tauri
 * or when no credential is stored. */
export async function getCredential(
	service: string,
	username: string,
): Promise<string | null> {
	try {
		const result = await invoke<string | null>("credential_get", {
			service,
			username,
		});
		return result ?? null;
	} catch {
		return null;
	}
}

/** Delete a credential from the OS credential store.
 * Returns false when the credential store fails. */
export async function deleteCredential(
	service: string,
	username: string,
): Promise<boolean> {
	try {
		await invoke("credential_delete", { service, username });
		return true;
	} catch {
		// Not running under Tauri — nothing was deleted.
		return false;
	}
}

/** Service name — all otoyin credentials live under this service. */
export const CREDENTIAL_SERVICE = "otoyin";
