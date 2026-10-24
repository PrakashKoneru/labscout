import { chat } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Reply with one short sentence confirming you are reachable.";

    const completion = await chat({
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    return Response.json({
      model: completion.model,
      text: completion.choices[0]?.message?.content ?? "",
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
