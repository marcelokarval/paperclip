import { FormEvent, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { operatorProfileApi } from "@/api/operatorProfile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";

const OPERATOR_AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";
const OPERATOR_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
    : parts[0]?.slice(0, 2) ?? "OP";
  return letters.toUpperCase();
}

export function OperatorProfileSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "Operator" },
    ]);
  }, [setBreadcrumbs]);

  const profileQuery = useQuery({
    queryKey: queryKeys.operatorProfile,
    queryFn: () => operatorProfileApi.get(),
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setName(profileQuery.data.name);
    setEmail(profileQuery.data.email);
    setImage(profileQuery.data.image ?? "");
  }, [profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: operatorProfileApi.update,
    onSuccess: async (profile) => {
      setActionError(null);
      setSaved(true);
      setName(profile.name);
      setEmail(profile.email);
      setImage(profile.image ?? "");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.operatorProfile }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.session }),
      ]);
    },
    onError: (error) => {
      setSaved(false);
      setActionError(error instanceof Error ? error.message : "Failed to update operator profile.");
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: operatorProfileApi.uploadAvatar,
    onSuccess: async (profile) => {
      setActionError(null);
      setSaved(true);
      setName(profile.name);
      setEmail(profile.email);
      setImage(profile.image ?? "");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.operatorProfile }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.session }),
      ]);
    },
    onError: (error) => {
      setSaved(false);
      setActionError(error instanceof Error ? error.message : "Failed to upload operator avatar.");
    },
  });

  if (profileQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading operator profile...</div>;
  }

  if (profileQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {profileQuery.error instanceof Error
          ? profileQuery.error.message
          : "Failed to load operator profile."}
      </div>
    );
  }

  const profile = profileQuery.data;
  if (!profile) return null;

  const isLocal = profile.source === "local_implicit";
  const pending = updateMutation.isPending || uploadAvatarMutation.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    updateMutation.mutate({
      name,
      email,
      image,
    });
  }

  function onAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!OPERATOR_AVATAR_ACCEPT.split(",").includes(file.type)) {
      setSaved(false);
      setActionError("Upload a PNG, JPEG, or WEBP image.");
      return;
    }
    if (file.size > OPERATOR_AVATAR_MAX_BYTES) {
      setSaved(false);
      setActionError(`Image exceeds ${OPERATOR_AVATAR_MAX_BYTES} bytes.`);
      return;
    }

    setActionError(null);
    setSaved(false);
    uploadAvatarMutation.mutate(file);
  }

  function onRemoveAvatar() {
    setSaved(false);
    updateMutation.mutate({
      name,
      email,
      image: null,
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Operator</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure the human board identity used in comments, activity, ownership, and local operator actions.
        </p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Operator profile saved.
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <Avatar size="lg" className="size-14">
            {image.trim() ? <AvatarImage src={image.trim()} alt={name} /> : null}
            <AvatarFallback>{initials(name || profile.name)}</AvatarFallback>
          </Avatar>

          <form className="min-w-0 flex-1 space-y-5" onSubmit={onSubmit}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Board operator profile</h2>
              <Badge variant="secondary">{isLocal ? "Local trusted" : "Authenticated"}</Badge>
              {profile.isInstanceAdmin ? <Badge variant="outline">Instance admin</Badge> : null}
            </div>

            <p className="max-w-2xl text-sm text-muted-foreground">
              {isLocal
                ? "This local profile identifies the implicit board operator. Editing it does not enable login or change the stable local-board identity."
                : "This profile is tied to the signed-in board account. Authentication still controls access; these fields control display identity."}
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="operator-name">Display name</Label>
                <Input
                  id="operator-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="operator-email">Email</Label>
                <Input
                  id="operator-email"
                  type="email"
                  value={email}
                  maxLength={320}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="space-y-1">
                <Label>Avatar image</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a PNG, JPEG, or WEBP under 2 MiB. The server re-encodes it to a metadata-stripped PNG avatar before storing it.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={OPERATOR_AVATAR_ACCEPT}
                className="hidden"
                onChange={onAvatarFileChange}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadAvatarMutation.isPending ? "Uploading..." : "Upload avatar"}
                </Button>
                {image ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={onRemoveAvatar}
                  >
                    Remove avatar
                  </Button>
                ) : null}
              </div>
              {image ? (
                <p className="break-all text-xs text-muted-foreground">
                  Current image: {image}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save operator profile"}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
