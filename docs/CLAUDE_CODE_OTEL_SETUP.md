# Connecting Claude Code to QualiMetrix

The former per-developer token flow has been retired. Developers do not connect Claude Code to QualiMetrix, and the old `/api/v1/ai-usage/connect` and `/api/v1/ai-usage/otlp/logs` routes are not mounted.

A tenant Program Manager now creates one or more organization connections under **Settings → AI providers → Claude Code**. QualiMetrix returns a one-time `managed-settings.json` fragment for organization-managed OpenTelemetry, and/or validates an official Enterprise/Console reporting key depending on the selected plan and acquisition channel.

For daily or historical reporting, the PM pastes the provider-issued key directly into Settings:

- Claude Enterprise: an Analytics API key created by the Primary Owner in **Claude.ai → Organization settings → API**.
- Claude Platform/Console (including Team/subscription organizations when Anthropic exposes the capability): an Admin API key created in **Claude Console → Settings → Admin keys**.

The PM selects **Validate reporting key** first. QualiMetrix calls Anthropic from the backend, confirms the exact organization ID and Claude Code analytics permission, and returns only redacted capability information. A failed validation stores nothing. An existing telemetry-only organization can be upgraded with **Add reporting access**; it does not need to be registered again.

The PM does not run the JSON:

- If the PM is also a Claude Admin/Owner, they use the guided **I am also a Claude Admin** path and paste it into **Claude.ai → Admin Settings → Claude Code → Managed settings**.
- Otherwise they use **Send to Claude Admin / IT**, download the one-time managed settings file, and transfer it through an approved secret-sharing mechanism. IT deploys it centrally; developers take no action.

Production must configure `QUALIMETRIX_PUBLIC_API_URL` with the externally reachable HTTPS API base URL. QualiMetrix labels localhost as local-test-only and blocks both organization deployment actions.

See [Enterprise AI provider integration architecture](./ENTERPRISE_AI_PROVIDER_INTEGRATION_ARCHITECTURE.md) for the supported capability matrix, setup, security model, APIs, data provenance, and acceptance criteria.
