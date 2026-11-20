import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
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

  try {
    const { env } = getCloudflareContext();
    const upstreamRequest = new Request(target, request);
    return await env.API.fetch(upstreamRequest);
  } catch {
    return Response.json({ error: "NEXUS API service binding is unavailable." }, { status: 502 });
  }
}
