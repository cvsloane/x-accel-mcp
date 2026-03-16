import { z } from "zod";

const envSchema = z.object({
  X_ACCEL_BASE_URL: z.url({ error: "X_ACCEL_BASE_URL must be a valid URL" }),
  X_ACCEL_MCP_TOKEN: z.string().trim().min(1, "X_ACCEL_MCP_TOKEN is required"),
});

export function readConfig(env = process.env) {
  const result = envSchema.safeParse({
    X_ACCEL_BASE_URL: env.X_ACCEL_BASE_URL,
    X_ACCEL_MCP_TOKEN: env.X_ACCEL_MCP_TOKEN,
  });

  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  }

  return {
    baseUrl: result.data.X_ACCEL_BASE_URL.replace(/\/+$/, ""),
    token: result.data.X_ACCEL_MCP_TOKEN,
  };
}
