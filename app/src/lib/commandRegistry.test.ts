/**
 * CommandRegistry tests — register, get, getAll, execute with Zod validation,
 * metadata, and function schemas for agent tool calling.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CommandRegistry, toJsonSchema } from "@/lib/commandRegistry";

describe("CommandRegistry", () => {
	let registry: CommandRegistry;

	beforeEach(() => {
		registry = new CommandRegistry();
	});

	it("registers and retrieves a command", () => {
		registry.register({
			name: "test.command",
			description: "A test command",
			category: "test",
			inputSchema: z.object({ value: z.string() }),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: ["test.write"],
			handler: async ({ value }) => ({ ok: value.length > 0 }),
		});

		const def = registry.get("test.command");
		expect(def).toBeDefined();
		expect(def?.name).toBe("test.command");
		expect(def?.category).toBe("test");
		expect(def?.permissions).toEqual(["test.write"]);
	});

	it("throws on duplicate registration", () => {
		registry.register({
			name: "dup.command",
			description: "First",
			category: "test",
			inputSchema: z.object({}),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: [],
			handler: async () => ({ ok: true }),
		});
		expect(() =>
			registry.register({
				name: "dup.command",
				description: "Second",
				category: "test",
				inputSchema: z.object({}),
				outputSchema: z.object({ ok: z.boolean() }),
				permissions: [],
				handler: async () => ({ ok: true }),
			}),
		).toThrow(/already registered/);
	});

	it("returns undefined for unknown commands", () => {
		expect(registry.get("no.such.command")).toBeUndefined();
	});

	it("getAll returns all registered commands", () => {
		registry.register({
			name: "cmd.one",
			description: "One",
			category: "test",
			inputSchema: z.object({}),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: [],
			handler: async () => ({ ok: true }),
		});
		registry.register({
			name: "cmd.two",
			description: "Two",
			category: "test",
			inputSchema: z.object({}),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: [],
			handler: async () => ({ ok: true }),
		});
		expect(registry.getAll().length).toBe(2);
		expect(registry.getAll().map((c) => c.name)).toEqual([
			"cmd.one",
			"cmd.two",
		]);
	});

	it("execute validates input, runs handler, validates output", async () => {
		registry.register({
			name: "math.add",
			description: "Add two numbers",
			category: "math",
			inputSchema: z.object({ a: z.number(), b: z.number() }),
			outputSchema: z.object({ sum: z.number() }),
			permissions: ["math.read"],
			handler: async ({ a, b }) => ({ sum: a + b }),
		});

		const result = await registry.execute("math.add", { a: 2, b: 3 });
		expect(result).toEqual({ sum: 5 });
	});

	it("execute throws on unknown command", async () => {
		await expect(registry.execute("unknown.cmd", {})).rejects.toThrow(
			/Unknown command/,
		);
	});

	it("execute rejects invalid input", async () => {
		registry.register({
			name: "validate.input",
			description: "Input validation",
			category: "test",
			inputSchema: z.object({ name: z.string().min(1) }),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: [],
			handler: async () => ({ ok: true }),
		});

		await expect(
			registry.execute("validate.input", { name: "" }),
		).rejects.toThrow();
	});

	it("getMetadata returns command descriptions and permissions", () => {
		registry.register({
			name: "meta.command",
			description: "Metadata test",
			category: "meta",
			inputSchema: z.object({}),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: ["meta.read"],
			handler: async () => ({ ok: true }),
		});

		const metadata = registry.getMetadata();
		expect(metadata.length).toBe(1);
		expect(metadata[0].name).toBe("meta.command");
		expect(metadata[0].description).toBe("Metadata test");
		expect(metadata[0].permissions).toEqual(["meta.read"]);
	});

	it("getFunctionSchemas returns OpenAI-compatible schemas", () => {
		registry.register({
			name: "fn.command",
			description: "Function schema test",
			category: "test",
			inputSchema: z.object({ value: z.string() }),
			outputSchema: z.object({ ok: z.boolean() }),
			permissions: [],
			handler: async () => ({ ok: true }),
		});

		const schemas = registry.getFunctionSchemas();
		expect(schemas.length).toBe(1);
		expect(schemas[0].name).toBe("fn.command");
		expect(schemas[0].description).toBe("Function schema test");
		expect(schemas[0].parameters.type).toBe("object");
		expect(
			(schemas[0].parameters as Record<string, unknown>).properties,
		).toBeDefined();
	});
});

describe("toJsonSchema", () => {
	it("converts an object schema with required and optional fields", () => {
		const schema = z.object({
			name: z.string(),
			age: z.number().optional(),
			active: z.boolean(),
		});
		const json = toJsonSchema(schema);
		expect(json.type).toBe("object");
		const props = json.properties as Record<string, unknown>;
		expect(props.name).toEqual({ type: "string" });
		expect(props.age).toEqual({ type: "number" });
		expect(props.active).toEqual({ type: "boolean" });
		expect(json.required).toEqual(["name", "active"]);
	});

	it("converts optional wrappers to non-required fields", () => {
		const schema = z.object({ label: z.string().optional() });
		const json = toJsonSchema(schema);
		expect(json.required).toBeUndefined();
	});

	it("converts string, number, boolean primitives", () => {
		expect(toJsonSchema(z.string())).toEqual({ type: "string" });
		expect(toJsonSchema(z.number())).toEqual({ type: "number" });
		expect(toJsonSchema(z.boolean())).toEqual({ type: "boolean" });
	});
});
