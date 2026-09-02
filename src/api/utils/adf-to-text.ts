// jira-sync.service.ts stores a bug's description as
// `JSON.stringify(issue.fields.description)` — Atlassian Document Format
// (ADF), a rich-text node tree, not plain text. This extracts the readable
// text for display; rendering the raw JSON would show garbled markup.

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'hardBreak', 'codeBlock']);

function extractText(node: AdfNode, parts: string[]): void {
  if (node.type === 'text' && node.text) {
    parts.push(node.text);
  }
  if (node.content) {
    for (const child of node.content) extractText(child, parts);
  }
  if (node.type && BLOCK_TYPES.has(node.type)) {
    parts.push('\n');
  }
}

export function adfToPlainText(raw: string | null | undefined): string {
  if (!raw) return '';

  let doc: AdfNode;
  try {
    doc = JSON.parse(raw);
  } catch {
    // Not JSON — some rows may already be a short legacy plain string.
    return raw;
  }

  const parts: string[] = [];
  extractText(doc, parts);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}
