import assert from "node:assert/strict";
import test from "node:test";
import {
  extractClaudeCodeLogRecords,
  extractClaudeCodeMetricPoints,
  sanitizeTelemetryAttributes,
} from "./otel-claude-code.server";

function stringAttr(key: string, stringValue: string) {
  return { key, value: { stringValue } };
}

test("organization OTel log extraction combines resource identity and removes sensitive content", () => {
  const records = extractClaudeCodeLogRecords({
    resourceLogs: [
      {
        resource: {
          attributes: [
            stringAttr("organization.id", "org-1"),
            stringAttr("user.email", "dev@xyz.ai"),
          ],
        },
        scopeLogs: [
          {
            logRecords: [
              {
                eventName: "claude_code.api_request",
                timeUnixNano: "1700000000000000000",
                attributes: [
                  stringAttr("model", "claude-sonnet"),
                  { key: "input_tokens", value: { intValue: "42" } },
                  stringAttr("prompt", "secret customer prompt"),
                  stringAttr("tool_parameters", '{"path":"/private/source.ts"}'),
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].eventName, "claude_code.api_request");
  assert.equal(records[0].attrs["organization.id"], "org-1");
  assert.equal(records[0].attrs["user.email"], "dev@xyz.ai");
  assert.equal(records[0].attrs.input_tokens, 42);
  assert.equal("prompt" in records[0].attrs, false);
  assert.equal("tool_parameters" in records[0].attrs, false);
});

test("sanitizer removes content fields but preserves identity and usage facts", () => {
  const safe = sanitizeTelemetryAttributes({
    "session.id": "session-1",
    "user.account_uuid": "user-1",
    output_tokens: 10,
    tool_input: "rm -rf something",
    "tool.input": "another sensitive argument",
    file_content: "private source",
  });
  assert.deepEqual(safe, {
    "session.id": "session-1",
    "user.account_uuid": "user-1",
    output_tokens: 10,
  });
});

test("metric extraction preserves points for idempotent raw storage without summing cumulative counters", () => {
  const points = extractClaudeCodeMetricPoints({
    resourceMetrics: [
      {
        resource: { attributes: [stringAttr("qualimetrix.connection_id", "connection-1")] },
        scopeMetrics: [
          {
            metrics: [
              {
                name: "claude_code.token.usage",
                unit: "tokens",
                sum: {
                  dataPoints: [
                    {
                      timeUnixNano: "1700000000000000000",
                      asInt: "123",
                      attributes: [stringAttr("type", "input")],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(points, [
    {
      metricName: "claude_code.token.usage",
      unit: "tokens",
      attrs: { "qualimetrix.connection_id": "connection-1", type: "input" },
      value: 123,
      timeUnixNano: "1700000000000000000",
      startTimeUnixNano: undefined,
    },
  ]);
});
