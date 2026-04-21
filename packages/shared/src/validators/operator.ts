import { z } from "zod";

export const operatorProfileSourceSchema = z.enum(["local_implicit", "session", "board_key"]);

export const operatorProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email().max(320),
  image: z.string().url().max(2048).nullable(),
  source: operatorProfileSourceSchema,
  isInstanceAdmin: z.boolean(),
}).strict();

export const patchOperatorProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  image: z.union([z.string().trim().url().max(2048), z.literal(""), z.null()]).optional(),
}).strict();

export type PatchOperatorProfile = z.infer<typeof patchOperatorProfileSchema>;
