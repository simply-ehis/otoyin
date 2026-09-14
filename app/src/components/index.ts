/**
 * Intentional public barrel (verified 2026-09-11: no `@/components` deep
 * imports exist yet, but external tooling/docs reference these names).
 * Keep — do not delete as "dead code".
 */
export { AudioStudio } from "../features/audioStudio/AudioStudio";
export { CommunityPresetsPage } from "../features/content/CommunityPresetsPage";
export { StandaloneProjectPage } from "../features/content/StandaloneProjectPage";
export { LottieExportPage } from "../features/settings/LottieExportPage";
export { PluginsPage } from "../features/settings/PluginsPage";
export { ScriptingPage } from "../features/settings/ScriptingPage";
export { ShortcutsPage } from "../features/settings/ShortcutsPage";
export { TelemetryPage } from "../features/settings/TelemetryPage";
export { TimecodeDisplay } from "../features/settings/TimecodePage";
export { SpectrogramView } from "../features/workspace/SpectrogramView";
export { ABComparison } from "./ABComparison/ABComparison";
export { AudioBars } from "./AudioBars/AudioBars";
export { ImportModal } from "./Import/ImportModal";
export {
	ListPane,
	ListPaneActions,
	ListPaneHeader,
	ListPaneScroll,
	ListPaneSearch,
	ListPaneTitle,
	ListPaneTitleRow,
} from "./ListPane/ListPane";
export { Sidebar } from "./Sidebar/Sidebar";
export { TapeScrubber } from "./TapeScrubber/TapeScrubber";
export { WaveformVisualizer } from "./WaveformVisualizer/WaveformVisualizer";
