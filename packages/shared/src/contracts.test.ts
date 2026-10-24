import { describe, expect, expectTypeOf, test } from "vitest";
import {
  activityCreateSchema,
  activityResponseSchema,
  activitySchema,
  activityTypes,
  apiErrorSchema,
  consultantSchema,
  consultantsResponseSchema,
  conversionCreateSchema,
  conversionResponseSchema,
  conversionSchema,
  dashboardMetricsResponseSchema,
  dashboardMetricsSchema,
  dateOnlySchema,
  duplicateQuerySchema,
  duplicateMatchSchema,
  duplicatesResponseSchema,
  emailSchema,
  idSchema,
  leadCreateSchema,
  leadDetailResponseSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  leadResponseSchema,
  leadSchema,
  leadSources,
  leadStatuses,
  leadUpdateSchema,
  paginationMetaSchema,
  phoneSchema,
  trialCreateSchema,
  trialResponseSchema,
  trialSchema,
  trialStatuses,
  trialUpdateSchema,
  utcDateTimeSchema,
  venueSchema,
  venuesResponseSchema,
} from "@kyzn/shared";
import type {
  ActivityCreateInput,
  ApiError,
  ApiResponse,
  ConversionCreateInput,
  DashboardMetrics,
  DashboardMetricsResponse,
  DuplicatesResponse,
  Lead,
  LeadCreateInput,
  LeadListQuery,
  LeadUpdateInput,
  TrialCreateInput,
  TrialUpdateInput,
  VenuesResponse,
  ConsultantsResponse,
} from "@kyzn/shared";

const createInput = {
  fullName: "Test Lead",
  phone: "0812-3456-7890",
  email: "Lead@example.test",
  source: "website",
  venueId: "venue_1",
  consultantId: "consultant_1",
} as const;
const lead = {
  ...createInput,
  id: "lead_1",
  status: "new",
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
  lastContactAt: null,
  nextFollowUpDate: null,
} as const;
const activity = {
  id: "activity_1",
  leadId: lead.id,
  type: "call",
  occurredAt: "2026-10-24T01:00:00Z",
  note: null,
  nextFollowUpDate: "2026-10-25",
  createdAt: "2026-10-24T01:00:00Z",
} as const;
const trial = {
  id: "trial_1",
  leadId: lead.id,
  venueId: createInput.venueId,
  scheduledAt: "2026-10-25T01:00:00Z",
  status: "scheduled",
  completedAt: null,
  notes: null,
  createdAt: "2026-10-24T01:00:00Z",
  updatedAt: "2026-10-24T01:00:00Z",
} as const;
const conversion = {
  id: "conversion_1",
  leadId: lead.id,
  convertedAt: "2026-10-24T02:00:00Z",
  note: null,
  membershipReference: null,
} as const;
const duplicate = {
  id: "lead_2",
  fullName: "Another Test Lead",
  phone: createInput.phone,
  email: "other@example.test",
  matchedFields: ["phone"],
};
const metrics = {
  totalLeads: 3,
  newLeads: 2,
  followUpsDue: 0,
  trialsScheduled: 4,
  trialsCompleted: 1,
  convertedLeads: 1,
  conversionRate: 100 / 3,
};

