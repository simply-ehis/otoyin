// Shim: marketplace infra removed. Provide no-op helpers so existing
// store code keeps compiling and running in degraded mode.
export async function getLicenseDeviceId(): Promise<string> {
	return "local";
}
export async function getDeviceId(): Promise<string> {
	return "local";
}
export function openExternalUrl(url: string): void {
	window.open(url, "_blank", "noopener,noreferrer");
}
export const marketplaceClient = {
	fetchWishlist: async (_deviceId: string) => [] as string[],
	addWishlist: async (_id: string, _deviceId: string) => {},
	removeWishlist: async (_id: string, _deviceId: string) => {},
	fetchReviews: async (_productId: string) => [],
	postReview: async () => {},
	createCheckout: async () => ({ order_ref: "", checkout_url: "" }),
	pollForLicense: async () => ({ donated: false }),
	installLicense: async () => {},
	previewTax: async () => null,
	fetchPricePreview: async () => null,
	createDonation: async () => ({ order_ref: "", checkout_url: "" }),
};