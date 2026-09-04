import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  adminCountQuery,
  adminRevocationGuard,
  currentUserIdQuery,
  grantRole,
  membersQuery,
  revokeRole,
  roleMutationErrorKey,
  type AppRole,
} from "@/lib/roles";
import { myRolesQuery } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin/people")({
  component: PeoplePage,
});

const MANAGED: AppRole[] = [
  "operator",
  "report_moderator",
  "translator",
  "incident_editor",
  "admin",
];

function PeoplePage() {
  const { t } = useTranslation("admin");
  const me = useQuery(currentUserIdQuery);
  const qc = useQueryClient();
  const roles = useQuery(myRolesQuery);
  const isAdmin = (roles.data ?? []).includes("admin");
  const members = useQuery({ ...membersQuery, enabled: isAdmin });
  const adminCount = useQuery({ ...adminCountQuery, enabled: isAdmin });
  const [search, setSearch] = useState("");

  const mutate = useMutation({
    mutationFn: async (input: {
      userId: string;
      role: AppRole;
      grant: boolean;
    }) =>
      input.grant
        ? grantRole(input.userId, input.role)
        : revokeRole(input.userId, input.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  if (roles.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        {t("queues.loading")}
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">
          {t("people.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("people.noAccess")}
        </p>
      </main>
    );
  }

  const q = search.trim().toLowerCase();
  const rows = (members.data ?? []).filter(
    (m) =>
      !q ||
      (m.display_name ?? "").toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q),
  );
  const authoritativeAdminCount = adminCount.data ?? 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">
        {t("people.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("people.subtitle")}
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("people.search")}
        className="mt-4 w-full max-w-sm rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />

      {members.isLoading || adminCount.isLoading || me.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("queues.loading")}
        </p>
      ) : members.isError || adminCount.isError || me.isError || !me.data ? (
        <p className="mt-6 text-sm text-destructive">{t("people.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("people.empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((m) => {
            const adminGuard = adminRevocationGuard({
              currentUserId: me.data,
              targetUserId: m.id,
              adminCount: authoritativeAdminCount,
            });
            const lastAdminMessageId = `last-admin-${m.id}`;
            const soleAdmin = m.roles.includes("admin") && adminGuard.disabled;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.display_name || t("people.unnamed")}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {m.id}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.roles.length
                      ? m.roles.join(" · ")
                      : t("people.roleUser")}
                  </p>
                  {soleAdmin ? (
                    <p
                      id={lastAdminMessageId}
                      className="mt-2 max-w-xl text-xs text-muted-foreground"
                    >
                      {t("people.lastAdminDisabled")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {MANAGED.map((role) => {
                    const has = m.roles.includes(role);
                    const guard =
                      role === "admin" && has
                        ? adminGuard
                        : { disabled: false, needsConfirmation: false };
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={mutate.isPending || guard.disabled}
                        aria-describedby={
                          guard.disabled ? lastAdminMessageId : undefined
                        }
                        onClick={() => {
                          if (
                            guard.needsConfirmation &&
                            !window.confirm(t("people.confirmSelfAdminRevoke"))
                          ) {
                            return;
                          }
                          mutate.mutate({
                            userId: m.id,
                            role,
                            grant: !has,
                          });
                        }}
                        className={
                          has
                            ? "rounded-md border border-border px-2 py-1 text-xs text-muted-foreground enabled:hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                            : "rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        }
                      >
                        {has
                          ? t("people.revoke", { role: t(`role.${role}`) })
                          : t("people.grant", { role: t(`role.${role}`) })}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {mutate.isError ? (
        <p className="mt-3 text-sm text-destructive">
          {t(roleMutationErrorKey(mutate.error))}
        </p>
      ) : null}
    </main>
  );
}
