# x-accel MCP client

`@cvsloane/x-accel-mcp` is a thin local MCP server. It does not talk to Postgres, X, or OpenRouter directly. It connects to an `x-accel` SaaS deployment over HTTPS, loads the tool manifest, and forwards tool calls with a bearer token.

## Requirements

- Node 20+
- An `x-accel` SaaS deployment with MCP endpoints enabled
- An MCP token from the SaaS

Create the token from the `MCP Access` page in your `x-accel` workspace.

## Environment

Set these before starting the client:

- `X_ACCEL_BASE_URL`
- `X_ACCEL_MCP_TOKEN`

Example:

```bash
export X_ACCEL_BASE_URL=https://hgxaccel.com
export X_ACCEL_MCP_TOKEN=your_mcp_token
```

## Claude Code

```bash
claude mcp add \
  -e X_ACCEL_BASE_URL=https://hgxaccel.com \
  -e X_ACCEL_MCP_TOKEN=your_mcp_token \
  x-accel \
  -- npx -y @cvsloane/x-accel-mcp
```

## Codex

```bash
codex mcp add x-accel \
  --env X_ACCEL_BASE_URL=https://hgxaccel.com \
  --env X_ACCEL_MCP_TOKEN=your_mcp_token \
  -- npx -y @cvsloane/x-accel-mcp
```

## Local run

```bash
X_ACCEL_BASE_URL=https://hgxaccel.com \
X_ACCEL_MCP_TOKEN=your_mcp_token \
npx -y @cvsloane/x-accel-mcp
```

## How it works

1. Fetch `GET /api/mcp/v1/manifest`
2. Register tools dynamically in the local stdio MCP server
3. Forward each tool call to `POST /api/mcp/v1/invoke`

This package intentionally stays thin. All tenant isolation, billing checks, provider access, and business logic remain in the SaaS.
