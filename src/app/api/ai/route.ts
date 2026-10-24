import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/anthropic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Reply with one short sentence confirming you are reachable.";

    const message = await getAnthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return Response.json({ model: ANTHROPIC_MODEL, text });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
