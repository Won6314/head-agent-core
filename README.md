# HEAD Agent Core

The product-neutral skeleton for a HEAD-led agent installation: the coordinating principles, the advertised work skills and their procedures, the worker role cores, and the runtime meaning that Claude Code and OpenCode share. A project attaches this skeleton; it does not copy it.

## Read first

- [User Guide](packages/core/docs/USER_GUIDE.md) — what a project must provide to attach Core, and how the two runtimes consume it.
- [Technical Architecture](packages/core/docs/TECHNICAL_ARCHITECTURE.md) — packages, ownership, the shared runtime, and source boundaries.
- [Foundations](packages/core/docs/FOUNDATIONS.md) — authority, context, continuity, delegation, and evidence from first principles.
- [Theory](packages/core/theory/README.md) — context management and knowledge-graph background.

## Packages

| Package | Owns |
|---|---|
| `packages/context/` | The `head-context` Claude Code plugin, published through this repository's marketplace. Install and upgrade: [packages/context/README.md](packages/context/README.md) |
| `packages/core/` | `head/HEAD_CORE.md` (always-loaded principles), `docs/`, `theory/` |
| `packages/skills/` | Advertised top-level skills: `start-job`, `product-planning`, `delegate-once`, `plan-run`, `agent-reply` |
| `packages/procedures/` | Condition-selected procedures a skill links to |
| `packages/agents/` | Worker role cores: `coder`, `developer`, `reviewer` |
| `packages/head-runtime/` | Runtime meaning shared by both runtimes (`shared/`), plus the thin Claude adapters (`claude/`) and OpenCode plugin entrypoints (`opencode/`) |
| `packages/opencode-runtime/` | Compatibility re-exports at the pre-2026-09 paths. No implementation lives here |
| `packages/_platform/` | The install-shaped host daemon and project initializer, isolated and excluded from the release. See its README |

`release-manifest.json` selects what a release contains. `packages/core/purity.test.mjs` keeps the tree free of absolute paths, product names, and project session paths.

## Tests

```bash
node --test 'packages/core/**/*.test.mjs' 'packages/head-runtime/**/*.test.mjs' 'packages/opencode-runtime/**/*.test.mjs'
```

Only behavior tests are kept — real inputs to real outputs. Tests that assert on prose wording, frontmatter, or link presence were removed on 2026-09-08.
