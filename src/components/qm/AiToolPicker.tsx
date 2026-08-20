import { useState } from "react";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { ConnectClaudeCodePanel } from "@/components/qm/ConnectClaudeCodePanel";
import { AiProviderSettings } from "@/components/qm/AiProviderSettings";
import { ModelCatalogTable } from "@/components/qm/ModelCatalogTable";
import { ManualUsageEntryPanel } from "@/components/qm/ManualUsageEntryPanel";

type Tool = "claude" | "gemini" | "openai" | "other";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "claude", label: "Claude Code", hint: "Personal token, fully automatic" },
  { id: "gemini", label: "Gemini", hint: "Personal token, small snippet you add" },
  { id: "openai", label: "OpenAI", hint: "Org admin key, automatic sync" },
  { id: "other", label: "Other (DeepSeek, in-house, …)", hint: "No live sync — manual pricing + entries" },
];

/**
 * One picker, one configuration surface at a time — instead of every vendor's
 * card always visible regardless of which one you actually came to configure.
 */
export function AiToolPicker() {
  const [tool, setTool] = useState<Tool | "">("");

  return (
    <div className="space-y-4">
      <GlassPanel
        title="Connect an AI tool"
        subtitle="Pick the tool your team uses — the right setup steps show up below"
      >
        <div className="space-y-1.5">
          <label htmlFor="ai-tool-picker" className="text-xs font-medium">
            AI tool
          </label>
          <select
            id="ai-tool-picker"
            value={tool}
            onChange={(e) => setTool(e.target.value as Tool)}
            className="h-9 w-full max-w-sm rounded-md border border-glass-border bg-transparent px-2 text-sm"
          >
            <option value="">Choose a tool…</option>
            {TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {tool && (
            <p className="text-[11px] text-muted-foreground">
              {TOOLS.find((t) => t.id === tool)?.hint}
            </p>
          )}
        </div>
      </GlassPanel>

      {tool === "claude" && (
        <GlassPanel title="Claude Code" subtitle="Personal, per-developer — anyone can connect their own">
          <ConnectClaudeCodePanel mode="claude" />
        </GlassPanel>
      )}

      {tool === "gemini" && (
        <GlassPanel title="Gemini" subtitle="Personal, per-developer — anyone can connect their own">
          <ConnectClaudeCodePanel mode="gemini" />
        </GlassPanel>
      )}

      {tool === "openai" && <AiProviderSettings />}

      {tool === "other" && (
        <>
          <ModelCatalogTable />
          <ManualUsageEntryPanel />
        </>
      )}
    </div>
  );
}
