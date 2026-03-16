import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config.mjs";
import { XAccelApiClient } from "./api-client.mjs";
import { jsonSchemaToZod } from "./json-schema-to-zod.mjs";

function toInputSchema(inputSchema) {
  const schema = inputSchema ?? {
    type: "object",
    properties: {},
  };

  return jsonSchemaToZod(schema);
}

export async function startServer(options = {}) {
  const config = readConfig(options.env);
  const client = new XAccelApiClient({
    baseUrl: config.baseUrl,
    token: config.token,
    fetchImpl: options.fetchImpl,
  });
  const manifest = await client.fetchManifest();
  const server = new McpServer({
    name: manifest.server.name,
    version: manifest.server.version,
  });

  for (const tool of manifest.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: toInputSchema(tool.inputSchema),
      },
      async (args = {}) => client.invokeTool(tool.name, args)
    );
  }

  const transport = options.transport ?? new StdioServerTransport();
  await server.connect(transport);
  console.error(`x-accel MCP bridge running on stdio for ${manifest.server.name}`);

  return {
    client,
    manifest,
    server,
    transport,
  };
}
