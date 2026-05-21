import { z } from "zod";

export const CreateSiteConnectionSchema = z.object({
  tenantId: z.string().uuid(),
  baseUrl: z
    .string()
    .trim()
    .url("Must be a full URL incl. https://")
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), "Must start with http(s)://"),
  username: z.string().trim().min(1).max(120),
  appPassword: z.string().trim().min(8).max(255),
});
export type CreateSiteConnectionInput = z.infer<typeof CreateSiteConnectionSchema>;

export const ProbeSiteConnectionSchema = z.object({
  siteConnectionId: z.string().uuid(),
});
