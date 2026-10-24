import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { env } from "./config/env.ts";
import { createDatabase } from "./db/client.ts";
import { createApp } from "./app.ts";

await mkdir(dirname(env.DATABASE_PATH), { recursive: true });
const { client, db } = createDatabase(env.DATABASE_PATH);
const app = createApp(db);
const server = app.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`API listening on http://${env.API_HOST}:${env.API_PORT}`);
});

function shutdown() {
  server.close(() => {
    client.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
