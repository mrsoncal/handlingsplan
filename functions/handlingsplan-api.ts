import { createAdminClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const bucket = "handlingsplan-files";
const encoder = new TextEncoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
}

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 },
    key,
    256,
  );
  return { salt: hex(salt), hash: hex(hash) };
}

async function verifyPassword(password: string, council: Record<string, unknown>) {
  const candidate = await hashPassword(password, String(council.password_salt));
  const expected = encoder.encode(String(council.password_hash));
  const actual = encoder.encode(candidate.hash);
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index];
  return difference === 0;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function createAdminToken(secret: string) {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  return `${expiresAt}.${await hmac(String(expiresAt), secret)}`;
}

async function isAdminRequest(req: Request, secret: string) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  return signature === await hmac(expiresAt, secret);
}

function publicCouncil(council: Record<string, unknown>) {
  return {
    id: council.id,
    name: council.name,
    display_name: council.display_name || council.name,
    year: council.year,
    created_at: council.created_at,
    has_handlingsplan: Boolean(council.handlingsplan_key),
    has_logo: Boolean(council.logo_key),
    logo_version: council.logo_key
      ? String(council.logo_key).split("/").pop()
      : null,
  };
}

function apiRoute(req: Request) {
  const url = new URL(req.url);
  const explicitRoute = url.searchParams.get("route") || req.headers.get("X-API-Route");
  if (explicitRoute) return explicitRoute;
  const marker = "/handlingsplan-api";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) || "/" : url.pathname;
}

