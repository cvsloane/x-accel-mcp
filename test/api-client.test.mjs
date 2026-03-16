import assert from "node:assert/strict";
import test from "node:test";
import { XAccelApiClient } from "../src/api-client.mjs";
import { jsonSchemaToZod } from "../src/json-schema-to-zod.mjs";

test("fetchManifest normalizes server metadata and sends auth", async () => {
  let requestedUrl;
  let requestedOptions;

  const client = new XAccelApiClient({
    baseUrl: "https://hgxaccel.com/",
    token: "token_123",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;

      return new Response(
        JSON.stringify({
          name: "x-accel",
          version: "1.2.3",
          tools: [
            {
              name: "x_accounts_list",
              description: "List accounts",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    },
  });

  const manifest = await client.fetchManifest();

  assert.equal(requestedUrl, "https://hgxaccel.com/api/mcp/v1/manifest");
  assert.equal(requestedOptions.method, "GET");
  assert.equal(requestedOptions.headers.authorization, "Bearer token_123");
  assert.equal(manifest.server.name, "x-accel");
  assert.equal(manifest.server.version, "1.2.3");
  assert.equal(manifest.tools.length, 1);
  assert.equal(manifest.tools[0].name, "x_accounts_list");
});

test("fetchManifest tolerates null inputSchema values", async () => {
  const client = new XAccelApiClient({
    baseUrl: "https://hgxaccel.com/",
    token: "token_123",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          server: {
            name: "x-accel",
            version: "1.0.0",
          },
          tools: [
            {
              name: "x_accounts_list",
              description: "List accounts",
              inputSchema: null,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      ),
  });

  const manifest = await client.fetchManifest();

  assert.equal(manifest.tools[0].inputSchema.type, "object");
  assert.deepEqual(manifest.tools[0].inputSchema.properties, {});
});

test("jsonSchemaToZod validates required and optional tool args", () => {
  const schema = jsonSchemaToZod({
    type: "object",
    properties: {
      account: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1 },
      period: { enum: ["daily", "monthly", "both"] },
    },
    required: ["account"],
    additionalProperties: false,
  });

  assert.equal(schema.safeParse({ account: "csloane", limit: 5, period: "daily" }).success, true);
  assert.equal(schema.safeParse({ limit: 5 }).success, false);
  assert.equal(schema.safeParse({ account: "csloane", limit: 0 }).success, false);
  assert.equal(schema.safeParse({ account: "csloane", extra: true }).success, false);
});

test("jsonSchemaToZod handles single-value non-string enums", () => {
  const schema = jsonSchemaToZod({
    enum: [1],
  });

  assert.equal(schema.safeParse(1).success, true);
  assert.equal(schema.safeParse(2).success, false);
});
