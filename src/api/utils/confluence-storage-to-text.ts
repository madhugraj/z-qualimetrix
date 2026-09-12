// confluence-sync.service.ts stores a page's body as Confluence's "storage
// format" — XHTML with Confluence-specific macro elements (<ac:*>, <ri:*>)
// mixed in, not plain text. This extracts readable text for embedding/search/
// display, at the same tag-strip/entity-decode rigor as adf-to-text.ts's ADF
// extraction (a working plain-text approximation, not a full renderer).

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? match;
  });
}

// Block-level tags get a newline after them so paragraphs/list items/table
// rows don't run together into one unbroken line once tags are stripped.
const BLOCK_TAG_CLOSE = /<\/(p|div|h[1-6]|li|tr|br|ac:task)\s*>/gi;

export function confluenceStorageToText(raw: string | null | undefined): string {
  if (!raw) return '';

  const withBreaks = raw.replace(BLOCK_TAG_CLOSE, '$&\n');
  const withoutTags = withBreaks.replace(/<[^>]*>/g, ' ');
  const decoded = decodeEntities(withoutTags);

  return decoded
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
