/**
 * Main API client — chains all domain methods into a single instance.
 *
 * Chain: ClientInstrumentPackMethods → ClientLauncherMethods → SongwriterMethods
 *   → AudiobooksMethods → ApiClientLibrary → DiarizeMethods → DubbingMethods
 *     → ContentMethods → AgentMethods → HelpMethods → MemoryMethods
 *       → SpatialMethods → ADRMethods → StoriesBMethods → ... → ApiClientCore
 */
import { ClientCloudMethods } from "./clientCloud";

export class ApiClient extends ClientCloudMethods {}

export const apiClient = new ApiClient();
