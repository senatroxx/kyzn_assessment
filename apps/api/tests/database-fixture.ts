import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTestDatabase<T>(run: (path: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "kyzn-api-test-"));
  const path = join(directory, "database.sqlite");
  try {
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
