import { z } from "zod";

export const apiVersion = "v1" as const;

const nonblank = z.string().trim().min(1);
export const idSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "ID must not be blank");

export const leadSources = [
  "website",
  "whatsapp",
  "social_media",
  "referral",
  "walk_in",
  "other",
] as const;
export const leadStatuses = [
  "new",
  "contacted",
  "trial_scheduled",
  "trial_completed",
  "converted",
  "lost",
  "invalid",
] as const;
export const trialStatuses = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
] as const;
export const activityTypes = ["call", "whatsapp", "email", "note"] as const;
export const leadSourceSchema = z.enum(leadSources);
export const leadStatusSchema = z.enum(leadStatuses);
export const trialStatusSchema = z.enum(trialStatuses);
export const activityTypeSchema = z.enum(activityTypes);

export const dateOnlySchema = z.iso
  .date()
  .refine(
    (value) => value.slice(0, 4) !== "0000",
    "Year must be at least 0001",
  );

export const utcDateTimeSchema = z.iso
  .datetime()
  .refine(
    (value) => value.slice(0, 4) !== "0000",
    "Year must be at least 0001",
  );

export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value || /[^0-9+ ().-]/.test(value)) return false;
    const opens = [...value].filter((char) => char === "(").length;
    const closes = [...value].filter((char) => char === ")").length;
    if (opens !== closes || opens > 1) return false;
    if (opens === 1) {
      const start = value.indexOf("(");
      const end = value.indexOf(")");
      if (
        start < 0 ||
        end <= start ||
        value.slice(start + 1, end).includes("(") ||
        /\d/.test(value.slice(start + 1, end)) === false
      )
        return false;
    }
    const compact = value.replace(/[ ().-]/g, "");
    if (!/^\+?[0-9]+$/.test(compact)) return false;
    if (compact.startsWith("+"))
      return (
        /^[1-9][0-9]{6,14}$/.test(compact.slice(1)) &&
        !compact.startsWith("+620")
      );
    return /^0[1-9][0-9]{7,12}$/.test(compact);
  }, "Expected a supported phone number");

export const emailSchema = z.string().trim().pipe(z.email());
const fullNameSchema = z
  .string()
  .trim()
  .refine(
    (value) => [...value].length >= 2 && [...value].length <= 150,
    "Name must contain 2–150 Unicode code points",
  );
const optionalTrimmed = z.string().trim().optional();
const nullableDate = dateOnlySchema.nullable();

export const venueSchema = z.strictObject({
  id: idSchema,
  name: nonblank,
  active: z.boolean(),
});
export const consultantSchema = z.strictObject({
  id: idSchema,
  name: nonblank,
  active: z.boolean(),
});
export const venuesResponseSchema = z.strictObject({
  data: z.array(venueSchema),
});
export const consultantsResponseSchema = z.strictObject({
  data: z.array(consultantSchema),
});

const leadFields = {
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema,
  source: leadSourceSchema,
  venueId: idSchema,
  consultantId: idSchema,
};
export const leadCreateSchema = z.strictObject({
  ...leadFields,
  nextFollowUpDate: nullableDate.optional(),
});
export const leadUpdateSchema = z
  .strictObject({ ...leadFields, nextFollowUpDate: nullableDate.optional() })
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "At least one editable field is required",
  );
export const leadSchema = z.strictObject({
  id: idSchema,
  ...leadFields,
  status: leadStatusSchema,
  createdAt: utcDateTimeSchema,
  updatedAt: utcDateTimeSchema,
  lastContactAt: utcDateTimeSchema.nullable(),
  nextFollowUpDate: nullableDate,
});
export const leadResponseSchema = z.strictObject({ data: leadSchema });

