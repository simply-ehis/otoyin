import { DurableObject } from "cloudflare:workers";

interface Env {
	MARKETPLACE_CONTAINER: DurableObjectNamespace<MarketplaceContainer>;
	MARKETPLACE_DATABASE_URL: string;
	MARKETPLACE_LICENSE_PRIVATE_KEY: string;
	MARKETPLACE_LICENSE_PUBLIC_KEY?: string;
	MARKETPLACE_DODO_API_KEY?: string;
	MARKETPLACE_DODO_WEBHOOK_SECRET?: string;
	MARKETPLACE_DODO_SANDBOX?: string;
	MARKETPLACE_DODO_PRODUCT_MAP?: string;
	MARKETPLACE_ADMIN_KEY?: string;
	MARKETPLACE_ALLOWED_ORIGINS?: string;
}

const PORT = 8420;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const START_TIMEOUT_MS = 60 * 1000;

export class MarketplaceContainer extends DurableObject<Env> {
	private starting: Promise<void> | undefined;

	async fetch(request: Request): Promise<Response> {
		this.starting ??= this.startAndWait().finally(() => {
			this.starting = undefined;
		});
		await this.starting;

		const url = new URL(request.url);
		url.protocol = "http:";
		url.host = "container";
		const forwarded = new Request(url, request);
		forwarded.headers.delete("host");
		return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
	}

	private async startAndWait(): Promise<void> {
		const env = this.env;
		if (!env.MARKETPLACE_DATABASE_URL || !env.MARKETPLACE_LICENSE_PRIVATE_KEY) {
			throw new Error("Marketplace database and license signing secrets are required.");
		}

		const container = this.ctx.container!;
		await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
		if (!container.running) {
			await container.start({
				enableInternet: true,
				env: {
					MARKETPLACE_DATABASE_URL: env.MARKETPLACE_DATABASE_URL,
					MARKETPLACE_LICENSE_PRIVATE_KEY: env.MARKETPLACE_LICENSE_PRIVATE_KEY,
					MARKETPLACE_LICENSE_PUBLIC_KEY: env.MARKETPLACE_LICENSE_PUBLIC_KEY ?? "",
					MARKETPLACE_DODO_API_KEY: env.MARKETPLACE_DODO_API_KEY ?? "",
					MARKETPLACE_DODO_WEBHOOK_SECRET: env.MARKETPLACE_DODO_WEBHOOK_SECRET ?? "",
					MARKETPLACE_DODO_SANDBOX: env.MARKETPLACE_DODO_SANDBOX ?? "true",
					MARKETPLACE_DODO_PRODUCT_MAP: env.MARKETPLACE_DODO_PRODUCT_MAP ?? "{}",
					MARKETPLACE_ADMIN_KEY: env.MARKETPLACE_ADMIN_KEY ?? "",
					MARKETPLACE_ALLOWED_ORIGINS: env.MARKETPLACE_ALLOWED_ORIGINS ?? "[]",
					MARKETPLACE_DEBUG: "false",
				},
			});
		}

		const port = container.getTcpPort(PORT);
		const deadline = Date.now() + START_TIMEOUT_MS;
		let lastError: unknown;
		while (Date.now() < deadline) {
			try {
				const response = await port.fetch("http://container/health", {
					signal: AbortSignal.timeout(2_000),
				});
				await response.body?.cancel();
				if (response.ok) return;
				lastError = new Error(`Marketplace health check returned ${response.status}.`);
			} catch (error) {
				lastError = error;
			}
			await scheduler.wait(250);
		}
		throw new Error("Marketplace container did not become ready.", { cause: lastError });
	}
}

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return env.MARKETPLACE_CONTAINER.getByName("marketplace").fetch(request);
	},
};
