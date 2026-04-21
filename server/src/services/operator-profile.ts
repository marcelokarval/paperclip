import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";
import type { OperatorProfile, PatchOperatorProfile } from "@paperclipai/shared";
import { notFound } from "../errors.js";

export type OperatorProfileActor = {
  userId: string;
  source: "local_implicit" | "session" | "board_key";
  isInstanceAdmin: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeImage(value: PatchOperatorProfile["image"]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toProfile(
  actor: OperatorProfileActor,
  row: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  },
): OperatorProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    source: actor.source,
    isInstanceAdmin: actor.isInstanceAdmin,
  };
}

export function operatorProfileService(db: Db) {
  async function getForActor(actor: OperatorProfileActor): Promise<OperatorProfile> {
    const user = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
      })
      .from(authUsers)
      .where(eq(authUsers.id, actor.userId))
      .then((rows) => rows[0] ?? null);

    if (!user) throw notFound("Operator profile not found");
    return toProfile(actor, user);
  }

  async function updateForActor(
    actor: OperatorProfileActor,
    patch: PatchOperatorProfile,
  ): Promise<OperatorProfile> {
    const current = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
        emailVerified: authUsers.emailVerified,
      })
      .from(authUsers)
      .where(eq(authUsers.id, actor.userId))
      .then((rows) => rows[0] ?? null);

    if (!current) throw notFound("Operator profile not found");

    const nextEmail = patch.email === undefined ? current.email : normalizeEmail(patch.email);
    const emailChanged = nextEmail !== current.email;
    const normalizedImage = normalizeImage(patch.image);

    const [updated] = await db
      .update(authUsers)
      .set({
        name: patch.name?.trim() ?? current.name,
        email: nextEmail,
        emailVerified: emailChanged
          ? actor.source === "local_implicit"
          : current.emailVerified,
        image: normalizedImage === undefined ? current.image : normalizedImage,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, actor.userId))
      .returning({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
      });

    return toProfile(actor, updated);
  }

  return {
    getForActor,
    updateForActor,
  };
}
