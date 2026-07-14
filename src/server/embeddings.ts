import OpenAI from "openai";

import { env } from "@/lib/env";

export const MATCHING_EMBEDDING_DIMENSIONS = 1024;
export const MATCHING_EMBEDDING_MODEL = "text-embedding-3-large";
export const LOCAL_EMBEDDING_MODEL = "local-token-hash-v3";

const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_INPUT_MAX_CHARACTERS = 6_000;

export function hasConfiguredEmbeddingProvider() {
  return Boolean(env.openAiApiKey);
}

function hashToken(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedTokens(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const cjkSequences =
    normalized.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
    ) ?? [];
  const characterBigrams = cjkSequences.flatMap((sequence) =>
    Array.from(sequence).flatMap((character, index, characters) =>
      index + 1 < characters.length ? [`${character}${characters[index + 1]}`] : [],
    ),
  );
  return [...words, ...characterBigrams];
}

export function buildLocalEmbedding(text: string) {
  const vector = Array.from({ length: MATCHING_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = normalizedTokens(text);
  for (const token of tokens) {
    const hash = hashToken(token);
    const bucket = hash % vector.length;
    vector[bucket] += (hash >>> 12) & 1 ? 1 : -1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return magnitude ? vector.map((value) => value / magnitude) : vector;
}

export async function generateEmbeddingVectors(texts: string[]) {
  const input = texts.map(
    (text) =>
      (text.trim() || "No matching context provided.").slice(
        0,
        EMBEDDING_INPUT_MAX_CHARACTERS,
      ),
  );
  if (!env.openAiApiKey) {
    return {
      model: LOCAL_EMBEDDING_MODEL,
      vectors: input.map(buildLocalEmbedding),
    };
  }

  const client = new OpenAI({ apiKey: env.openAiApiKey });
  const vectors: number[][] = [];
  let responseModel = MATCHING_EMBEDDING_MODEL;
  for (let offset = 0; offset < input.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = input.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: MATCHING_EMBEDDING_MODEL,
      dimensions: MATCHING_EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      input: batch,
    });
    responseModel = response.model || responseModel;
    vectors.push(
      ...response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding),
    );
  }
  if (
    vectors.length !== input.length ||
    vectors.some((vector) => vector.length !== MATCHING_EMBEDDING_DIMENSIONS)
  ) {
    throw new Error("Embedding provider returned an unexpected vector shape.");
  }
  return { model: responseModel, vectors };
}
