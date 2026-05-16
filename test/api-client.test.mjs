import assert from "node:assert/strict";
import test from "node:test";
import { XAccelApiClient, normalizeManifest } from "../src/api-client.mjs";
import { readConfig } from "../src/config.mjs";
import { jsonSchemaToZod } from "../src/json-schema-to-zod.mjs";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function createFetchStub(response) {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return typeof response === "function" ? response(...args) : response;
  };

  return { calls, fetchImpl };
}

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

test("readConfig validates required env and trims trailing slashes", () => {
  assert.deepEqual(
    readConfig({
      X_ACCEL_BASE_URL: "https://x-accel.test///",
      X_ACCEL_MCP_TOKEN: "test-token",
    }),
    {
      baseUrl: "https://x-accel.test",
      token: "test-token",
    }
  );

  assert.throws(
    () => readConfig({ X_ACCEL_BASE_URL: "https://x-accel.test" }),
    /X_ACCEL_MCP_TOKEN is required/
  );
});

test("normalizeManifest preserves tools and backfills legacy server metadata", () => {
  const manifest = normalizeManifest({
    name: "legacy-x-accel",
    version: "1.2.3",
    tools: [
      {
        name: "x_accel_lookup_post",
        title: "Lookup Post",
      },
    ],
  });

  assert.equal(manifest.server.name, "legacy-x-accel");
  assert.equal(manifest.server.version, "1.2.3");
  assert.deepEqual(manifest.tools, [
    {
      name: "x_accel_lookup_post",
      title: "Lookup Post",
      description: undefined,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ]);
});

test("invokeTool posts the tool name and arguments to the invoke endpoint", async () => {
  const { calls, fetchImpl } = createFetchStub(jsonResponse({
    content: [{ type: "text", text: "ok" }],
  }));
  const client = new XAccelApiClient({
    baseUrl: "https://x-accel.test",
    token: "secret-token",
    fetchImpl,
  });

  const result = await client.invokeTool("x_accel_status", { limit: 5 });

  assert.deepEqual(result, { content: [{ type: "text", text: "ok" }] });
  assert.equal(calls[0][0], "https://x-accel.test/api/mcp/v1/invoke");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers.authorization, "Bearer secret-token");
  assert.equal(calls[0][1].headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    tool: "x_accel_status",
    arguments: { limit: 5 },
  });
});

test("request errors redact the MCP token if the server echoes it", async () => {
  const { fetchImpl } = createFetchStub(jsonResponse({
    error: "bad token secret-token",
  }, { status: 401 }));
  const client = new XAccelApiClient({
    baseUrl: "https://x-accel.test",
    token: "secret-token",
    fetchImpl,
  });

  await assert.rejects(
    () => client.fetchManifest(),
    (error) => {
      assert.match(error.message, /x-accel request failed \(401\): bad token \[REDACTED\]/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    }
  );
});
