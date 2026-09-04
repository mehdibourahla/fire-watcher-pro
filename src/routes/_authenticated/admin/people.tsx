import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MemberDetail } from "@/components/admin/MemberDetail";
import type { AnyLocale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";

import {
  adminCountQuery,
  adminRevocationGuard,
  currentUserIdQuery,
  grantRole,
  GRANTABLE_ROLES,
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
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const me = useQuery(currentUserIdQuery);
  const qc = useQueryClient();
  const roles = useQuery(myRolesQuery);
  const isAdmin = (roles.data ?? []).includes("admin");
  const members = useQuery({ ...membersQuery, enabled: isAdmin });
  const adminCount = useQuery({ ...adminCountQuery, enabled: isAdmin });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "none" | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "email">("newest");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

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
  const all = members.data ?? [];
  const rows = all
    .filter(
      (m) =>
        !q ||
        (m.display_name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    )
    .filter((m) =>
      roleFilter === null
        ? true
        : roleFilter === "none"
          ? m.roles.length === 0
          : m.roles.includes(roleFilter),
    )
    .sort((a, b) =>
      sort === "email"
        ? a.email.localeCompare(b.email)
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  const authoritativeAdminCount = adminCount.data ?? 0;
  const chosen = rows.filter((m) => selected.includes(m.id));

  const bulk = (role: AppRole, grant: boolean) => {
    for (const m of chosen) {
      if (grant === m.roles.includes(role)) continue;
      mutate.mutate({ userId: m.id, role, grant });
    }
    setSelected([]);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">
        {t("people.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("people.subtitle")}
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        {t("people.counts", {
          total: all.length,
          withRole: all.filter((m) => m.roles.length > 0).length,
          shown: rows.length,
        })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("people.search")}
          className="w-full max-w-sm rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <select
          aria-label={t("people.sort")}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="newest">{t("people.sortNewest")}</option>
          <option value="oldest">{t("people.sortOldest")}</option>
          <option value="email">{t("people.sortEmail")}</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[null, ...GRANTABLE_ROLES, "none" as const].map((r) => (
          <button
            key={r ?? "all"}
            type="button"
            onClick={() => setRoleFilter(r)}
            aria-pressed={roleFilter === r}
            className={
              roleFilter === r
                ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            }
          >
            {r === null
              ? t("people.filterAll")
              : r === "none"
                ? t("people.filterNoRole")
                : t(`role.${r}`)}
          </button>
        ))}
      </div>

      {chosen.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
          <span className="text-xs text-muted-foreground">
            {t("people.selected", { count: chosen.length })}
          </span>
          {GRANTABLE_ROLES.filter((r) => r !== "admin").map((r) => (
            <span key={r} className="flex gap-1">
              <button
                type="button"
                disabled={mutate.isPending}
                onClick={() => bulk(r, true)}
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                + {t(`role.${r}`)}
              </button>
              <button
                type="button"
                disabled={mutate.isPending}
                onClick={() => bulk(r, false)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
              >
                − {t(`role.${r}`)}
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground underline"
          >
            {t("people.clearSelection")}
          </button>
        </div>
      ) : null}

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
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={t("people.select", { email: m.email })}
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id),
                        )
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.display_name || m.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.display_name ? m.email : t("people.noName")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.roles.length
                          ? m.roles.join(" · ")
                          : t("people.roleUser")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("people.activity", {
                          zones: m.zone_count,
                          reports: m.report_count,
                        })}
                        {m.last_sign_in_at
                          ? ` · ${t("people.lastSeen", { time: relativeTime(m.last_sign_in_at, locale) })}`
                          : ` · ${t("people.neverSignedIn")}`}
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
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => (prev === m.id ? null : m.id))
                      }
                      aria-expanded={expanded === m.id}
                      className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                    >
                      {expanded === m.id
                        ? t("people.hide")
                        : t("people.inspect")}
                    </button>
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
                              !window.confirm(
                                t("people.confirmSelfAdminRevoke"),
                              )
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
                </div>
                {expanded === m.id ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <MemberDetail userId={m.id} />
                  </div>
                ) : null}
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
