// Local types for react-syntax-highlighter deep imports (ESM)
// The @types package declares these but TS doesn't pick them up for deep imports.

declare module "react-syntax-highlighter/dist/esm/prism-light" {
	import React from "react";
	export class PrismLight extends React.Component<
		{
			language?: string;
			style?: unknown;
			showLineNumbers?: boolean;
			wrapLongLines?: boolean;
			customStyle?: unknown;
			children?: React.ReactNode;
		},
		unknown
	> {
		static registerLanguage(name: string, func: unknown): void;
	}
	export default PrismLight;
}
declare module "react-syntax-highlighter/dist/esm/styles/prism" {
	export const vscDarkPlus: Record<string, React.CSSProperties>;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/markup" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/css" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/clike" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/javascript" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/typescript" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/python" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/bash" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/json" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/yaml" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/markdown" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/rust" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/sql" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/powershell" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/java" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/go" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/c" {
	const mod: { default: unknown };
	export default mod;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/cpp" {
	const mod: { default: unknown };
	export default mod;
}
