# Walk-Free development

- Use the existing checkout and a local Node.js workflow. Do not edit or publish Codex cloud environment settings unless the user explicitly asks.
- Read README.md and docs/VALIDATION.md before reporting feature readiness. This is an implementation in progress; live routing, OpenAI, and native navigation still need end-to-end validation.
- The user authorizes regular GitHub checkpoints. Commit and push coherent, verified milestones to the working branch; never force-push. Inspect remote history before integrating changes.
- Keep API keys in ignored server-side `.env` files or runtime secrets. Never commit credentials or expose them through `VITE_` variables, browser code, logs, or documentation.
- Run `npm test` and `npm run build` for application changes. For setup-only changes, verify the setup behavior without overwriting existing configuration.
- Use `npm run setup` for a fresh local checkout, then `npm run dev`. Node 24 is specified in `.nvmrc`. No cloud environment publication is required to run the app locally.
