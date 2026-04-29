import { z } from "zod";

const operatorImageSchema = z.union([
  z.string().url().max(2048),
  z.string().max(120).regex(/^\/api\/assets\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/content$/),
]);

export const operatorProfileSourceSchema = z.enum(["local_implicit", "session", "board_key"]);

export const operatorProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email().max(320),
  image: operatorImageSchema.nullable(),
  source: operatorProfileSourceSchema,
  isInstanceAdmin: z.boolean(),
}).strict();

export const patchOperatorProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  image: z.union([operatorImageSchema, z.literal(""), z.null()]).optional(),
}).strict();

export type PatchOperatorProfile = z.infer<typeof patchOperatorProfileSchema>;
