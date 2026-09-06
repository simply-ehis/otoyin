import { AgentMethods } from "./clientAgents";
import type {
	Announcement,
	Catalog,
	CatalogRefreshResult,
	EntitlementResponse,
	LicensesResponse,
	MarketplacePlugin,
	MarketplaceProduct,
	Offer,
	SupportRequestPayload,
	SupportResponse,
	WhatsNewEntry,
} from "./types";

/**
 * In-app content + marketplace endpoints (offline-first).
 * Catalog/licensing reuses backend/routes/marketplace.py.
 */
export class ContentMethods extends AgentMethods {
	async getWhatsNew(): Promise<WhatsNewEntry[]> {
		const data = await this.request<{ entries: WhatsNewEntry[] }>("/content/whats-new");
		return data.entries ?? [];
	}

	async getAnnouncements(): Promise<Announcement[]> {
		const data = await this.request<{ announcements: Announcement[] }>("/content/announcements");
		return data.announcements ?? [];
	}

	async getOffers(): Promise<Offer[]> {
		const data = await this.request<{ offers: Offer[] }>("/content/offers");
		return data.offers ?? [];
	}

	async postSupportRequest(
		payload: SupportRequestPayload,
	): Promise<SupportResponse> {
		return this.request<SupportResponse>("/support/request", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	async getCatalog(): Promise<Catalog> {
		return this.request<Catalog>("/marketplace/catalog");
	}

	/**
	 * Nudge a remote-catalog refresh; true when products changed. Pass
	 * force=true (manual "Check for updates") to bypass the 24h stale gate.
	 * reason !== null explains why nothing was swapped — "fresh" (gate
	 * skip), "no_url" (remote unconfigured), or "failed" (fetch/verify
	 * error the Store should surface).
	 */
	async refreshCatalog(force = false): Promise<CatalogRefreshResult> {
		const query = force ? "?force=true" : "";
		return this.request<CatalogRefreshResult>(
			`/marketplace/catalog/refresh${query}`,
			{ method: "POST" },
		);
	}

	async getMarketplaceOffers(): Promise<MarketplaceProduct[]> {
		const data = await this.request<{ offers: MarketplaceProduct[] }>(
			"/marketplace/offers",
		);
		return data.offers ?? [];
	}

	async getEntitlements(): Promise<EntitlementResponse> {
		return this.request<EntitlementResponse>("/marketplace/entitlements");
	}

	async getLicenses(): Promise<LicensesResponse> {
		return this.request<LicensesResponse>("/marketplace/licenses");
	}

	async installLicense(
		license: Record<string, unknown>,
	): Promise<{ ok: boolean }> {
		return this.request<{ ok: boolean }>("/marketplace/license", {
			method: "POST",
			body: JSON.stringify({ license }),
		});
	}

	// --- Marketplace extension plugins (safe install/lifecycle) ---

	async listMarketplacePlugins(): Promise<MarketplacePlugin[]> {
		return this.request<MarketplacePlugin[]>("/marketplace/plugins");
	}

	async installMarketplacePlugin(file: File): Promise<MarketplacePlugin> {
		const formData = new FormData();
		formData.append("file", file);
		return this.request<MarketplacePlugin>("/marketplace/plugins", {
			method: "POST",
			body: formData,
		});
	}

	async enableMarketplacePlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; enabled: boolean }> {
		return this.request<{ plugin_id: string; enabled: boolean }>(
			`/marketplace/plugins/${pluginId}/enable`,
			{ method: "POST" },
		);
	}

	async disableMarketplacePlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; enabled: boolean }> {
		return this.request<{ plugin_id: string; enabled: boolean }>(
			`/marketplace/plugins/${pluginId}/disable`,
			{ method: "POST" },
		);
	}

	async uninstallMarketplacePlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; uninstalled: boolean }> {
		return this.request<{ plugin_id: string; uninstalled: boolean }>(
			`/marketplace/plugins/${pluginId}`,
			{ method: "DELETE" },
		);
	}

	async approveExternalPlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; trust_external: boolean; enabled: boolean }> {
		return this.request<{
			plugin_id: string;
			trust_external: boolean;
			enabled: boolean;
		}>(`/marketplace/plugins/${pluginId}/approve-external`, { method: "POST" });
	}

	async launchExternalPlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; pid: number; status: string }> {
		return this.request<{ plugin_id: string; pid: number; status: string }>(
			`/marketplace/plugins/${pluginId}/launch-external`,
			{ method: "POST" },
		);
	}

	async stopPlugin(
		pluginId: string,
	): Promise<{ plugin_id: string; stopped: boolean }> {
		return this.request<{ plugin_id: string; stopped: boolean }>(
			`/marketplace/plugins/${pluginId}/stop`,
			{ method: "POST" },
		);
	}

	async pluginStatus(
		pluginId: string,
	): Promise<{ plugin_id: string; running: boolean; pid: number | null }> {
		return this.request<{ plugin_id: string; running: boolean; pid: number | null }>(
			`/marketplace/plugins/${pluginId}/status`,
		);
	}
}
