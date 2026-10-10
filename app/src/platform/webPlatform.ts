import type { Platform } from "./types";

const noopAsync = async () => {};
const noop = () => {};

export const webPlatform: Platform = {
	filesystem: {
		saveFile: async (filename, blob) => {
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		},
		openPath: noopAsync,
		getLogsDir: async () => "",
		pickDirectory: async () => null,
	},
	updater: {
		checkForUpdates: noopAsync,
		downloadAndInstall: noopAsync,
		restartAndInstall: noopAsync,
		getStatus: () => ({
			checking: false,
			available: false,
			downloading: false,
			installing: false,
			readyToInstall: false,
		}),
		subscribe: () => () => {},
	},
	audio: {
		isSystemAudioSupported: async () => false,
		startSystemAudioCapture: async () => {},
		stopSystemAudioCapture: async () => new Blob(),
		listOutputDevices: async () => [],
		playToDevices: async () => {},
		stopPlayback: noop,
	},
	lifecycle: {
		startServer: async () => "",
		stopServer: noopAsync,
		restartServer: async () => "",
		setupWindowCloseHandler: noopAsync,
		subscribeToServerLogs: () => () => {},
		subscribeToServerErrors: () => () => {},
	},
	metadata: {
		getVersion: async () => "0.5.0-web",
		isTauri: false,
	},
};
