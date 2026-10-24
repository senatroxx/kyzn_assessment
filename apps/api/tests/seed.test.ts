import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { seedDemoData } from "../src/db/seed.ts";

const migrationFolder = join(import.meta.dir, "../drizzle");

async function withDb(
  run: (
    path: string,
    db: ReturnType<typeof createDatabase>["db"],
    client: Database,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "kyzn-seed-test-"));
  const path = join(directory, "fixture.sqlite");
  const connection = createDatabase(path);
  try {
    migrate(connection.db, { migrationsFolder: migrationFolder });
    await run(path, connection.db, connection.client);
  } finally {
    connection.client.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function counts(db: Database) {
  return Object.fromEntries(
    [
      "venues",
      "consultants",
      "leads",
      "activities",
      "trials",
      "conversions",
    ].map((table) => [
      table,
      (
        db.query(`SELECT count(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count,
    ]),
  );
}

test("seed is stable, idempotent, and contains all required reference records", async () => {
  await withDb(async (path, db, client) => {
    const now = new Date("2026-10-24T16:59:59.000Z");
    seedDemoData(db, now);
    const first = counts(client);
    const firstLeads = client
      .query("SELECT id, status, next_follow_up_date FROM leads ORDER BY id")
      .all();
    seedDemoData(db, now);
    expect(counts(client)).toEqual(first);
    expect(
      client
        .query("SELECT id, status, next_follow_up_date FROM leads ORDER BY id")
        .all(),
    ).toEqual(firstLeads);
    expect(first).toEqual({
      venues: 2,
      consultants: 2,
      leads: 11,
      activities: 1,
      trials: 4,
      conversions: 1,
    });
    const sources = client
      .query("SELECT DISTINCT source FROM leads")
      .all()
      .map((row) => (row as { source: string }).source)
      .sort();
    const statuses = client
      .query("SELECT DISTINCT status FROM leads")
      .all()
      .map((row) => (row as { status: string }).status)
      .sort();
    expect(sources).toEqual([
      "other",
      "referral",
      "social_media",
      "walk_in",
      "website",
      "whatsapp",
    ]);
    expect(statuses).toEqual([
      "contacted",
      "converted",
      "invalid",
      "lost",
      "new",
      "trial_completed",
      "trial_scheduled",
    ]);
    expect(
      client
        .query(
          "SELECT id FROM conversions WHERE lead_id = 'seed-lead-converted'",
        )
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query(
          "SELECT id FROM trials WHERE lead_id = 'seed-lead-trial-completed' AND status = 'completed' AND completed_at IS NOT NULL",
        )
        .get(),
    ).toBeTruthy();
    expect(
      client.query("SELECT id FROM trials WHERE status = 'cancelled'").get(),
    ).toBeTruthy();
    expect(
      client.query("SELECT id FROM trials WHERE status = 'no_show'").get(),
    ).toBeTruthy();
    expect(
      client
        .query(
          "SELECT id FROM leads WHERE deleted_at IS NOT NULL AND id = 'seed-lead-deleted'",
        )
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query(
          "SELECT id FROM leads WHERE phone_normalized = '+6281234567890' GROUP BY phone_normalized HAVING count(*) = 2",
        )
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query(
          "SELECT id FROM leads WHERE email_normalized = 'maya@example.test' GROUP BY email_normalized HAVING count(*) = 2",
        )
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query("SELECT id FROM leads WHERE next_follow_up_date = '2026-10-24'")
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query("SELECT id FROM leads WHERE next_follow_up_date = '2026-10-23'")
        .get(),
    ).toBeTruthy();
    expect(
      client
        .query("SELECT id FROM leads WHERE next_follow_up_date = '2026-10-27'")
        .get(),
    ).toBeTruthy();
    const metricRows = client
      .query(
        `
      SELECT l.status, l.next_follow_up_date, l.deleted_at,
        EXISTS (SELECT 1 FROM conversions c WHERE c.lead_id = l.id) AS has_conversion,
        (SELECT count(*) FROM trials t WHERE t.lead_id = l.id AND t.status = 'scheduled') AS scheduled_trials,
        (SELECT count(*) FROM trials t WHERE t.lead_id = l.id AND t.status = 'completed') AS completed_trials
      FROM leads l
    `,
      )
      .all() as Array<{
      status: string;
      next_follow_up_date: string | null;
      deleted_at: string | null;
      has_conversion: number;
      scheduled_trials: number;
      completed_trials: number;
    }>;
    const eligible = metricRows.filter(
      (row) => row.status !== "invalid" && row.deleted_at === null,
    );
    const metricManifest = {
      total: eligible.length,
      new: eligible.filter((row) => row.status === "new").length,
      followUpsDue: eligible.filter(
        (row) =>
          !["converted", "lost"].includes(row.status) &&
          row.next_follow_up_date !== null &&
          row.next_follow_up_date <= "2026-10-24",
      ).length,
      scheduledTrialRecords: eligible.reduce(
        (sum, row) => sum + row.scheduled_trials,
        0,
      ),
      completedTrialRecords: eligible.reduce(
        (sum, row) => sum + row.completed_trials,
        0,
      ),
      convertedEligibleLeads: eligible.filter((row) => row.has_conversion === 1)
        .length,
    };
    expect(metricManifest).toEqual({
      total: 9,
      new: 3,
      followUpsDue: 3,
      scheduledTrialRecords: 1,
      completedTrialRecords: 1,
      convertedEligibleLeads: 1,
    });
    expect(
      (100 * metricManifest.convertedEligibleLeads) / metricManifest.total,
    ).toBe(100 / 9);
    expect(path).toContain("kyzn-seed-test-");
  });
});

test("seed preserves unrelated rows and reset requires opt-in and retains migration history", async () => {
  await withDb(async (path, db, client) => {
    seedDemoData(db, new Date("2026-10-24T00:00:00Z"));
    client
      .query(
        "INSERT INTO venues (id, name) VALUES ('manual-venue', 'Manual venue')",
      )
      .run();
    seedDemoData(db, new Date("2026-10-25T00:00:00Z"));
    expect(
      client.query("SELECT name FROM venues WHERE id = 'manual-venue'").get(),
    ).toEqual({ name: "Manual venue" });

    const child = Bun.spawn(["bun", "src/db/reset-cli.ts"], {
      cwd: join(import.meta.dir, ".."),
      env: { ...Bun.env, DATABASE_PATH: path, CONFIRM_DB_RESET: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(1);
    expect(
      client.query("SELECT id FROM leads WHERE id = 'seed-lead-new'").get(),
    ).toBeTruthy();

    const confirmedReset = Bun.spawn(
      ["bun", "src/db/reset-cli.ts", "--confirm-reset"],
      {
        cwd: join(import.meta.dir, ".."),
        env: { ...Bun.env, DATABASE_PATH: path, CONFIRM_DB_RESET: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await confirmedReset.exited).toBe(0);
    expect(counts(client)).toEqual({
      venues: 0,
      consultants: 0,
      leads: 0,
      activities: 0,
      trials: 0,
      conversions: 0,
    });
    expect(
      client.query("SELECT count(*) AS count FROM __drizzle_migrations").get(),
    ).toEqual({ count: 1 });
  });
});

test("seed CLI requires explicit migrations and reset refuses in-memory paths before opening them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kyzn-seed-cli-test-"));
  const path = join(directory, "unmigrated.sqlite");
  const apiDirectory = join(import.meta.dir, "..");
  try {
    const seedBeforeMigration = Bun.spawn(["bun", "src/db/seed-cli.ts"], {
      cwd: apiDirectory,
      env: { ...Bun.env, DATABASE_PATH: path },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await seedBeforeMigration.exited).toBe(1);
    const unopenedSchema = new Database(path);
    expect(
      unopenedSchema
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all(),
    ).toEqual([]);
    unopenedSchema.close();

    const connection = createDatabase(path);
    migrate(connection.db, { migrationsFolder: migrationFolder });
    connection.client.close();
    const seedAfterMigration = Bun.spawn(["bun", "src/db/seed-cli.ts"], {
      cwd: apiDirectory,
      env: { ...Bun.env, DATABASE_PATH: path },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await seedAfterMigration.exited).toBe(0);

    const resetMemory = Bun.spawn(
      ["bun", "src/db/reset-cli.ts", "--confirm-reset"],
      {
        cwd: directory,
        env: { ...Bun.env, DATABASE_PATH: ":memory:", CONFIRM_DB_RESET: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await resetMemory.exited).toBe(1);
    await expect(access(join(directory, ":memory:"))).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
