import type { OperatorProfile, PatchOperatorProfile } from "@paperclipai/shared";
import { api } from "./client";

export const operatorProfileApi = {
  get: () => api.get<OperatorProfile>("/operator/profile"),
  update: (patch: PatchOperatorProfile) =>
    api.patch<OperatorProfile>("/operator/profile", patch),
  uploadAvatar: async (file: File) => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<OperatorProfile>("/operator/profile/avatar", form);
  },
};
