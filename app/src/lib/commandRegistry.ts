import type { z } from "zod";

export type Permission = string;

/**
 * Definition of a single command the in-app agent (or any caller) can execute.
 *
 * Every command carries:
 *  - name        — unique identifier used for lookup and function-calling
 *  - description — human-readable summary the agent uses to decide when to call
 *  - category    — UI grouping (navigation, profile, studio, voice_changer)
 *  - inputSchema — Zod schema validating the caller's arguments
 *  - outputSchema— Zod schema validating the handler's result
 *  - permissions — capability keys carried by the command (enforced later)
 *  - handler     — async implementation
 */
export interface CommandDef<
	TInput extends z.ZodTypeAny,
	TOutput extends z.ZodTypeAny,
> {
	name: string;
	description: string;
	category: string;
	inputSchema: TInput;
	outputSchema: TOutput;
	permissions: Permission[];
	handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

/** Metadata exposed to callers (UI discovery + agent function-calling). */
export interface CommandMetadata {
	name: string;
	description: string;
	category: string;
	permissions: Permission[];
	inputJsonSchema: Record<string, unknown>;
	outputJsonSchema: Record<string, unknown>;
}

/** OpenAI-compatible function definition for agent tool calling. */
export interface CommandFunctionSchema {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/**
 * Typed command registry — single source of truth for every command the
 * in-app agent can execute directly (design doc §9: "direct, not MCP").
 *
 * Commands are registered once, validated on every call via Zod, and
 * discoverable through getMetadata() / getFunctionSchemas() so the agent
 * can use ordinary function calling against them.
 */
export class CommandRegistry {
	private commands = new Map<string, CommandDef<any, any>>();

	/**
	 * Register a command. Throws if a command with the same name exists.
	 */
	register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
		def: CommandDef<TInput, TOutput>,
	): void {
		if (this.commands.has(def.name)) {
			throw new Error(`Command already registered: ${def.name}`);
		}
		this.commands.set(def.name, def);
	}

	/** Look up a registered command by name. Returns undefined if unknown. */
	get<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
		name: string,
	): CommandDef<TInput, TOutput> | undefined {
		return this.commands.get(name) as CommandDef<TInput, TOutput> | undefined;
	}

	/** All registered commands, in registration order. */
	getAll(): CommandDef<any, any>[] {
		return Array.from(this.commands.values());
	}

	/** Metadata for every command — UI discovery and agent schemas. */
	getMetadata(): CommandMetadata[] {
		return this.getAll().map((def) => ({
			name: def.name,
			description: def.description,
			category: def.category,
			permissions: def.permissions,
			inputJsonSchema: toJsonSchema(def.inputSchema),
			outputJsonSchema: toJsonSchema(def.outputSchema),
		}));
	}

	/** OpenAI-compatible function schemas for agent tool calling. */
	getFunctionSchemas(): CommandFunctionSchema[] {
		return this.getAll().map((def) => ({
			name: def.name,
			description: def.description,
			parameters: toJsonSchema(def.inputSchema),
		}));
	}

	/**
	 * Execute a command by name. Validates input against inputSchema, runs
	 * the handler, validates output against outputSchema.
	 *
	 * Throws on unknown command or validation failure.
	 */
	async execute(name: string, args: unknown): Promise<unknown> {
		const def = this.commands.get(name);
		if (!def) {
			throw new Error(`Unknown command: ${name}`);
		}
		const input = def.inputSchema.parse(args);
		const result = await def.handler(input);
		return def.outputSchema.parse(result);
	}
}

/** Singleton registry — one instance for the whole app. */
export const commandRegistry = new CommandRegistry();

/**
 * Convert a Zod v4 schema to a plain JSON Schema object suitable for
 * agent function-calling (OpenAI `parameters` format).
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
	const def = (schema as { def: unknown }).def as
		| { type: string; shape?: Record<string, unknown> }
		| { type: string; innerType?: unknown }
		| { type: string };
	const type = def.type;

	if (type === "object" && "shape" in def && def.shape) {
		const shape = def.shape as Record<string, z.ZodTypeAny>;
		const properties: Record<string, unknown> = {};
		const required: string[] = [];
		for (const [key, field] of Object.entries(shape)) {
			properties[key] = toJsonSchema(field);
			const fieldDef = (field as { def: unknown }).def as {
				type: string;
			};
			if (fieldDef.type !== "optional" && fieldDef.type !== "nullable") {
				required.push(key);
			}
		}
		const result: Record<string, unknown> = {
			type: "object",
			properties,
		};
		if (required.length > 0) {
			result.required = required;
		}
		return result;
	}

	if (type === "optional" && "innerType" in def) {
		return toJsonSchema(def.innerType as z.ZodTypeAny);
	}

	if (type === "string") {
		return { type: "string" };
	}
	if (type === "number") {
		return { type: "number" };
	}
	if (type === "boolean") {
		return { type: "boolean" };
	}
	if (type === "array" && "innerType" in def) {
		return {
			type: "array",
			items: toJsonSchema(def.innerType as z.ZodTypeAny),
		};
	}
	if (type === "nullable" && "innerType" in def) {
		const inner = toJsonSchema(def.innerType as z.ZodTypeAny);
		return {
			type: Array.isArray(inner.type)
				? [...inner.type, "null"]
				: [inner.type, "null"],
			...(inner.type === "array" || inner.type === "object" ? {} : {}),
		};
	}

	return { type: "string" };
}
