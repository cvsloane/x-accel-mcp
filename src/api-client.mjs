import { z } from "zod";

const jsonSchemaSchema = z.object({}).passthrough();

const manifestToolSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    inputSchema: jsonSchemaSchema.nullish(),
  })
  .passthrough();

const rawManifestSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    server: z
      .object({
        name: z.string().min(1),
        version: z.string().optional(),
      })
      .passthrough()
      .optional(),
    tools: z.array(manifestToolSchema).default([]),
  })
  .passthrough();

function normalizeManifest(rawManifest) {
  const parsed = rawManifestSchema.parse(rawManifest);
  const server = parsed.server ?? {
    name: parsed.name ?? "x-accel",
    version: parsed.version ?? "0.0.0",
  };

  return {
    server: {
      name: server.name,
      version: server.version ?? "0.0.0",
    },
    tools: parsed.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema ?? {
        type: "object",
        properties: {},
      },
    })),
  };
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatErrorBody(body) {
  if (typeof body === "string") {
    return body;
  }

  if (body && typeof body === "object") {
    if (typeof body.error === "string") {
      return body.error;
    }

    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }

    return JSON.stringify(body);
  }

  return "Unknown error";
}

export class XAccelApiClient {
  constructor({ baseUrl, token, fetchImpl = fetch, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async fetchManifest() {
    const manifest = await this.#request("/api/mcp/v1/manifest", {
      method: "GET",
    });

    return normalizeManifest(manifest);
  }

  async invokeTool(tool, args = {}) {
    return this.#request("/api/mcp/v1/invoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tool,
        arguments: args,
      }),
    });
  }

  async #request(path, init) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new Error(`x-accel request failed (${response.status}): ${formatErrorBody(body)}`);
    }

    return body;
  }
}

export { normalizeManifest };
