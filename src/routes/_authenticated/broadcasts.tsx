import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  applyBroadcastTransition,
  BroadcastAdminError,
  getBroadcastAudit,
  hasConfirmedBroadcastSettings,
  setBroadcastEnabled,
  submitAuthorityWarning,
} from "@/lib/broadcast-admin";
import { adminUnitsQuery, relativeTime, unitName } from "@/lib/nadhir";
import { myRolesQuery } from "@/lib/reports";
import { titledMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  head: () => ({
    meta: titledMeta("broadcastAdmin.title", "broadcastAdmin.subtitle"),
  }),
  component: BroadcastConsole,
});

const settingsQuery = queryOptions({
  queryKey: ["broadcast_settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("broadcast_settings")
      .select("enabled, updated_at")
      .eq("id", true)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
});

const auditQuery = queryOptions({
  queryKey: ["broadcast_audit"],
  queryFn: getBroadcastAudit,
});

const warningsQuery = queryOptions({
  queryKey: ["authority_warnings"],
  queryFn: async () => {
    const [{ data: warnings, error }, { data: relayed }] = await Promise.all([
      supabase
        .from("authority_warnings")
        .select("id, source, body, severity, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("broadcasts")
        .select("authority_warning_id")
        .eq("kind", "authority"),
    ]);
    if (error) throw new Error(error.message);
    const done = new Set((relayed ?? []).map((b) => b.authority_warning_id));
    return (warnings ?? []).map((w) => ({ ...w, relayed: done.has(w.id) }));
  },
});

function BroadcastConsole() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const qc = useQueryClient();
  const roles = useQuery(myRolesQuery);
  const isAdmin = (roles.data ?? []).includes("admin");

  const settings = useQuery({ ...settingsQuery, enabled: isAdmin });
  const audit = useQuery({ ...auditQuery, enabled: isAdmin });
  const warnings = useQuery({ ...warningsQuery, enabled: isAdmin });
  const units = useQuery({ ...adminUnitsQuery, enabled: isAdmin });
  const wilayas = (units.data ?? []).filter((u) => u.level === "wilaya");

  const [form, setForm] = useState({
    source: "",
    received_via: "phone",
    body: "",
    severity: "Severe",
    wilaya_id: "",
  });

  const toggle = useMutation({
    mutationFn: setBroadcastEnabled,
    onSuccess: (transition) => applyBroadcastTransition(qc, transition),
  });

  const relay = useMutation({
    mutationFn: () => submitAuthorityWarning(form),
    onSuccess: () => {
      setForm({ ...form, source: "", body: "" });
      void qc.invalidateQueries({ queryKey: ["authority_warnings"] });
    },
  });

  if (roles.isLoading)
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  if (!isAdmin)
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        {t("broadcastAdmin.forbidden")}
      </main>
    );

  const confirmedSettings = hasConfirmedBroadcastSettings(
    settings.data,
    settings.isError,
  )
    ? settings.data
    : null;
  const hasSettings = confirmedSettings !== null;
  const broadcastingEnabled = confirmedSettings?.enabled ?? null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-display text-xl font-semibold">
          {t("broadcastAdmin.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("broadcastAdmin.subtitle")}
        </p>
      </header>

      <section className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {t("broadcastAdmin.killTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {settings.isLoading
                ? t("common.loading")
                : broadcastingEnabled === true
                  ? t("broadcastAdmin.killOn")
                  : broadcastingEnabled === false
                    ? t("broadcastAdmin.killOff")
                    : t("broadcastAdmin.toggleFailed")}
            </p>
          </div>
          <button
            type="button"
            disabled={toggle.isPending || !hasSettings}
            onClick={() => {
              if (broadcastingEnabled !== null)
                toggle.mutate(!broadcastingEnabled);
            }}
            aria-pressed={
              broadcastingEnabled === null ? undefined : !broadcastingEnabled
            }
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={
              broadcastingEnabled === null
                ? {
                    backgroundColor: "var(--muted)",
                    color: "var(--muted-foreground)",
                  }
                : broadcastingEnabled === true
                  ? {
                      backgroundColor: "var(--emergency)",
                      color: "var(--emergency-foreground, #fff)",
                    }
                  : { backgroundColor: "var(--accent)", color: "#fff" }
            }
          >
            {broadcastingEnabled === null
              ? t("status.state.unavailable")
              : broadcastingEnabled
                ? t("broadcastAdmin.killStop")
                : t("broadcastAdmin.killResume")}
          </button>
        </div>
        {toggle.isError ? (
          <p className="mt-2 text-xs" style={{ color: "var(--emergency)" }}>
            {t(
              toggle.error instanceof BroadcastAdminError
                ? toggle.error.message
                : "broadcastAdmin.toggleFailed",
            )}
          </p>
        ) : null}
        {settings.isError ? (
          <p className="mt-2 text-xs" style={{ color: "var(--emergency)" }}>
            {t("broadcastAdmin.toggleFailed")}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">
          {t("broadcastAdmin.relayTitle")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("broadcastAdmin.relayNote")}
        </p>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            relay.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("broadcastAdmin.source")}
            <input
              required
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Protection Civile — Wilaya de Tizi Ouzou"
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("broadcastAdmin.receivedVia")}
            <select
              value={form.received_via}
              onChange={(e) =>
                setForm({ ...form, received_via: e.target.value })
              }
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            >
              {["phone", "fax", "email", "in_person"].map((v) => (
                <option key={v} value={v}>
                  {t(`broadcastAdmin.via.${v}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">
            {t("broadcastAdmin.body")}
            <textarea
              required
              maxLength={1500}
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("broadcastAdmin.wilaya")}
            <select
              required
              value={form.wilaya_id}
              onChange={(e) => setForm({ ...form, wilaya_id: e.target.value })}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            >
              <option value="">—</option>
              {wilayas.map((w) => (
                <option key={w.id} value={w.id}>
                  {unitName(w, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("broadcastAdmin.severity")}
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            >
              <option value="Severe">Severe</option>
              <option value="Extreme">Extreme</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={relay.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t("broadcastAdmin.submit")}
            </button>
            {relay.isError ? (
              <span
                className="ms-3 text-xs"
                style={{ color: "var(--emergency)" }}
              >
                {t(
                  relay.error instanceof BroadcastAdminError
                    ? relay.error.message
                    : "broadcastAdmin.warningFailed",
                )}
              </span>
            ) : null}
          </div>
        </form>
        {warnings.data?.length ? (
          <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
            {warnings.data.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-xs">
                <span className="font-medium">{w.source}</span>
                <span className="truncate text-muted-foreground">{w.body}</span>
                <span className="ms-auto shrink-0 text-muted-foreground">
                  {relativeTime(w.created_at, locale)}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5"
                  style={
                    w.relayed
                      ? {
                          backgroundColor: "var(--accent-tint)",
                          color: "var(--accent)",
                        }
                      : { backgroundColor: "var(--muted)" }
                  }
                >
                  {w.relayed
                    ? t("broadcastAdmin.relayed")
                    : t("broadcastAdmin.pendingRelay")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">
          {t("broadcastAdmin.auditTitle")}
        </h2>
        {audit.isError ? (
          <p className="mt-2 text-xs" style={{ color: "var(--emergency)" }}>
            {t("broadcastAdmin.toggleFailed")}
          </p>
        ) : audit.data?.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-start text-muted-foreground">
                <tr>
                  <th className="py-1 pe-3 text-start">
                    {t("broadcastAdmin.colTime")}
                  </th>
                  <th className="py-1 pe-3 text-start">
                    {t("broadcastAdmin.colAction")}
                  </th>
                  <th className="py-1 pe-3 text-start">
                    {t("broadcastAdmin.colReason")}
                  </th>
                  <th className="py-1 pe-3 text-start">
                    {t("broadcastAdmin.colActor")}
                  </th>
                  <th className="py-1 pe-3 text-start">
                    {t("broadcastAdmin.colCommunes")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-1.5 pe-3 text-muted-foreground">
                      {relativeTime(row.at, locale)}
                    </td>
                    <td
                      className="py-1.5 pe-3 font-medium"
                      style={
                        row.action === "suppressed"
                          ? { color: "var(--emergency)" }
                          : undefined
                      }
                    >
                      {row.action}
                    </td>
                    <td className="py-1.5 pe-3">
                      {row.reason}
                      {row.kind ? ` · ${row.kind}` : ""}
                      {row.severity ? ` · ${row.severity}` : ""}
                    </td>
                    <td className="py-1.5 pe-3 font-mono text-[11px]">
                      {row.actor_id ?? t("broadcastAdmin.systemActor")}
                    </td>
                    <td className="py-1.5 pe-3 tabular">
                      {row.commune_codes?.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("broadcastAdmin.auditEmpty")}
          </p>
        )}
      </section>
    </main>
  );
}
