import { sql } from "drizzle-orm";
import type { createDatabase } from "./client.ts";
import {
  activities,
  consultants,
  conversions,
  leads,
  trials,
  venues,
} from "./schema.ts";

const venuesSeed = [
  { id: "seed-venue-jakarta", name: "KYZN Jakarta" },
  { id: "seed-venue-bandung", name: "KYZN Bandung" },
];
const consultantsSeed = [
  { id: "seed-consultant-1", name: "Ari Pratama" },
  { id: "seed-consultant-2", name: "Nadia Putri" },
];

function jakartaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type Db = ReturnType<typeof createDatabase>["db"];

export function seedDemoData(db: Db, referenceNow = new Date()) {
  const now = referenceNow.toISOString();
  const today = jakartaDate(referenceNow);
  const [year, month, day] = today.split("-").map(Number);
  const dateOffset = (offset: number) =>
    new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10);
  const rows = [
    [
      "seed-lead-new",
      "Maya Santoso",
      "0812-3456-7890",
      "+6281234567890",
      "maya@example.test",
      "maya@example.test",
      "website",
      "new",
      null,
    ],
    [
      "seed-lead-contacted",
      "Rafi Wijaya",
      "+62 812 3456 7890",
      "+6281234567890",
      "rafi@example.test",
      "rafi@example.test",
      "whatsapp",
      "contacted",
      dateOffset(-1),
    ],
    [
      "seed-lead-trial-scheduled",
      "Lina Kusuma",
      "0813-1111-2222",
      "+6281311112222",
      "lina@example.test",
      "lina@example.test",
      "social_media",
      "trial_scheduled",
      dateOffset(0),
    ],
    [
      "seed-lead-trial-completed",
      "Dimas Saputra",
      "0813-2222-3333",
      "+6281322223333",
      "dimas@example.test",
      "dimas@example.test",
      "referral",
      "trial_completed",
      dateOffset(2),
    ],
    [
      "seed-lead-converted",
      "Sari Wulandari",
      "0813-3333-4444",
      "+6281333334444",
      "sari@example.test",
      "sari@example.test",
      "walk_in",
      "converted",
      null,
    ],
    [
      "seed-lead-lost",
      "Bima Hidayat",
      "0813-4444-5555",
      "+6281344445555",
      "bima@example.test",
      "bima@example.test",
      "other",
      "lost",
      null,
    ],
    [
      "seed-lead-invalid",
      "Tono Example",
      "0813-5555-6666",
      "+6281355556666",
      "tono@example.test",
      "tono@example.test",
      "website",
      "invalid",
      null,
    ],
    [
      "seed-lead-deleted",
      "Deleted Example",
      "0813-6666-7777",
      "+6281366667777",
      "deleted@example.test",
      "deleted@example.test",
      "other",
      "new",
      null,
    ],
    [
      "seed-lead-email-duplicate",
      "Maya Duplicate",
      "0813-7777-8888",
      "+6281377778888",
      "MAYA@example.test",
      "maya@example.test",
      "social_media",
      "new",
      null,
    ],
    [
      "seed-lead-today",
      "Intan Example",
      "0813-8888-9999",
      "+6281388889999",
      "intan@example.test",
      "intan@example.test",
      "referral",
      "contacted",
      today,
    ],
    [
      "seed-lead-future",
      "Yoga Example",
      "0813-9999-0000",
      "+6281399990000",
      "yoga@example.test",
      "yoga@example.test",
      "whatsapp",
      "new",
      dateOffset(3),
    ],
  ] as const;
  db.transaction((tx) => {
    tx.insert(venues).values(venuesSeed).onConflictDoNothing().run();
    tx.insert(consultants).values(consultantsSeed).onConflictDoNothing().run();
    tx.insert(leads)
      .values(
        rows.map(
          (
            [
              id,
              fullName,
              phone,
              phoneNormalized,
              email,
              emailNormalized,
              source,
              status,
              followUp,
            ],
            index,
          ) => ({
            id,
            fullName,
            phone,
            phoneNormalized,
            email,
            emailNormalized,
            source,
            venueId: index % 2 ? "seed-venue-bandung" : "seed-venue-jakarta",
            consultantId: index % 2 ? "seed-consultant-2" : "seed-consultant-1",
            status,
            createdAt: now,
            updatedAt: now,
            nextFollowUpDate: followUp,
            deletedAt: id === "seed-lead-deleted" ? now : null,
            lastContactAt: status === "contacted" ? now : null,
          }),
        ),
      )
      .onConflictDoNothing()
      .run();
    tx.insert(activities)
      .values({
        id: "seed-activity-call",
        leadId: "seed-lead-contacted",
        type: "call",
        occurredAt: now,
        note: "Synthetic demo contact",
      })
      .onConflictDoNothing()
      .run();
    tx.insert(trials)
      .values([
        {
          id: "seed-trial-scheduled",
          leadId: "seed-lead-trial-scheduled",
          venueId: "seed-venue-jakarta",
          scheduledAt: new Date(
            referenceNow.getTime() + 86400000,
          ).toISOString(),
          status: "scheduled",
          completedAt: null,
          notes: "Synthetic scheduled trial",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "seed-trial-completed",
          leadId: "seed-lead-trial-completed",
          venueId: "seed-venue-bandung",
          scheduledAt: new Date(
            referenceNow.getTime() - 86400000,
          ).toISOString(),
          status: "completed",
          completedAt: now,
          notes: "Synthetic completed trial",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "seed-trial-cancelled",
          leadId: "seed-lead-lost",
          venueId: "seed-venue-jakarta",
          scheduledAt: now,
          status: "cancelled",
          completedAt: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "seed-trial-no-show",
          leadId: "seed-lead-lost",
          venueId: "seed-venue-bandung",
          scheduledAt: now,
          status: "no_show",
          completedAt: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing()
      .run();
    tx.insert(conversions)
      .values({
        id: "seed-conversion-1",
        leadId: "seed-lead-converted",
        convertedAt: now,
        note: "Synthetic demo conversion",
        membershipReference: "DEMO-001",
      })
      .onConflictDoNothing()
      .run();
  });
}

export function resetDemoData(db: Parameters<typeof seedDemoData>[0]) {
  db.transaction((tx) => {
    tx.run(sql`DELETE FROM conversions`);
    tx.run(sql`DELETE FROM trials`);
    tx.run(sql`DELETE FROM activities`);
    tx.run(sql`DELETE FROM leads`);
    tx.run(sql`DELETE FROM consultants`);
    tx.run(sql`DELETE FROM venues`);
  });
}
