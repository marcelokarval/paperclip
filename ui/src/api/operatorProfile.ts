import type { OperatorProfile, PatchOperatorProfile } from "@paperclipai/shared";
import { api } from "./client";

export const operatorProfileApi = {
  get: () => api.get<OperatorProfile>("/operator/profile"),
  update: (patch: PatchOperatorProfile) =>
    api.patch<OperatorProfile>("/operator/profile", patch),
};
