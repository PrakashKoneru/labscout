import type OpenAI from "openai";
import { chat } from "@/lib/llm";
import { toPromptText, type Source } from "@/lib/sources";

export type Profile = {
  title: string;
  summary: string;
  field: string;
  stage: "theory" | "simulation" | "prototype" | "validated" | "deployed";
  keywords: string[];
  methods: string[];
  applications: string[];
  commercialAngle: string;
};

const TOOL_NAME = "record_profile";

const TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "Record the structured profile of the submitted research document.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the work, or a short descriptive one if untitled." },
        summary: { type: "string", description: "Two or three sentences on what the work actually does." },
        field: { type: "string", description: "Primary research field, e.g. 'climate modeling'." },
        stage: {
          type: "string",
          enum: ["theory", "simulation", "prototype", "validated", "deployed"],
          description: "How far the work has progressed from idea toward something running in the world.",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Five to ten technical terms someone would search to find this work.",
        },
        methods: { type: "array", items: { type: "string" }, description: "Techniques, models, or instruments used." },
        applications: {
          type: "array",
          items: { type: "string" },
          description: "Concrete real-world uses the work enables.",
        },
        commercialAngle: {
          type: "string",
          description: "The most plausible path from this work to a product or company, in one sentence.",
        },
      },
      required: [
        "title",
        "summary",
        "field",
        "stage",
        "keywords",
        "methods",
        "applications",
        "commercialAngle",
      ],
    },
  },
};

const SYSTEM = [
  "You read research documents and extract a structured profile of the work.",
  "Ground every field in the document. If the document does not say something, infer the most",
  "defensible answer from what it does say rather than inventing specifics.",
  `Always answer by calling the ${TOOL_NAME} function.`,
].join(" ");

export async function extractProfile(sources: Source[], instruction: string) {
  const documents = toPromptText(sources);
  if (!documents) throw new Error("No readable document to process");

  const ask = instruction
    ? `${documents}\n\nExtract the profile of the document(s) above. The person who submitted them added: "${instruction}"`
    : `${documents}\n\nExtract the profile of the document(s) above.`;

  const completion = await chat({
    max_tokens: 2000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: ask },
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: TOOL_NAME } },
  });

  const call = completion.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== "function") throw new Error("The model did not return a profile");

  let profile: Profile;
  try {
    profile = JSON.parse(call.function.arguments) as Profile;
  } catch {
    throw new Error("The model returned a profile that was not valid JSON");
  }

  return {
    profile,
    model: completion.model,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}
