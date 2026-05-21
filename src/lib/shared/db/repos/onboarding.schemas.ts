import { z } from "zod";

export const GEO_OPTIONS = ["NL", "US"] as const;
export const VERTICAL_OPTIONS = [
  "home_services",
  "healthcare",
  "legal",
  "insurance",
  "consulting",
  "b2b",
  "other",
] as const;

export const BusinessStepSchema = z.object({
  name: z.string().min(2).max(120),
  geo: z.enum(GEO_OPTIONS),
  vertical: z.enum(VERTICAL_OPTIONS),
});
export type BusinessStepInput = z.infer<typeof BusinessStepSchema>;

export const SiteStepSchema = z.object({
  site_url: z
    .string()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), "Must start with http(s)://"),
});
export type SiteStepInput = z.infer<typeof SiteStepSchema>;
