import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
export async function OPTIONS(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`, "https://nexus-analytics-api.internal");

  let env: Record<string, unknown>;
  try {
    const cloudflare = await getCloudflareContext({ async: true });
    env = cloudflare.env as unknown as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Cloudflare runtime context is unavailable." }, { status: 502 });
  }

  const api = env.API as { fetch?: (request: Request) => Promise<Response> } | undefined;
  if (!api || typeof api.fetch !== "function") {
    return Response.json({ error: "NEXUS API service binding is missing from the deployed frontend Worker." }, { status: 502 });
  }

  try {
    return await api.fetch(new Request(target, request));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "NEXUS API service request failed.", diagnostic: detail.slice(0, 240) }, { status: 502 });
  }
}
