// Server-side port of src/lib/qm-bugs.ts's tf-idf cosine similarity, over
// real synced work item text instead of the client-only mock bug corpus.
// Same algorithm shape deliberately kept in sync with that file.

const STOP = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "when",
  "than", "then", "have", "has", "had", "was", "were", "are", "not",
  "but", "all", "can", "will", "would", "could", "should", "does", "did",
  "you", "your", "our", "their", "its", "it's", "on", "in", "to", "of",
  "is", "as", "an", "a", "at",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function tfidfVectors(docs: string[]): Array<Map<string, number>> {
  const tokenised = docs.map(tokenize);
  const df = new Map<string, number>();
  tokenised.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  });
  return tokenised.map((tokens) => {
    const tf = new Map<string, number>();
    tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    const vec = new Map<string, number>();
    tf.forEach((count, term) => {
      const idf = Math.log(docs.length / (1 + (df.get(term) ?? 0))) + 1;
      vec.set(term, (count / tokens.length) * idf);
    });
    return vec;
  });
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  a.forEach((v, k) => {
    const w = b.get(k);
    if (w) dot += v * w;
  });
  const norm = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((acc, v) => acc + v * v, 0));
  const d = norm(a) * norm(b);
  return d ? dot / d : 0;
}

/** Ranks `candidates` by tf-idf cosine similarity to `targetText`, filtering out near-zero matches. */
export function rankBySimilarity(
  targetText: string,
  candidates: Array<{ id: string; text: string }>
): Array<{ id: string; score: number }> {
  const docs = [targetText, ...candidates.map((c) => c.text)];
  const vectors = tfidfVectors(docs);
  return candidates
    .map((c, i) => ({ id: c.id, score: cosine(vectors[0], vectors[i + 1]) }))
    .filter((r) => r.score > 0.08)
    .sort((a, b) => b.score - a.score);
}
