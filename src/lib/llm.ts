import OpenAI from "openai";

const BASE_URL = "https://api.nicrron.ai/v1";

/**
 * Every model call goes through the Nicrron gateway, which speaks the OpenAI
 * API. The model is a gateway slug, so pointing at a different Claude (or a
 * different lab entirely) is an env change, not a code change.
 */
export const MODEL = process.env.NICRRON_MODEL ?? "anthropic/claude-sonnet-5-5";

/**
 * Tried in order when the primary rate-limits or errors before answering.
 * Kept to Claude models so a fallback never changes which lab answered.
 */
export const FALLBACK_MODELS = [
  "anthropic/claude-opus-5-5",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-5-5",
].filter((model) => model !== MODEL);

/** The gateway takes an ordered `models` list that the OpenAI SDK does not type. */
type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  models?: string[];
};

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.NICRRON_API_KEY;
  if (!apiKey) throw new Error("NICRRON_API_KEY is not set");
  if (!client) client = new OpenAI({ apiKey, baseURL: BASE_URL });
  return client;
}

export function chat(params: Omit<ChatParams, "model" | "models">) {
  const withFallback: ChatParams = { model: MODEL, models: FALLBACK_MODELS, ...params };
  return getClient().chat.completions.create(withFallback);
}
