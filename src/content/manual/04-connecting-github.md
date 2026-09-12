# 4. Connecting GitHub

GitHub is optional and separate from Jira/Azure DevOps — it powers commit/PR-based analytics (defect density by change, CI pass rate, AI-vs-human commit attribution) rather than backlog data.

## Connecting

1. Generate a **Personal Access Token** at [github.com/settings/tokens](https://github.com/settings/tokens) with the `repo` and `read:org` scopes.
2. We recommend using an org-owned "machine user" account for this token rather than a personal account's — access then survives personnel changes.
3. Paste the token into **Integrations** → **Connect GitHub**.

The token is encrypted and stored server-side; it is never exposed to the browser or logged anywhere, and QualiMetrix only ever reads with it (commits, pull requests, workflow runs) — it cannot push, merge, or modify anything in your repositories.

## After connecting

- Your accessible repositories are listed automatically.
- Link a repository to a Product from the Integrations page to enable that product's commit/PR/CI panels.
- CI pass-rate analytics require the linked repository to actually use GitHub Actions — QualiMetrix reads workflow run results, it doesn't run tests itself.
