/**
 * Fully local, offline bug-similarity embeddings — no external API, no
 * per-tenant credential, no bug text ever leaves this process. Runs
 * Xenova/all-MiniLM-L6-v2 (384-dim, ONNX, quantized) in-process via
 * @huggingface/transformers.
 *
 * In Node.js, this library always runs on the native `onnxruntime-node`
 * binding (confirmed by reading its source: onnxruntime-web/WASM is only
 * ever used in browser-like environments — there's no way to force WASM
 * in Node, an earlier version of this comment incorrectly assumed there
 * was). That native binding ships prebuilt binaries that are typically
 * built against glibc; this app's Dockerfile builds on node:22-alpine
 * (musl libc), which is the actual, real deployment risk here — the fix
 * has to be the Docker base image (glibc-based, e.g. node:22-slim), not a
 * runtime backend switch. See Dockerfile changes in this same pass.
 *
 * MiniLM "does not provide good results for more than 128 tokens" per its
 * own model card and caps out around 256 — inputs are truncated to a
 * conservative character count as a simple proxy, not precise tokenization,
 * matching this codebase's existing tf-idf tokenizer's level of rigor.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MAX_INPUT_CHARS = 1000;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
  }
  return extractorPromise;
}

/** Returns one 384-dim embedding per input text, in the same order. Never throws for "not configured" — there's nothing to configure; a genuine model/runtime failure does still throw, callers should treat that as a real error, not an expected skip. */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const truncated = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
  const output = await extractor(truncated, { pooling: 'mean', normalize: true });
  return output.tolist() as number[][];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}
