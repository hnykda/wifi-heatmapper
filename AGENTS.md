# Agent instructions

The project's commands, layout and conventions are in [CLAUDE.md](CLAUDE.md);
read it first. Contributor docs: [CONTRIBUTING.md](CONTRIBUTING.md) and
`docs/dev/`.

The block below is managed by `next dev` (Next.js `agentRules`): it rewrites
it when it detects a coding agent, so leave it as it is and commit it if
`next dev` changes it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
