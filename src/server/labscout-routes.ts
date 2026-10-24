type LabscoutRequest = { method: string; url: string; body: unknown };

type LabscoutResponse = {
  status: (code: number) => LabscoutResponse;
  setHeader: (name: string, value: string) => LabscoutResponse;
  json: (body: unknown) => void;
  end: (body?: string) => void;
};

type LabscoutHandler = (req: LabscoutRequest, res: LabscoutResponse) => Promise<void> | void;

export async function invokeLabscout(handler: LabscoutHandler, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  let statusCode = 200;
  const headers = new Headers();
  let payload: unknown;
  let ended = false;
  const res: LabscoutResponse = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(name, value) {
      headers.set(name, value);
      return res;
    },
    json(body) {
      payload = body;
      ended = true;
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    },
    end(body) {
      if (body !== undefined) payload = body;
      ended = true;
    },
  };
  try {
    await handler({ method: request.method, url: `${url.pathname}${url.search}`, body: raw }, res);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Request failed";
    return Response.json({ error: message }, { status: 500 });
  }
  if (!ended || payload == null || typeof payload === "string") {
    return new Response(typeof payload === "string" ? payload : null, { status: statusCode, headers });
  }
  return Response.json(payload, { status: statusCode, headers });
}
