import type OpenAI from "openai";
import { chat } from "@/lib/llm";
import { toPromptText, type Source } from "@/lib/sources";

export type Niche = {
  label: string;
  /** The string sent to the search API. Technical phrasing, never fund language. */
  query: string;
  rationale: string;
  /** The phrase in the investor's own document that supports this niche. */
  evidence: string;
};

export type ThesisRead = {
  summary: string;
  focusAreas: string[];
  avoid: string[];
  niches: Niche[];
};

export type Turn = { role: "user" | "assistant"; content: string };

/**
 * The search API ranks people by matching academic papers, so a niche has to
 * read like a paper topic. Fund language ("pre-seed deep tech") scans a third
 * as many papers and halves the top score, so the model is pushed hard away
 * from it.
 */
const QUERY_RULES = [
  "A query must read like a research topic, not an investment thesis.",
  "Three to eight words, technical and specific: 'protein design with diffusion models', not 'deep tech bio'.",
  "Never use investor vocabulary: no startup, founder, pre-seed, venture, market, opportunity, disruption.",
  "Prefer a method plus a domain, because that is how papers are titled.",
  "Coverage is Columbia, NYU, Cornell and Cornell Tech, papers from 2024 onward, so favour niches those labs plausibly publish in.",
].join(" ");

const NICHE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Short human title for the niche, at most six words." },
    query: { type: "string", description: `The search query. ${QUERY_RULES}` },
    rationale: { type: "string", description: "One sentence on why this niche follows from the thesis." },
    evidence: {
      type: "string",
      description: "A short quote or close paraphrase from the submitted document that supports this niche.",
    },
  },
  required: ["label", "query", "rationale", "evidence"],
} as const;

const READ_TOOL_NAME = "record_thesis";

const READ_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: READ_TOOL_NAME,
    description: "Record what the investment thesis says and the research niches worth sourcing in.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Two or three sentences on what this investor is looking for." },
        focusAreas: {
          type: "array",
          items: { type: "string" },
          description: "The technical areas the thesis commits to, in the investor's own terms.",
        },
        avoid: {
          type: "array",
          items: { type: "string" },
          description: "Anything the thesis rules out or explicitly deprioritises. Empty if it says nothing.",
        },
        niches: {
          type: "array",
          items: NICHE_SCHEMA,
          description: "Four or five candidate niches, ordered by how well they fit the thesis.",
        },
      },
      required: ["summary", "focusAreas", "avoid", "niches"],
    },
  },
};

const REFINE_TOOL_NAME = "revise_niches";

const REFINE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: REFINE_TOOL_NAME,
    description: "Reply to the investor and revise the niche list to match what they just said.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description: "Two sentences at most, addressing what the investor just asked for. No preamble.",
        },
        niches: {
          type: "array",
          items: NICHE_SCHEMA,
          description: "The full revised list of four or five niches, not just the changed ones.",
        },
      },
      required: ["reply", "niches"],
    },
  },
};

const SYSTEM = [
  "You help venture investors turn a fund thesis into research niches they can source talent in.",
  "You are talking to an investor, so be concrete and skip flattery.",
  `Ground every niche in the submitted document. ${QUERY_RULES}`,
  "Always answer by calling the provided function. Never reply with prose.",
].join(" ");

/**
 * Claude 5.5 rejects a forced `tool_choice` through the gateway, so the tool is
 * offered with "auto" and the prompt does the insisting. That leaves a thin
 * chance of a prose answer, which is what the text fallback below is for.
 */
function parse<T>(
  completion: Awaited<ReturnType<typeof chat>>,
  toolName: string,
): { value: T; usage: { inputTokens: number; outputTokens: number }; model: string } {
  const message = completion.choices[0]?.message;
  const call = message?.tool_calls?.find((one) => one.type === "function" && one.function.name === toolName);

  const raw =
    call?.type === "function"
      ? call.function.arguments
      : (message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

  if (!raw) throw new Error("The model returned nothing to parse");

  try {
    return {
      value: JSON.parse(raw) as T,
      model: completion.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  } catch {
    throw new Error("The model did not answer in the expected shape");
  }
}

export async function readThesis(sources: Source[], instruction: string) {
  const documents = toPromptText(sources);
  if (!documents && !instruction) throw new Error("No thesis to read");

  const ask = [
    documents || "The investor did not attach a document.",
    "",
    instruction
      ? `Read the thesis above and propose niches. The investor added: "${instruction}"`
      : "Read the thesis above and propose niches.",
  ].join("\n");

  const completion = await chat({
    max_tokens: 2500,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: ask },
    ],
    tools: [READ_TOOL],
    tool_choice: "auto",
  });

  return parse<ThesisRead>(completion, READ_TOOL_NAME);
}

export async function refineNiches(thesis: ThesisRead, history: Turn[]) {
  const context = [
    `The investor's thesis: ${thesis.summary}`,
    `Focus areas: ${thesis.focusAreas.join(", ") || "none stated"}`,
    `Ruled out: ${thesis.avoid.join(", ") || "nothing stated"}`,
    `Current niches: ${thesis.niches.map((niche) => `${niche.label} (${niche.query})`).join("; ")}`,
  ].join("\n");

  const completion = await chat({
    max_tokens: 2500,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "system", content: context },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    ],
    tools: [REFINE_TOOL],
    tool_choice: "auto",
  });

  return parse<{ reply: string; niches: Niche[] }>(completion, REFINE_TOOL_NAME);
}
