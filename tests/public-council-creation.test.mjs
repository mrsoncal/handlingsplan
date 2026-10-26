import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../functions/handlingsplan-api.ts", import.meta.url), "utf8");
const testSource = stripTypeScriptTypes(source.replace(
  /^import \{ createAdminClient \} from "npm:@insforge\/sdk";\r?\n/,
  "const createAdminClient = globalThis.__testCreateAdminClient;\n",
));

let insertedCouncil = null;
globalThis.Deno = {
  env: { get: (key) => ({ INSFORGE_BASE_URL: "https://example.insforge.app", API_KEY: "test-api-key", JWT_SECRET: "test-signing-secret" })[key] },
};
globalThis.__testCreateAdminClient = () => ({
  database: {
    from(table) {
      assert.equal(table, "councils");
      return {
        insert(rows) {
          insertedCouncil = rows[0];
          return {
            select() {
              return {
                async single() {
                  return { data: { id: 42, ...insertedCouncil, created_at: "2026-10-23T00:00:00Z" }, error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: { id: 42, password_hash: "hash", password_salt: "salt" }, error: null }; } };
            },
          };
        },
      };
    },
  },
});

const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(testSource).toString("base64")}`);
const request = (body) => new Request("https://example.test/?route=/api/ungdomsrad", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("anyone can create a page without a global admin token", async () => {
  const response = await handler(request({ name: "Skien vgs", password: "secret passphrase" }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).name, "Skien vgs");
  assert.equal(insertedCouncil.name, "Skien vgs");
  assert.notEqual(insertedCouncil.password_hash, "secret passphrase");
  assert.ok(insertedCouncil.password_salt);
});

test("public creation validates name and password", async () => {
  assert.equal((await handler(request({ name: " ", password: "secret passphrase" }))).status, 400);
  assert.equal((await handler(request({ name: "Valid", password: "short" }))).status, 400);
  assert.equal((await handler(request({ name: "X".repeat(121), password: "secret passphrase" }))).status, 400);
});

test("global-admin deletion remains protected", async () => {
  const response = await handler(new Request("https://example.test/?route=/api/ungdomsrad/42", { method: "DELETE" }));
  assert.equal(response.status, 401);
});