function cleanFilename(value: string) {
  return value.replace(/[\r\n"]/g, "_");
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) return json({ error: "Backend-konfigurasjon mangler." }, 503);

  const admin = createAdminClient({ baseUrl, apiKey });
  const route = apiRoute(req).replace(/\/$/, "") || "/";
  const segments = route.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && route === "/health") {
      return json({ status: "ok", message: "Handlingsplan API is running" });
    }

    if (req.method === "POST" && route === "/api/admin/login") {
      const configuredPassword = Deno.env.get("HANDLINGSPLAN_ADMIN_PASSWORD");
      if (!configuredPassword) return json({ error: "Globalt admin-passord er ikke konfigurert." }, 503);
      const body = await req.json();
      if (!body.password || body.password !== configuredPassword) return json({ error: "Feil passord." }, 401);
      const signingSecret = Deno.env.get("JWT_SECRET") || apiKey;
      return json({ token: await createAdminToken(signingSecret) });
    }

    if (segments[0] !== "api" || segments[1] !== "ungdomsrad") {
      return json({ error: "Endepunkt ikke funnet." }, 404);
    }

    if (segments.length === 2 && req.method === "GET") {
      const { data, error } = await admin.database
        .from("councils")
        .select("id,name,display_name,year,created_at,logo_key,handlingsplan_key")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return json((data || []).map((council) => publicCouncil(council)));
    }

    if (segments.length === 2 && req.method === "POST") {
      const body = await req.json();
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const password = typeof body.password === "string" ? body.password.trim() : "";
      if (!name) return json({ error: "Feltet 'name' er påkrevd." }, 400);
      if (password.length < 6) return json({ error: "Passordet må ha minst 6 tegn." }, 400);
      const passwordData = await hashPassword(password);
      const { data, error } = await admin.database.from("councils").insert([{
        name,
        display_name: name,
        year: String(new Date().getFullYear()),
        password_salt: passwordData.salt,
        password_hash: passwordData.hash,
      }]).select("id,name,display_name,year,created_at,logo_key,handlingsplan_key").single();
      if (error) throw error;
      return json(publicCouncil(data), 201);
    }

    const councilId = Number(segments[2]);
    if (!Number.isInteger(councilId) || councilId < 1) return json({ error: "Ugyldig ungdomsråd-ID." }, 400);

    const { data: council, error: councilError } = await admin.database
      .from("councils")
      .select("*")
      .eq("id", councilId)
      .maybeSingle();
    if (councilError) throw councilError;
    if (!council) return json({ error: "Ungdomsråd ikke funnet." }, 404);

    if (segments.length === 3 && req.method === "GET") {
      const { data: themes, error } = await admin.database
        .from("council_tema")
        .select("id,name,color,allow_add,allow_change,allow_remove,position")
        .eq("council_id", councilId)
        .order("position", { ascending: true })
        .limit(100);
      if (error) throw error;
      return json({
        ...publicCouncil(council),
        temaer: (themes || []).map((theme) => ({
          id: theme.id,
          name: theme.name,
          color: theme.color,
          allowAdd: theme.allow_add,
          allowChange: theme.allow_change,
          allowRemove: theme.allow_remove,
          position: theme.position,
        })),
      });
    }

    if (segments.length === 3 && req.method === "DELETE") {
      const signingSecret = Deno.env.get("JWT_SECRET") || apiKey;
      if (!await isAdminRequest(req, signingSecret)) return json({ error: "Ikke autorisert." }, 401);
      const { error } = await admin.database.from("councils").delete().eq("id", councilId);
      if (error) throw error;
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (segments[3] === "innspill" && segments.length === 4 && req.method === "GET") {
      const { data, error } = await admin.database
        .from("innspill")
        .select("id,council_id,created_at,updated_at,action_type,tema,punkt_nr,underpunkt_nr,formuler_punkt,endre_fra,endre_til,status")
        .eq("council_id", councilId)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return json({ items: data || [] });
    }

    if (segments[3] === "innspill" && segments.length === 4 && req.method === "POST") {
      const body = await req.json();
      const actionType = body.actionType;
      const tema = typeof body.tema === "string" ? body.tema.trim() : "";
      const punktNr = Number(body.punktNr);
      if (!["add", "change", "remove"].includes(actionType) || !tema || !Number.isInteger(punktNr) || punktNr < 1) {
        return json({ error: "actionType, tema og et gyldig punktNr er påkrevd." }, 400);
      }
      const { data, error } = await admin.database.from("innspill").insert([{
        council_id: councilId,
        action_type: actionType,
        tema,
        punkt_nr: punktNr,
        underpunkt_nr: body.underpunktNr ? Number(body.underpunktNr) : null,
        formuler_punkt: body.nyttPunkt || null,
        endre_fra: body.endreFra || null,
        endre_til: body.endreTil || null,
      }]).select().single();
      if (error) throw error;
      return json(data, 201);
    }

    if (segments[3] === "innspill" && segments.length === 5 && ["PUT", "DELETE"].includes(req.method)) {
      const innspillId = Number(segments[4]);
      const body = await req.json();
      if (!await verifyPassword(String(body.password || ""), council)) {
        return json({ error: "Feil passord for dette ungdomsrådet." }, 403);
      }
      if (req.method === "DELETE") {
        const { error } = await admin.database.from("innspill").delete()
          .eq("id", innspillId).eq("council_id", councilId);
        if (error) throw error;
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      const changes: Record<string, unknown> = {};
      if ("tema" in body) changes.tema = body.tema || null;
      if ("punktNr" in body) changes.punkt_nr = body.punktNr ? Number(body.punktNr) : null;
      if ("underpunktNr" in body) changes.underpunkt_nr = body.underpunktNr ? Number(body.underpunktNr) : null;
      if ("formulerPunkt" in body) changes.formuler_punkt = body.formulerPunkt || null;
      if ("endreFra" in body) changes.endre_fra = body.endreFra || null;
      if ("endreTil" in body) changes.endre_til = body.endreTil || null;
      if ("status" in body) changes.status = body.status;
      const { data, error } = await admin.database.from("innspill").update(changes)
        .eq("id", innspillId).eq("council_id", councilId).select().maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Innspill ikke funnet." }, 404);
      return json(data);
    }

    if (segments[3] === "admin-config" && req.method === "POST") {
      const body = await req.json();
      if (!await verifyPassword(String(body.password || ""), council)) {
        return json({ error: "Feil passord for dette ungdomsrådet." }, 403);
      }
      if (typeof body.displayName === "string") {
        const { error } = await admin.database.from("councils")
          .update({ display_name: body.displayName.trim() || council.name }).eq("id", councilId);
        if (error) throw error;
      }
      if (Array.isArray(body.temaer)) {
        const { error: deleteError } = await admin.database.from("council_tema").delete().eq("council_id", councilId);
        if (deleteError) throw deleteError;
        const themes = body.temaer.map((theme: Record<string, unknown>, index: number) => ({
          council_id: councilId,
          name: String(theme.name || "").trim(),
          color: theme.color || null,
          allow_add: theme.allowAdd !== false,
          allow_change: theme.allowChange !== false,
          allow_remove: theme.allowRemove !== false,
          position: typeof theme.position === "number" ? theme.position : index,
        })).filter((theme: Record<string, unknown>) => theme.name);
        if (themes.length) {
          const { error } = await admin.database.from("council_tema").insert(themes);
          if (error) throw error;
        }
      }
      const refreshed = await admin.database.from("councils").select("*").eq("id", councilId).single();
      if (refreshed.error) throw refreshed.error;
      const refreshedThemes = await admin.database.from("council_tema").select("id,name,color,allow_add,allow_change,allow_remove,position")
        .eq("council_id", councilId).order("position", { ascending: true }).limit(100);
      if (refreshedThemes.error) throw refreshedThemes.error;
      return json({
        ...publicCouncil(refreshed.data),
        temaer: (refreshedThemes.data || []).map((theme) => ({
          id: theme.id, name: theme.name, color: theme.color, allowAdd: theme.allow_add,
          allowChange: theme.allow_change, allowRemove: theme.allow_remove, position: theme.position,
        })),
      });
    }

    const fileKind = segments[3] === "logo" || segments[3] === "logo-file"
      ? "logo"
      : segments[3] === "handlingsplan" || segments[3] === "handlingsplan-file"
      ? "handlingsplan"
      : null;

    if (fileKind && segments[3].endsWith("-file") && req.method === "GET") {
      const key = council[`${fileKind}_key`] as string | null;
      if (!key) return new Response("Ingen fil funnet.", { status: 404, headers: corsHeaders });
      const etag = `"${key.split("/").pop()}"`;
      if (fileKind === "logo" && req.headers.get("If-None-Match") === etag) {
        return new Response(null, {
          status: 304,
          headers: { ...corsHeaders, ETag: etag, "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
      const { data, error } = await admin.storage.from(bucket).download(key);
      if (error || !data) throw error || new Error("File download failed");
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", String(council[`${fileKind}_mime_type`] || "application/octet-stream"));
      headers.set("Content-Disposition", `inline; filename="${cleanFilename(String(council[`${fileKind}_original_name`] || fileKind))}"`);
      if (fileKind === "logo") {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("ETag", etag);
      }
      return new Response(data, { status: 200, headers });
    }

    if (fileKind && req.method === "POST") {
      const form = await req.formData();
      if (!await verifyPassword(String(form.get("password") || ""), council)) {
        return json({ error: "Feil passord for dette ungdomsrådet." }, 403);
      }
      const file = form.get(fileKind);
      if (!(file instanceof File)) return json({ error: "Ingen fil lastet opp." }, 400);
      if (file.size > 10 * 1024 * 1024) return json({ error: "Filen kan ikke være større enn 10 MB." }, 400);
      if (fileKind === "logo" && !file.type.startsWith("image/")) return json({ error: "Logoen må være et bilde." }, 400);
      if (fileKind === "handlingsplan" && file.type !== "application/pdf") return json({ error: "Handlingsplanen må være en PDF." }, 400);
      const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "")}` : "";
      const key = `councils/${councilId}/${fileKind}-${crypto.randomUUID()}${extension}`;
      const upload = await admin.storage.from(bucket).upload(key, file);
      if (upload.error || !upload.data) throw upload.error || new Error("File upload failed");
      const oldKey = council[`${fileKind}_key`] as string | null;
      const { error } = await admin.database.from("councils").update({
        [`${fileKind}_key`]: upload.data.key,
        [`${fileKind}_url`]: upload.data.url,
        [`${fileKind}_mime_type`]: file.type,
        [`${fileKind}_original_name`]: file.name,
      }).eq("id", councilId);
      if (error) throw error;
      if (oldKey) await admin.storage.from(bucket).remove(oldKey);
      const refreshed = await admin.database.from("councils").select("*").eq("id", councilId).single();
      if (refreshed.error) throw refreshed.error;
      return json(publicCouncil(refreshed.data));
    }

    return json({ error: "Endepunkt ikke funnet." }, 404);
  } catch (error) {
    console.error("Handlingsplan API error", error);
    return json({ error: "Det oppstod en feil i backend." }, 500);
  }
}