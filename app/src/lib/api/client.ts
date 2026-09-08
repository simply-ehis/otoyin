/**
 * Main API client — chains all domain methods into a single instance.
 *
 * Chain: ClientInstrumentPackMethods → ClientLauncherMethods → SongwriterMethods
 *   → AudiobooksMethods → ApiClientLibrary → DiarizeMethods → DubbingMethods
 *     → ContentMethods → AgentMethods → HelpMethods → MemoryMethods
 *       → SpatialMethods → ADRMethods → StoriesBMethods → ... → ApiClientCore
 */
import { ClientInstrumentPackMethods } from "./clientInstrumentPacks";

export class ApiClient extends ClientInstrumentPackMethods {}

export const apiClient = new ApiClient();
