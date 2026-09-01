import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { requestNotificationPermission } from "@/components/AlertNotifier";

import { supabase } from "@/integrations/supabase/client";
import { LOCALES, LOCALE_LABELS, applyLocale, type Locale } from "@/i18n";
import { profileQuery } from "@/lib/account";
import { titledMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: titledMeta("nav.settings"),
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useQuery(profileQuery);
  const [draft, setDraft] = useState({
    display_name: "",
    phone: "",
    locale: "ar",
    alert_email: true,
    alert_push: false,
    min_danger_level: 3,
    quiet_hours_start: "",
    quiet_hours_end: "",
  });
  const [saved, setSaved] = useState(false);
  const [pushState, setPushState] = useState<
    NotificationPermission | "unsupported" | null
  >(null);

  useEffect(() => {
    if (!profile.data) return;
    setDraft({
      display_name: profile.data.display_name ?? "",
      phone: profile.data.phone ?? "",
      locale: profile.data.locale,
      alert_email: profile.data.alert_email,
      alert_push: profile.data.alert_push,
      min_danger_level: profile.data.min_danger_level,
      quiet_hours_start: profile.data.quiet_hours_start?.toString() ?? "",
      quiet_hours_end: profile.data.quiet_hours_end?.toString() ?? "",
    });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("no session");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: draft.display_name || null,
          phone: draft.phone || null,
          locale: draft.locale,
          alert_email: draft.alert_email,
          alert_push: draft.alert_push,
          min_danger_level: draft.min_danger_level,
          quiet_hours_start:
            draft.quiet_hours_start === ""
              ? null
              : Number(draft.quiet_hours_start),
          quiet_hours_end:
            draft.quiet_hours_end === "" ? null : Number(draft.quiet_hours_end),
        })
        .eq("id", auth.user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSaved(true);
      applyLocale(draft.locale as Locale);
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    qc.clear();
    void navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-6">
      <h1 className="text-2xl">{t("account.settingsTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("account.settingsSubtitle")}
      </p>

      <form
        className="panel mt-5 space-y-4 p-5 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-muted-foreground">
            {t("account.displayName")}
          </span>
          <input
            value={draft.display_name}
            onChange={(e) =>
              setDraft({ ...draft, display_name: e.target.value })
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">
            {t("account.phone")}
          </span>
          <input
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className="tabular w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">
            {t("nav.language")}
          </span>
          <select
            value={draft.locale}
            onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">
            {t("account.minLevel")}
          </span>
          <select
            value={draft.min_danger_level}
            onChange={(e) =>
              setDraft({ ...draft, min_danger_level: Number(e.target.value) })
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>
                {l} —{" "}
                {t(
                  `risk.${["low", "moderate", "high", "very_high", "extreme"][l - 1]}`,
                )}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-muted-foreground">
            {t("account.channels")}
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.alert_email}
              onChange={(e) =>
                setDraft({ ...draft, alert_email: e.target.checked })
              }
            />
            {t("account.channelEmail")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.alert_push}
              onChange={async (e) => {
                const on = e.target.checked;
                if (!on) {
                  setDraft({ ...draft, alert_push: false });
                  setPushState(null);
                  return;
                }
                const result = await requestNotificationPermission();
                setPushState(result);
                setDraft({ ...draft, alert_push: result === "granted" });
              }}
            />
            {t("account.channelPush")}
          </label>
          {pushState && pushState !== "granted" ? (
            <p className="text-xs text-destructive">
              {pushState === "unsupported"
                ? t("account.pushUnsupported")
                : t("account.pushDenied")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("account.pushHint")}
          </p>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-muted-foreground">
              {t("account.quietStart")}
            </span>
            <input
              type="number"
              min={0}
              max={23}
              value={draft.quiet_hours_start}
              onChange={(e) =>
                setDraft({ ...draft, quiet_hours_start: e.target.value })
              }
              className="tabular w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">
              {t("account.quietEnd")}
            </span>
            <input
              type="number"
              min={0}
              max={23}
              value={draft.quiet_hours_end}
              onChange={(e) =>
                setDraft({ ...draft, quiet_hours_end: e.target.value })
              }
              className="tabular w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("account.quietNote")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
          >
            {t("account.save")}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border px-4 py-2 hover:bg-secondary"
          >
            {t("account.signOut")}
          </button>
          {saved ? (
            <span className="text-xs text-muted-foreground">
              {t("account.saved")}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
