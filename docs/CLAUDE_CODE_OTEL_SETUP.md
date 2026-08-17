# Connecting Claude Code to QualiMetrix

QualiMetrix captures real Claude Code usage via Claude Code's official OpenTelemetry
(OTLP) logs export — not a network proxy, not session-log parsing. This replaces the
earlier `mcp-token-capture/` proxy attempt, which could not work (it never handled the
`CONNECT` method needed to intercept HTTPS traffic).

## 1. Get your personal ingest token

Open `/ai-usage` in QualiMetrix, switch to **My usage**, and use the "Connect your
Claude Code" panel — enter your work email (and optionally your squad). You'll get
back a one-time setup snippet containing a personal token.

Or via curl:
```bash
curl -X POST http://localhost:3001/api/v1/ai-usage/connect \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@company.com","squad":"Squad Nova"}'
```

Reconnecting with the same email issues a **new** token and invalidates the old one.

## 2. Configure your shell

Export the snippet returned by step 1, e.g.:
```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:3001/api/v1/ai-usage/otlp/logs
export OTEL_EXPORTER_OTLP_HEADERS="x-qualimetrix-token=<your token>"
```
Add these to your shell profile to persist them across sessions.

## 3. Use Claude Code normally

Every API request Claude Code makes now also gets reported to QualiMetrix. Your usage
should appear on `/ai-usage` (self visibility) within about a minute.

## What's real vs. approximated (v1)

| Field | Source |
|---|---|
| Model, input/output tokens, cached tokens | Real, from Claude Code's `claude_code.api_request` telemetry event |
| Cost | Computed from tokens against `ai_model_catalog` pricing |
| Identity | Real — resolved from your personal ingest token, never from the payload |
| Activity (code/tests/docs/review) | **Always `"code"`** — Claude Code's telemetry carries no signal to distinguish these yet |
| Accepted / reworked | **Always `true` / `false`** — no real "did you keep this suggestion" signal exists yet |
| Latency | Not reported by this path, always `0` |

An unrecognized model ID (e.g. a non-Anthropic model routed through a compatible
proxy) is auto-added to the model catalog with placeholder pricing — an admin should
verify/correct its price before trusting cost figures for that model.

## Troubleshooting

- **401 from the receiver**: token missing or invalid — reconnect via step 1.
- **Nothing showing up**: confirm the API server is reachable at the configured
  endpoint, and check its console output for `Error ingesting OTLP logs`.
- **Verify data landed**: `psql ... -c "select * from ai_usage_events order by created_at desc limit 5;"`
