import type { Profile } from "@/lib/extract";

const SPONSORS = ["National Science Foundation", "Department of Energy", "ARPA-E", "Wellcome Leap"];

/**
 * Stand-in for the real matching API. It echoes the extracted profile back as
 * plausible-looking matches so the pipeline can be exercised end to end.
 * Replace the body of this handler, or point `/api/intake` at the real
 * endpoint, once the upstream service is settled.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const profile = body?.profile as Profile | undefined;

  if (!profile) {
    return Response.json({ error: "Expected a profile in the request body" }, { status: 400 });
  }

  const keywords = Array.isArray(profile.keywords) ? profile.keywords : [];

  const matches = keywords.slice(0, 4).map((keyword, index) => ({
    id: `dummy-${index + 1}`,
    name: `${keyword} program`,
    sponsor: SPONSORS[index % SPONSORS.length],
    amount: 250_000 + index * 125_000,
    deadline: new Date(Date.now() + (index + 1) * 30 * 86_400_000).toISOString().slice(0, 10),
    fit: Math.max(60, 95 - index * 7),
    why: `Matched on "${keyword}" against a ${profile.stage}-stage effort in ${profile.field}.`,
  }));

  return Response.json({
    provider: "dummy",
    receivedAt: new Date().toISOString(),
    echo: { field: profile.field, stage: profile.stage, keywordCount: keywords.length },
    matches,
  });
}
