// Compatibility shim — the canonical toast store lives at `@/ui/use-toast`.
//
// This module used to hold a parallel Radix-based toast implementation with its
// own memory state, which silently forked the toast surface: components pushing
// through this path rendered in a viewport nobody mounted (the router mounts
// `@/ui/toaster`), so e.g. the updater's "Update Available" toast never appeared.
// Every import here now resolves to the single canonical store.
export * from "@/ui/use-toast";
