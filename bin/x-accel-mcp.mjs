#!/usr/bin/env node

import { startServer } from "../src/index.mjs";

startServer().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
