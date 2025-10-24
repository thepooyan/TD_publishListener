import { z } from "zod";
import "dotenv/config";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val), { message: "PORT must be a number" }),
  TOKEN: z.string().nonempty(),
  REPO_PATH: z.string().nonempty()
});

export const env = envSchema.parse(process.env);