const queryInteger = z.preprocess((value) => {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  return value;
}, z.number().int().safe().positive());
export const leadListQuerySchema = z.strictObject({
  search: z.string().trim().default(""),
  source: leadSourceSchema.optional(),
  consultantId: idSchema.optional(),
  status: leadStatusSchema.optional(),
  sortBy: z.enum(["createdAt", "nextFollowUpDate"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: queryInteger.default(1),
  pageSize: queryInteger.pipe(z.number().max(100)).default(20),
});
export const paginationMetaSchema = z.strictObject({
  page: z.number().int().safe().positive(),
  pageSize: z.number().int().safe().positive(),
  total: z.number().int().safe().nonnegative(),
  totalPages: z.number().int().safe().nonnegative(),
});
export const leadListResponseSchema = z.strictObject({
  data: z.array(leadSchema.extend({ isDuplicate: z.boolean() })),
  meta: paginationMetaSchema,
});

const duplicateContactSchema = z
  .strictObject({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    excludeId: idSchema.optional(),
  })
  .refine(
    (value) => value.phone !== undefined || value.email !== undefined,
    "Phone or email is required",
  );
export const duplicateQuerySchema = duplicateContactSchema;
export const duplicateMatchSchema = z.strictObject({
  id: idSchema,
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema,
  matchedFields: z.array(z.enum(["phone", "email"])).min(1),
});
export const duplicatesResponseSchema = z.strictObject({
  data: z.array(duplicateMatchSchema),
});

export const activityCreateSchema = z.strictObject({
  type: activityTypeSchema,
  occurredAt: utcDateTimeSchema.optional(),
  note: optionalTrimmed,
  nextFollowUpDate: nullableDate.optional(),
});
export const activitySchema = z.strictObject({
  id: idSchema,
  leadId: idSchema,
  type: activityTypeSchema,
  occurredAt: utcDateTimeSchema,
  note: z.string().nullable(),
  nextFollowUpDate: nullableDate,
  createdAt: utcDateTimeSchema,
});
export const activityResponseSchema = z.strictObject({ data: activitySchema });

export const trialCreateSchema = z.strictObject({
  venueId: idSchema,
  scheduledAt: utcDateTimeSchema,
  notes: optionalTrimmed,
});
const trialOutcome = z.strictObject({
  status: z.enum(["completed", "cancelled", "no_show"]),
  notes: optionalTrimmed,
});
const trialReschedule = z
  .strictObject({
    scheduledAt: utcDateTimeSchema.optional(),
    venueId: idSchema.optional(),
    notes: optionalTrimmed,
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "At least one reschedule field is required",
  );
export const trialUpdateSchema = z.union([trialOutcome, trialReschedule]);
export const trialSchema = z
  .strictObject({
    id: idSchema,
    leadId: idSchema,
    venueId: idSchema,
    scheduledAt: utcDateTimeSchema,
    status: trialStatusSchema,
    completedAt: utcDateTimeSchema.nullable(),
    notes: z.string().nullable(),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .refine(
    (value) =>
      value.status === "completed"
        ? value.completedAt !== null
        : value.completedAt === null,
    "completedAt must match trial status",
  );
export const trialResponseSchema = z.strictObject({ data: trialSchema });

export const conversionCreateSchema = z.strictObject({
  note: optionalTrimmed,
  membershipReference: optionalTrimmed,
});
export const conversionSchema = z.strictObject({
  id: idSchema,
  leadId: idSchema,
  convertedAt: utcDateTimeSchema,
  note: z.string().nullable(),
  membershipReference: z.string().nullable(),
});
export const conversionResponseSchema = z.strictObject({
  data: conversionSchema,
});

export const dashboardMetricsSchema = z.strictObject({
  totalLeads: z.number().int().safe().nonnegative(),
  newLeads: z.number().int().safe().nonnegative(),
  followUpsDue: z.number().int().safe().nonnegative(),
  trialsScheduled: z.number().int().safe().nonnegative(),
  trialsCompleted: z.number().int().safe().nonnegative(),
  convertedLeads: z.number().int().safe().nonnegative(),
  conversionRate: z.number().finite().min(0).max(100),
});
export const dashboardMetricsResponseSchema = z.strictObject({
  data: dashboardMetricsSchema,
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.strictObject({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
          code: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

export const leadDetailResponseSchema = z.strictObject({
  data: leadSchema.extend({
    activities: z.array(activitySchema),
    trials: z.array(trialSchema),
    conversion: conversionSchema.nullable(),
    duplicateMatches: z.array(duplicateMatchSchema),
  }),
});

export type ApiResponse<T> = { data: T };
export type ApiError = z.infer<typeof apiErrorSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
export type LeadDetailResponse = z.infer<typeof leadDetailResponseSchema>;
export type LeadResponse = z.infer<typeof leadResponseSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Consultant = z.infer<typeof consultantSchema>;
export type VenuesResponse = z.infer<typeof venuesResponseSchema>;
export type ConsultantsResponse = z.infer<typeof consultantsResponseSchema>;
export type DuplicateQuery = z.infer<typeof duplicateQuerySchema>;
export type DuplicateMatch = z.infer<typeof duplicateMatchSchema>;
export type DuplicatesResponse = z.infer<typeof duplicatesResponseSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type Trial = z.infer<typeof trialSchema>;
export type TrialCreateInput = z.infer<typeof trialCreateSchema>;
export type TrialUpdateInput = z.infer<typeof trialUpdateSchema>;
export type TrialResponse = z.infer<typeof trialResponseSchema>;
export type Conversion = z.infer<typeof conversionSchema>;
export type ConversionCreateInput = z.infer<typeof conversionCreateSchema>;
export type ConversionResponse = z.infer<typeof conversionResponseSchema>;
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;
export type DashboardMetricsResponse = z.infer<
  typeof dashboardMetricsResponseSchema
>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type TrialStatus = z.infer<typeof trialStatusSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;
