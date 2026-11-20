const API_ORIGIN = "https://nexus-analytics-api.bhupendrasinghdeora24.workers.dev";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`, API_ORIGIN);

  const headers = new Headers();
  for (const name of ["content-type", "cookie", "x-hub-request", "origin", "authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "set-cookie", "cache-control"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "NEXUS API upstream is unavailable." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const OPTIONS = proxy;
