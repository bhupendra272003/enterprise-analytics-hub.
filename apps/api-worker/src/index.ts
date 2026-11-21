import { handleOrganizations } from "./organizations";
import { handleProjects } from "./projects";
import { handleInvitations } from "./invitations";
import { handleNotifications } from "./notifications";
import { handleDatasets } from "./datasets";
import datasetJobs, { handleDatasetJobs } from "./dataset-jobs";
import { handleReports } from "./reports";
import { handleTeams } from "./teams";
import { handlePerformance } from "./performance";

interface Env {
  DB: D1Database;
  DATASETS: KVNamespace;
  DATASET_JOBS: Queue<{ jobId: string }>;
  APP_ORIGIN: string;
  SESSION_TTL_SECONDS?: string;
  MAIL_API_KEY?: string;
  MAIL_FROM?: string;
}

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  account_status: string;
  email_verified_at: string | null;
};

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, b => b.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
};

const cookieValue = (request: Request, name: string) => {
  const header = request.headers.get("Cookie") || "";
  const entry = header.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
};

const sessionCookie = (value: string, maxAge: number) =>
  `hub.sid=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;

const clearSessionCookie = () =>
  "hub.sid=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0";

// Cloudflare Workers WebCrypto supports PBKDF2 iteration counts up to 100,000.
const PASSWORD_ITERATIONS = 100000;
const passwordHash = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  const hex = (value: Uint8Array) => Array.from(value, b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
};
const verifyPassword = async (password: string, encoded: string) => {
  const [scheme, rounds, saltHex, expectedHex] = encoded.split("$");
  if (scheme !== "pbkdf2-sha256" || !/^\d+$/.test(rounds || "") || !/^[a-f0-9]{32}$/.test(saltHex || "") || !/^[a-f0-9]{64}$/.test(expectedHex || "")) return false;
  const iterations = Number(rounds);
  if (iterations !== 100000) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(v => parseInt(v, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
  const expected = expectedHex.match(/.{2}/g)!.map(v => parseInt(v, 16));
  return bits.length === expected.length && bits.reduce((diff, value, index) => diff | (value ^ expected[index]), 0) === 0;
};

const validEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function sendMail(env: Env, to: string, subject: string, text: string) {
  if (!env.MAIL_API_KEY || !env.MAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text })
  });
  if (!response.ok) throw new Error("Email delivery provider rejected the message.");
  return true;
}

async function createToken(env: Env, userId: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  const token = randomToken();
  const expires = purpose === "EMAIL_VERIFY" ? "+1 day" : "+1 hour";
  await env.DB.batch([
    env.DB.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND purpose = ? AND used_at IS NULL").bind(userId, purpose),
    env.DB.prepare("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,datetime('now', ?))")
      .bind(crypto.randomUUID(), userId, await sha256(token), purpose, expires)
  ]);
  return token;
}

async function createAudit(env: Env, userId: string, action: string, ip: string | null) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,ip_address) VALUES (NULL,?,?, 'USER', ?, ?)"
  ).bind(userId, action, userId, ip).run();
}

async function getSessionUser(request: Request, env: Env): Promise<UserRow | null> {
  const sid = cookieValue(request, "hub.sid");
  if (!sid) return null;
  const row = await env.DB.prepare(
    "SELECT u.id,u.full_name,u.email,u.password_hash,u.account_status,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at > unixepoch() LIMIT 1"
  ).bind(sid).first<UserRow>();
  return row || null;
}

async function authRateLimit(request: Request, env: Env, route: string, email: string) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(route + "|" + email + "|" + ip);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS attempts FROM auth_attempts WHERE bucket_key=? AND created_at > datetime('now','-15 minutes')"
  ).bind(key).first<{ attempts: number }>();
  if ((row?.attempts || 0) >= 20) return false;
  await env.DB.prepare("INSERT INTO auth_attempts (bucket_key) VALUES (?)").bind(key).run();
  return true;
}

async function handleAuth(request: Request, env: Env, path: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP");
  if (request.method === "GET" && path === "/me") {
    const user = await getSessionUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const { results: organizations } = await env.DB.prepare(
      "SELECT o.id AS organizationId,o.name AS organizationName,m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? AND m.membership_status='ACTIVE'"
    ).bind(user.id).all();
    const platformAdmin = await env.DB.prepare("SELECT role FROM platform_admins WHERE user_id=? LIMIT 1").bind(user.id).first<{role:string}>();
    return json({ user: { id: user.id, fullName: user.full_name, email: user.email, status: user.account_status, emailVerified: !!user.email_verified_at, platformRole: platformAdmin?.role ?? "USER" }, organizations });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body." }, 400); }

  if (path === "/register") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (fullName.length < 2 || fullName.length > 120 || !validEmail(email) || password.length < 12 || password.length > 128)
      return json({ error: "Enter a valid name, email and password of 12–128 characters." }, 400);
    if (!await authRateLimit(request, env, "register", email)) return json({ error: "Too many attempts. Try again later." }, 429);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (existing) return json({ error: "An account with this email already exists." }, 409);
    const id = crypto.randomUUID();
    const encodedPassword = await passwordHash(password);
    await env.DB.prepare("INSERT INTO users (id,full_name,email,password_hash,account_status) VALUES (?,?,?,?,'PENDING')")
      .bind(id, fullName, email, encodedPassword).run();
    const token = await createToken(env, id, "EMAIL_VERIFY");
    const url = env.APP_ORIGIN + "/verify-email?token=" + encodeURIComponent(token);
    let sent = false;
    try { sent = await sendMail(env, email, "Verify your Bhupendra's Vyron email", `Hello ${fullName},\n\nVerify your email: ${url}\n\nThis link expires in 24 hours.`); }
    catch { await env.DB.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='EMAIL_VERIFY' AND used_at IS NULL").bind(id).run(); await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run(); return json({ error: "Email delivery failed. Please try again later." }, 503); }
    if (!sent) return json({ error: "Email delivery is not configured yet. Registration is temporarily unavailable." }, 503);
    await createAudit(env, id, "USER_REGISTERED", ip);
    return json({ message: "Registration received. Check your email to verify your account before signing in.", userId: id }, 201);
  }

  if (path === "/login") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || !password || password.length > 128) return json({ error: "Invalid email or password." }, 400);
    if (!await authRateLimit(request, env, "login", email)) return json({ error: "Too many attempts. Try again later." }, 429);
    const user = await env.DB.prepare("SELECT id,full_name,email,password_hash,account_status,email_verified_at FROM users WHERE email=? LIMIT 1").bind(email).first<UserRow>();
    if (!user || !await verifyPassword(password, user.password_hash)) return json({ error: "Invalid email or password." }, 401);
    if (user.account_status === "SUSPENDED") return json({ error: "This account has been suspended." }, 403);
    if (!user.email_verified_at) return json({ error: "Verify your email before signing in. You can request a new verification link." }, 403);
    const sid = randomToken();
    const ttl = Math.max(900, Math.min(Number(env.SESSION_TTL_SECONDS || 28800), 28800));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id=? OR expires_at <= unixepoch()").bind(user.id),
      env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,unixepoch()+?)").bind(sid, user.id, ttl)
    ]);
    await createAudit(env, user.id, "USER_LOGIN", ip);
    return json({ message: "Login successful." }, 200, { "set-cookie": sessionCookie(sid, ttl) });
  }

  if (path === "/logout") {
    const sid = cookieValue(request, "hub.sid");
    const user = await getSessionUser(request, env);
    if (!sid || !user) return json({ error: "Authentication required." }, 401, { "set-cookie": clearSessionCookie() });
    await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
    await createAudit(env, user.id, "USER_LOGOUT", ip);
    return json({ message: "Logged out." }, 200, { "set-cookie": clearSessionCookie() });
  }

  if (path === "/verify-email") {
    const token = typeof body.token === "string" ? body.token : "";
    if (token.length < 32 || token.length > 256) return json({ error: "Verification link is invalid or expired." }, 400);
    const hash = await sha256(token);
    const row = await env.DB.prepare("SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND purpose='EMAIL_VERIFY' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(hash).first<{id:string;user_id:string}>();
    if (!row) return json({ error: "Verification link is invalid or expired." }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.user_id),
      env.DB.prepare("UPDATE auth_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL").bind(row.id)
    ]);
    await createAudit(env, row.user_id, "EMAIL_VERIFIED", ip);
    return json({ message: "Email verified. You can now sign in; organization access may still require approval." });
  }

  if (path === "/resend-verification") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
    if (!await authRateLimit(request, env, "resend", email)) return json({ error: "Too many attempts. Try again later." }, 429);
    const user = await env.DB.prepare("SELECT id,full_name,email_verified_at FROM users WHERE email=? LIMIT 1").bind(email).first<{id:string;full_name:string;email_verified_at:string|null}>();
    if (!user || user.email_verified_at) return json({ message: "If the account needs verification, a new link has been sent." });
    const token = await createToken(env, user.id, "EMAIL_VERIFY");
    const url = env.APP_ORIGIN + "/verify-email?token=" + encodeURIComponent(token);
    try {
      const sent = await sendMail(env, email, "Your Bhupendra's Vyron verification link", `Verify your email: ${url}\n\nThis link expires in 24 hours.`);
      if (!sent) return json({ error: "Email delivery is not configured yet." }, 503);
    } catch { return json({ error: "Email delivery failed. Please try again later." }, 503); }
    return json({ message: "If the account needs verification, a new link has been sent." });
  }

  if (path === "/forgot-password") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
    if (!await authRateLimit(request, env, "forgot", email)) return json({ error: "Too many attempts. Try again later." }, 429);
    const user = await env.DB.prepare("SELECT id FROM users WHERE email=? LIMIT 1").bind(email).first<{id:string}>();
    if (!user) return json({ message: "If an account exists for that email, a reset link has been sent." });
    const token = await createToken(env, user.id, "PASSWORD_RESET");
    const url = env.APP_ORIGIN + "/reset-password?token=" + encodeURIComponent(token);
    try {
      const sent = await sendMail(env, email, "Reset your Bhupendra's Vyron password", `Reset your password: ${url}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`);
      if (!sent) return json({ error: "Password recovery email is not configured yet." }, 503);
    } catch { return json({ error: "Email delivery failed. Please try again later." }, 503); }
    return json({ message: "If an account exists for that email, a reset link has been sent." });
  }

  if (path === "/reset-password") {
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (token.length < 32 || token.length > 256 || password.length < 12 || password.length > 128)
      return json({ error: "Use a valid reset link and a password of 12–128 characters." }, 400);
    const hash = await sha256(token);
    const row = await env.DB.prepare("SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND purpose='PASSWORD_RESET' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(hash).first<{id:string;user_id:string}>();
    if (!row) return json({ error: "Password reset link is invalid or expired." }, 400);
    const encodedPassword = await passwordHash(password);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(encodedPassword, row.user_id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id),
      env.DB.prepare("UPDATE auth_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND purpose='PASSWORD_RESET' AND used_at IS NULL").bind(row.user_id)
    ]);
    await createAudit(env, row.user_id, "PASSWORD_RESET", ip);
    return json({ message: "Password updated. Sign in with your new password." });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    // Restrict browser access to the configured workspace origin and the
    // canonical production workers.dev origin. Normalize trailing slashes.
    const configuredOrigin = env.APP_ORIGIN || "";
    const allowedOrigins = new Set([
      configuredOrigin,
      "https://nexus-analytics-web.bhupendrasinghdeora24.workers.dev"
    ].filter(Boolean));
    const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : null;
    if (request.method === "OPTIONS") {
      if (!allowedOrigin) return new Response("CORS origin denied", { status: 403 });
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Hub-Request",
        "access-control-max-age": "86400",
        "vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      }});
    }
    const headers: Record<string, string> = {};
    if (allowedOrigin) {
      headers["access-control-allow-origin"] = allowedOrigin;
      headers["access-control-allow-credentials"] = "true";
      headers["vary"] = "Origin";
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (!allowedOrigin || request.headers.get("X-Hub-Request") !== "1")
        return json({ error: "Request origin validation failed." }, 403, headers);
    }
    if (url.pathname.startsWith("/api/reports/") || (url.pathname.startsWith("/api/organizations/") && url.pathname.endsWith("/reports"))) {
      const response = await handleReports(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/dataset-jobs/") || (url.pathname.startsWith("/api/datasets/") && url.pathname.includes("/jobs"))) {
      const response = await handleDatasetJobs(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/datasets/") || (url.pathname.startsWith("/api/organizations/") && url.pathname.endsWith("/datasets"))) {
      const response = await handleDatasets(request, env, url.pathname, url);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname === "/api/notifications" || url.pathname.startsWith("/api/notifications/")) {
      const response = await handleNotifications(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/invitations/") || (url.pathname.startsWith("/api/organizations/") && url.pathname.endsWith("/invitations"))) {
      const response = await handleInvitations(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        if (response.headers.has("set-cookie")) merged.set("set-cookie", response.headers.get("set-cookie")!);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/teams/") || (url.pathname.startsWith("/api/organizations/") && url.pathname.endsWith("/teams")) || /^\\/api\\/tasks\\/[^/]+$/.test(url.pathname)) {
      const response = await handleTeams(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (/^\\/api\\/organizations\\/[^/]+\\/performance$/.test(url.pathname)) {
      const response = await handlePerformance(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/projects/") || url.pathname.startsWith("/api/tasks/") || (url.pathname.startsWith("/api/organizations/") && url.pathname.endsWith("/projects"))) {
      const response = await handleProjects(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname === "/api/organizations" || url.pathname.startsWith("/api/organizations/")) {
      const response = await handleOrganizations(request, env, url.pathname);
      if (response) {
        const merged = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return new Response(response.body, { status: response.status, headers: merged });
      }
    }
    if (url.pathname.startsWith("/api/auth/")) {
      const path = url.pathname.slice("/api/auth".length);
      const response = await handleAuth(request, env, path);
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: response.status, headers: merged });
    }
    if (url.pathname === "/health") return json({ status: "ok", service: "bhupendras-vyron-cloudflare-api" }, 200, headers);
    return json({ error: "Not found." }, 404, headers);
  },
  async queue(batch: MessageBatch<{ jobId: string }>, env: Env) {
    await datasetJobs.queue(batch, env);
  }
};