describe("public domain literals and primitive contracts", () => {
  test("exports the agreed domain constants", () => {
    expect(leadSources).toEqual([
      "website",
      "whatsapp",
      "social_media",
      "referral",
      "walk_in",
      "other",
    ]);
    expect(leadStatuses).toEqual([
      "new",
      "contacted",
      "trial_scheduled",
      "trial_completed",
      "converted",
      "lost",
      "invalid",
    ]);
    expect(trialStatuses).toEqual([
      "scheduled",
      "completed",
      "cancelled",
      "no_show",
    ]);
    expect(activityTypes).toEqual(["call", "whatsapp", "email", "note"]);
  });

  test("allows opaque IDs and validates UTC instants and Gregorian dates", () => {
    expect(idSchema.parse("lead_1")).toBe("lead_1");
    expect(idSchema.safeParse(" ").success).toBe(false);
    expect(dateOnlySchema.parse("2024-02-29")).toBe("2024-02-29");
    expect(dateOnlySchema.parse("2000-02-29")).toBe("2000-02-29");
    expect(dateOnlySchema.safeParse("1900-02-29").success).toBe(false);
    expect(dateOnlySchema.safeParse("0000-01-01").success).toBe(false);
    expect(dateOnlySchema.safeParse("2026-02-29").success).toBe(false);
    expect(dateOnlySchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateOnlySchema.safeParse("2026-10-24T00:00:00Z").success).toBe(
      false,
    );
    expect(utcDateTimeSchema.parse("2026-10-24T00:00:00.123Z")).toBe(
      "2026-10-24T00:00:00.123Z",
    );
    for (const value of [
      "2026-02-30T00:00:00Z",
      "2026-10-24",
      "2026-10-24T00:00:00",
      "2026-10-24T07:00:00+07:00",
      "0000-01-01T00:00:00Z",
      "2026-10-24T24:00:00Z",
      "2026-10-24T00:00Z",
    ]) {
      expect(utcDateTimeSchema.safeParse(value).success).toBe(false);
    }
  });

  test.each([
    "081234567",
    "01234567890123",
    "0812-3456-7890",
    "+62 812 3456 7890",
    "+1 (415) 555-0132",
    "+1234567",
    "+123456789012345",
  ])("accepts the structural phone policy: %s", (value) => {
    expect(phoneSchema.parse(value)).toBe(value);
  });

  test.each([
    "",
    "08123456",
    "012345678901234",
    "00123456789",
    "4155550132",
    "+6208123456789",
    "+123456",
    "+1234567890123456",
    "+1 415 ext 2",
    "++6281234567890",
    "+١٢٣٤٥٦٧",
    "0812/3456",
    "+62\t81234567890",
    "+1 ()4155550132",
    "+1 (415) (555)0132",
    "+1 ((415))5550132",
    "+1 )415(5550132",
    "081234567+",
  ])("rejects malformed or ambiguous phones: %s", (value) => {
    expect(phoneSchema.safeParse(value).success).toBe(false);
  });

  test("trims display contacts without lowercasing or canonicalizing the stored display value", () => {
    expect(phoneSchema.parse(" 0812-3456-7890 ")).toBe("0812-3456-7890");
    expect(emailSchema.parse(" Lead@Example.test ")).toBe("Lead@Example.test");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("lead request and response contracts", () => {
  test("requires all editable mandatory fields and preserves nullable follow-ups", () => {
    expect(
      leadCreateSchema.parse({
        ...createInput,
        fullName: " Test Lead ",
        nextFollowUpDate: null,
      }),
    ).toEqual({ ...createInput, nextFollowUpDate: null });
    expect(leadCreateSchema.parse(createInput)).not.toHaveProperty(
      "nextFollowUpDate",
    );
    for (const field of Object.keys(createInput)) {
      const input: Record<string, unknown> = { ...createInput };
      delete input[field];
      expect(leadCreateSchema.safeParse(input).success).toBe(false);
    }
  });

  test("checks name boundaries by Unicode code point and rejects invalid enum/date values", () => {
    for (const fullName of ["A", " ", "🙂", "A".repeat(151)]) {
      expect(
        leadCreateSchema.safeParse({ ...createInput, fullName }).success,
      ).toBe(false);
    }
    expect(
      leadCreateSchema.safeParse({ ...createInput, fullName: "🙂🙂" }).success,
    ).toBe(true);
    expect(
      leadCreateSchema.safeParse({ ...createInput, fullName: "🙂".repeat(150) })
        .success,
    ).toBe(true);
    expect(
      leadCreateSchema.safeParse({ ...createInput, source: "unknown" }).success,
    ).toBe(false);
    expect(
      leadCreateSchema.safeParse({
        ...createInput,
        nextFollowUpDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      leadCreateSchema.safeParse({
        ...createInput,
        nextFollowUpDate: "2026-10-23",
      }).success,
    ).toBe(true);
  });

  test.each([
    ["id", "lead_spoof"],
    ["status", "converted"],
    ["createdAt", lead.createdAt],
    ["updatedAt", lead.updatedAt],
    ["lastContactAt", lead.createdAt],
    ["deletedAt", lead.createdAt],
    ["phoneNormalized", "+6281234567890"],
  ])("rejects caller-supplied server/workflow field %s", (field, value) => {
    expect(
      leadCreateSchema.safeParse({ ...createInput, [field]: value }).success,
    ).toBe(false);
    expect(
      leadUpdateSchema.safeParse({ fullName: "Edited Lead", [field]: value })
        .success,
    ).toBe(false);
  });

  test("accepts a nonempty partial edit and distinguishes omitted/null follow-up", () => {
    expect(leadUpdateSchema.parse({ fullName: " Updated Name " })).toEqual({
      fullName: "Updated Name",
    });
    expect(leadUpdateSchema.parse({ nextFollowUpDate: null })).toEqual({
      nextFollowUpDate: null,
    });
    expect(leadUpdateSchema.safeParse({}).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ fullName: undefined }).success).toBe(
      false,
    );
    expect(leadUpdateSchema.safeParse({ phone: null }).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ venueId: "" }).success).toBe(false);
  });

  test("represents every mandatory field and server timestamp in public responses", () => {
    expect(leadSchema.parse(lead)).toEqual(lead);
    expect(leadResponseSchema.parse({ data: lead }).data).toEqual(lead);
    expect(leadSchema.safeParse({ ...lead, status: "member" }).success).toBe(
      false,
    );
    expect(leadSchema.safeParse({ ...lead, createdAt: null }).success).toBe(
      false,
    );
    expect(
      leadSchema.safeParse({ ...lead, lastContactAt: "yesterday" }).success,
    ).toBe(false);
  });

  test("provides history, conversion, and duplicate matches in a detail response", () => {
    const detail = {
      ...lead,
      activities: [activity],
      trials: [trial],
      conversion,
      duplicateMatches: [duplicate],
    };
    expect(leadDetailResponseSchema.parse({ data: detail }).data).toEqual(
      detail,
    );
    const emptyHistory = {
      ...lead,
      activities: [],
      trials: [],
      conversion: null,
      duplicateMatches: [],
    };
    expect(
      leadDetailResponseSchema.safeParse({ data: emptyHistory }).success,
    ).toBe(true);
  });
});

describe("list, lookups, and duplicate contracts", () => {
  test("defines list defaults and parses HTTP integer strings", () => {
    expect(leadListQuerySchema.parse({})).toEqual({
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
    expect(
      leadListQuerySchema.parse({
        search: " Alice@example.test ",
        source: "referral",
        consultantId: "consultant_1",
        status: "new",
        sortBy: "nextFollowUpDate",
        sortOrder: "asc",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      search: "Alice@example.test",
      source: "referral",
      consultantId: "consultant_1",
      status: "new",
      sortBy: "nextFollowUpDate",
      sortOrder: "asc",
      page: 2,
      pageSize: 50,
    });
    expect(leadListQuerySchema.parse({ search: "0812/3456" }).search).toBe(
      "0812/3456",
    );
  });

  test.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: true },
    { page: null },
    { page: "" },
    { page: "1.5" },
    { page: "2e2" },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { pageSize: 0 },
    { pageSize: 101 },
    { source: "unknown" },
    { status: "paid" },
    { consultantId: "" },
    { sortBy: "fullName" },
    { sortOrder: "sideways" },
    { extra: "field" },
  ])("rejects invalid list input %j", (input) => {
    expect(leadListQuerySchema.safeParse(input).success).toBe(false);
  });

  test("represents filtered pagination and duplicate indicators without client totals", () => {
    const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
    expect(paginationMetaSchema.parse(meta)).toEqual(meta);
    expect(paginationMetaSchema.safeParse({ ...meta, total: -1 }).success).toBe(
      false,
    );
    const response = { data: [{ ...lead, isDuplicate: false }], meta };
    expect(leadListResponseSchema.parse(response)).toEqual(response);
    expect(
      leadListResponseSchema.safeParse({
        data: [],
        meta: { ...meta, total: 0, totalPages: 0 },
      }).success,
    ).toBe(true);
  });

  test("defines lookup data and successful lookup responses", () => {
    const lookup = { id: "lookup_1", name: "Test Venue", active: true };
    expect(venueSchema.parse(lookup)).toEqual(lookup);
    expect(consultantSchema.parse(lookup)).toEqual(lookup);
    expect(venuesResponseSchema.parse({ data: [lookup] }).data).toEqual([
      lookup,
    ]);
    expect(consultantsResponseSchema.parse({ data: [lookup] }).data).toEqual([
      lookup,
    ]);
    expect(venueSchema.safeParse({ ...lookup, active: "true" }).success).toBe(
      false,
    );
  });

  test("requires a valid duplicate search contact and represents matching fields", () => {
    expect(
      duplicateQuerySchema.parse({
        phone: createInput.phone,
        excludeId: lead.id,
      }),
    ).toEqual({ phone: createInput.phone, excludeId: lead.id });
    expect(
      duplicateQuerySchema.safeParse({ email: createInput.email }).success,
    ).toBe(true);
    for (const input of [
      {},
      { excludeId: lead.id },
      { phone: "" },
      { email: "invalid" },
    ]) {
      expect(duplicateQuerySchema.safeParse(input).success).toBe(false);
    }
    expect(duplicatesResponseSchema.parse({ data: [duplicate] }).data).toEqual([
      duplicate,
    ]);
    expect(
      duplicatesResponseSchema.safeParse({
        data: [{ ...duplicate, matchedFields: [] }],
      }).success,
    ).toBe(false);
    expect(
      duplicatesResponseSchema.safeParse({
        data: [{ ...duplicate, matchedFields: ["name"] }],
      }).success,
    ).toBe(false);
  });
});

describe("activity, trial, and conversion payloads", () => {
  test("represents contacts/notes and optional or explicitly cleared follow-ups", () => {
    expect(activityCreateSchema.parse({ type: "call" })).toEqual({
      type: "call",
    });
    expect(
      activityCreateSchema.parse({
        type: "note",
        note: " Note ",
        nextFollowUpDate: null,
      }),
    ).toEqual({ type: "note", note: "Note", nextFollowUpDate: null });
    expect(
      activityCreateSchema.safeParse({
        type: "call",
        occurredAt: "2030-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
    for (const input of [
      { type: "sms" },
      { type: "call", occurredAt: "tomorrow" },
      { type: "call", nextFollowUpDate: "2026-02-30" },
      { type: "call", id: "spoof" },
      { type: "call", createdAt: lead.createdAt },
    ]) {
      expect(activityCreateSchema.safeParse(input).success).toBe(false);
    }
    expect(activityResponseSchema.parse({ data: activity }).data).toEqual(
      activity,
    );
  });

  test("validates trial creation and distinct reschedule/outcome payloads", () => {
    const input = {
      venueId: createInput.venueId,
      scheduledAt: trial.scheduledAt,
    };
    expect(trialCreateSchema.parse(input)).toEqual(input);
    expect(
      trialCreateSchema.safeParse({ ...input, status: "completed" }).success,
    ).toBe(false);
    expect(
      trialCreateSchema.safeParse({ ...input, scheduledAt: "not-a-date" })
        .success,
    ).toBe(false);
    expect(
      trialUpdateSchema.parse({ scheduledAt: "2026-10-26T01:00:00Z" }),
    ).toEqual({ scheduledAt: "2026-10-26T01:00:00Z" });
    for (const status of ["completed", "cancelled", "no_show"]) {
      expect(trialUpdateSchema.parse({ status })).toEqual({ status });
    }
    for (const patch of [
      {},
      { scheduledAt: undefined },
      { status: "done" },
      { status: "completed", completedAt: trial.scheduledAt },
      { status: "completed", scheduledAt: trial.scheduledAt },
      { id: "trial_spoof" },
    ]) {
      expect(trialUpdateSchema.safeParse(patch).success).toBe(false);
    }
    expect(trialResponseSchema.parse({ data: trial }).data).toEqual(trial);
    expect(
      trialResponseSchema.safeParse({
        data: { ...trial, status: "completed", completedAt: null },
      }).success,
    ).toBe(false);
    expect(
      trialResponseSchema.safeParse({
        data: { ...trial, status: "completed", completedAt: trial.scheduledAt },
      }).success,
    ).toBe(true);
  });

  test("allows conversion notes/references and rejects caller-generated event fields", () => {
    expect(conversionCreateSchema.parse({})).toEqual({});
    expect(
      conversionCreateSchema.parse({
        note: " Paid ",
        membershipReference: " Demo-1 ",
      }),
    ).toEqual({ note: "Paid", membershipReference: "Demo-1" });
    for (const input of [
      { id: "spoof" },
      { leadId: lead.id },
      { status: "converted" },
      { convertedAt: conversion.convertedAt },
    ]) {
      expect(conversionCreateSchema.safeParse(input).success).toBe(false);
    }
    expect(conversionResponseSchema.parse({ data: conversion }).data).toEqual(
      conversion,
    );
  });
});

describe("metrics, errors, and inferred public types", () => {
  test("exports record schemas directly for API response validation", () => {
    expect(activitySchema.parse(activity)).toEqual(activity);
    expect(trialSchema.parse(trial)).toEqual(trial);
    expect(conversionSchema.parse(conversion)).toEqual(conversion);
    expect(duplicateMatchSchema.parse(duplicate)).toEqual(duplicate);
  });
  test("represents all seven metrics, fractional percentages, and valid zero values", () => {
    expect(dashboardMetricsSchema.parse(metrics)).toEqual(metrics);
    expect(
      dashboardMetricsResponseSchema.parse({ data: metrics }).data,
    ).toEqual(metrics);
    const zero = Object.fromEntries(
      Object.keys(metrics).map((key) => [key, 0]),
    );
    expect(dashboardMetricsSchema.safeParse(zero).success).toBe(true);
    for (const patch of [
      { totalLeads: -1 },
      { newLeads: 1.5 },
      { conversionRate: NaN },
      { conversionRate: Infinity },
      { conversionRate: -1 },
      { conversionRate: 101 },
    ]) {
      expect(
        dashboardMetricsSchema.safeParse({ ...metrics, ...patch }).success,
      ).toBe(false);
    }
  });

  test("preserves the generic error contract and optional structured field errors", () => {
    const legacy = { error: { code: "NOT_FOUND", message: "Missing" } };
    expect(apiErrorSchema.parse(legacy)).toEqual(legacy);
    const error = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: [
          {
            path: ["fullName"],
            message: "Name is required",
            code: "too_small",
          },
        ],
      },
    };
    expect(apiErrorSchema.parse(error)).toEqual(error);
    expect(
      apiErrorSchema.safeParse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid",
          details: [{ path: {}, message: "Bad" }],
        },
      }).success,
    ).toBe(false);
  });

  test("exports types inferred from the same public schemas", () => {
    expectTypeOf(leadSchema.parse(lead)).toEqualTypeOf<Lead>();
    expectTypeOf(
      leadCreateSchema.parse(createInput),
    ).toEqualTypeOf<LeadCreateInput>();
    expectTypeOf(
      leadUpdateSchema.parse({ fullName: "Changed" }),
    ).toEqualTypeOf<LeadUpdateInput>();
    expectTypeOf(leadListQuerySchema.parse({})).toEqualTypeOf<LeadListQuery>();
    expectTypeOf(
      activityCreateSchema.parse({ type: "call" }),
    ).toEqualTypeOf<ActivityCreateInput>();
    expectTypeOf(
      trialCreateSchema.parse({
        venueId: "venue_1",
        scheduledAt: trial.scheduledAt,
      }),
    ).toEqualTypeOf<TrialCreateInput>();
    expectTypeOf(
      trialUpdateSchema.parse({ status: "completed" }),
    ).toEqualTypeOf<TrialUpdateInput>();
    expectTypeOf(
      conversionCreateSchema.parse({}),
    ).toEqualTypeOf<ConversionCreateInput>();
    expectTypeOf(
      dashboardMetricsSchema.parse(metrics),
    ).toEqualTypeOf<DashboardMetrics>();
    expectTypeOf(
      dashboardMetricsResponseSchema.parse({ data: metrics }),
    ).toEqualTypeOf<DashboardMetricsResponse>();
    expectTypeOf(
      duplicatesResponseSchema.parse({ data: [duplicate] }),
    ).toEqualTypeOf<DuplicatesResponse>();
    expectTypeOf(
      venuesResponseSchema.parse({ data: [] }),
    ).toEqualTypeOf<VenuesResponse>();
    expectTypeOf(
      consultantsResponseSchema.parse({ data: [] }),
    ).toEqualTypeOf<ConsultantsResponse>();
    expectTypeOf(
      apiErrorSchema.parse({
        error: { code: "NOT_FOUND", message: "Missing" },
      }),
    ).toEqualTypeOf<ApiError>();
    const response: ApiResponse<Lead> = { data: leadSchema.parse(lead) };
    expect(response.data.id).toBe(lead.id);
  });
});
