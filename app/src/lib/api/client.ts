/**
 * Main API client — chains all domain methods into a single instance.
 *
 * Chain: ClientInstrumentPackMethods → ClientLauncherMethods → SongwriterMethods
 *   → AudiobooksMethods → ApiClientLibrary → DiarizeMethods → DubbingMethods
 *     → ContentMethods → AgentMethods → HelpMethods → MemoryMethods
 *       → SpatialMethods → ADRMethods → StoriesBMethods → ... → ApiClientCore
 */
import { ClientCodingAgentsMethods } from "./clientCodingAgents";

export class ApiClient extends ClientCodingAgentsMethods {}

export const apiClient = new ApiClient();
