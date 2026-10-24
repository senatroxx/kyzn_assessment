import { z } from "zod";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env"), override: false });

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),
  BUSINESS_TIME_ZONE: z
    .string()
    .default("Asia/Jakarta")
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Expected a valid IANA timezone"),
  DATABASE_PATH: z
    .string()
    .default(
      Bun.env.NODE_ENV === "test"
        ? "./data/kyzn.test.sqlite"
        : "./data/kyzn.sqlite",
    ),
});

export const env = envSchema.parse(Bun.env);
export const corsOrigins = env.API_CORS_ORIGINS.split(",").map((origin) =>
  origin.trim(),
);
