# CONVENTIONS.md — otoyin House Style

> Every change follows these conventions. No exceptions.

## Code Style

### TypeScript/React
- **Indent**: 2 tabs (Biome default)
- **Semicolons**: always
- **Quotes**: double (Biome default)
- **Imports**: `@/*` path aliases, grouped: external → internal → types
- **Components**: PascalCase files, named exports
- **Hooks**: `use` prefix, in `lib/hooks/` or `components/*/hooks/`
- **Stores**: Zustand, in `stores/`, persisted via `zustand/middleware/persist`
- **API**: `apiClient` class methods, one per backend endpoint

### Python (Backend)
- **Indent**: 4 spaces
- **Line length**: 120
- **Quotes**: double
- **Imports**: sorted by Ruff (isort-compatible)
- **Naming**: snake_case functions/vars, PascalCase classes
- **Type hints**: required on public functions, optional on internals

### Icons
- **Heroicons** only (`@heroicons/react/24/outline`). No Lucide, no other icon libs.
- Aliased at import: `import { SparklesIcon as Wand2 } from "@heroicons/react/24/outline"`

### Error Handling
- Frontend: `showStudioErrorToast(error)` for user-facing errors
- Backend: `logger.debug(..., exc_info=True)` for swallowed exceptions
- Never empty `catch {}` without a comment explaining why

## File Organization

```
app/src/
├── components/        # UI components (one per feature area)
├── lib/
│   ├── api/           # API client (client.ts + per-domain files)
│   ├── hooks/         # Shared hooks
│   └── stores/        # Zustand stores
├── styles/            # Global CSS
└── locales/           # i18n translations (en, ja, zh-CN, zh-TW)

backend/
├── backends/          # TTS/STT/VC engine implementations
├── routes/            # FastAPI route modules
├── services/          # Business logic
├── utils/             # Shared utilities
├── tests/             # pytest tests
└── mcp_server/        # MCP tool definitions
```

## Naming

| Thing | Convention | Example |
|---|---|---|
| Component file | PascalCase | `AudioStudio.tsx` |
| Hook file | camelCase, `use` prefix | `useStoryPlayback.ts` |
| Store file | camelCase, `Store` suffix | `storyStore.ts` |
| API client file | camelCase, `client` prefix | `clientGenerations.ts` |
| Backend route | snake_case | `routes/audio.py` |
| Backend service | snake_case | `services/profiles.py` |
| Backend backend | snake_case, `_backend.py` suffix | `kokoro_onnx_backend.py` |

## Anti-patterns (Banned)

- `console.log` in production code (use `showStudioErrorToast` or remove)
- `// TODO` or `// FIXME` in committed code (fix it now or delete it)
- `any` type (use `unknown` + type guard, or disable per-file with biome-ignore)
- Empty `catch {}` without comment
- `lucide-react` imports (use heroicons)
- Hardcoded localhost URLs in frontend (use `apiClient`)
- Direct DOM manipulation outside React refs
