import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Check, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Locale, isLocale } from "@/i18n";
import { FCM_LANGS } from "@/lib/fcm";
import { adminUnitsQuery, unitName, type AdminUnit } from "@/lib/nadhir";
import {
  INVITE_SEEN_KEY,
  MAX_COMMUNES,
  pushConfigured,
  pushSupported,
  readSubscription,
  subscribeToCommunes,
  unsubscribeAll,
} from "@/lib/push";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onClose: () => void };

type Step = "pick" | "permission";

export function SubscribeInvite() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(INVITE_SEEN_KEY) && !readSubscription())
        setVisible(true);
    } catch {
      // no storage, no invite — the header bell remains
    }
  }, []);

  const seen = () => {
    try {
      localStorage.setItem(INVITE_SEEN_KEY, "1");
    } catch {
      // ignored: worst case the invite shows again next visit
    }
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <>
      <section className="rounded-xl border border-[var(--accent)] bg-[var(--accent-tint)] p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Bell aria-hidden className="size-4 text-[var(--accent)]" />
          {t("push.inviteTitle")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("push.inviteBody")}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              seen();
              setOpen(true);
            }}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {t("push.inviteCta")}
          </button>
          <button
            type="button"
            onClick={seen}
            className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            {t("push.inviteLater")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("push.inviteOnce")}
        </p>
      </section>
      {open ? (
        <SubscribeSheet open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function SubscribeSheet({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "ar";
  const { data: units } = useQuery({ ...adminUnitsQuery, enabled: open });

  const existing = readSubscription();
  const [step, setStep] = useState<Step>("pick");
  const [codes, setCodes] = useState<string[]>(existing?.communes ?? []);
  const [lang, setLang] = useState<string>(existing?.lang ?? locale);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const communes = useMemo(
    () => (units ?? []).filter((u) => u.level === "commune"),
    [units],
  );
  const wilayaById = useMemo(
    () =>
      new Map(
        (units ?? []).filter((u) => u.level === "wilaya").map((u) => [u.id, u]),
      ),
    [units],
  );
  const byCode = useMemo(
    () => new Map(communes.map((c) => [c.code, c])),
    [communes],
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length < 2) return [];
    return communes
      .filter((c) =>
        [c.name_ar, c.name_fr, c.name_en, c.name_kab]
          .filter(Boolean)
          .some((n) => n!.toLowerCase().includes(needle)),
      )
      .slice(0, 8);
  }, [communes, search]);

  const supported = pushSupported();
  const configured = pushConfigured();
  const denied =
    supported && typeof Notification !== "undefined"
      ? Notification.permission === "denied"
      : false;

  const close = () => {
    setStep("pick");
    setError(null);
    setDone(false);
    onClose();
  };

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await subscribeToCommunes(codes, lang);
      setDone(true);
      setStep("pick");
    } catch (e) {
      setError(
        e instanceof Error && e.message === "permission_denied"
          ? t("push.denied")
          : t("push.error"),
      );
      setStep("pick");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeAll();
      setCodes([]);
      setDone(false);
    } catch {
      setError(t("push.error"));
    } finally {
      setBusy(false);
    }
  };

  const communeRow = (code: string) => {
    const commune = byCode.get(code);
    if (!commune) return null;
    const wilaya = commune.parent_id ? wilayaById.get(commune.parent_id) : null;
    return (
      <li
        key={code}
        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {unitName(commune, locale)}
          </p>
          {wilaya ? (
            <p className="truncate text-xs text-muted-foreground">
              {unitName(wilaya, locale)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("common.delete")}
          onClick={() => setCodes(codes.filter((c) => c !== code))}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        >
          <X aria-hidden className="size-4" />
        </button>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {step === "permission" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("push.permissionTitle")}</DialogTitle>
              <DialogDescription>{t("push.permissionBody")}</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-start gap-2">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
                  />
                  {t(`push.permissionPoint${n}`)}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={activate}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {t("push.permissionContinue")}
              </button>
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted"
              >
                {t("push.permissionLater")}
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell aria-hidden className="size-5 text-[var(--accent)]" />
                {t("push.sheetTitle")}
              </DialogTitle>
              <DialogDescription>{t("push.sheetBody")}</DialogDescription>
            </DialogHeader>

            {!supported ? (
              <p className="text-sm text-muted-foreground">
                {t("push.unsupported")}
              </p>
            ) : !configured ? (
              <p className="text-sm text-muted-foreground">
                {t("push.unavailable")}
              </p>
            ) : (
              <>
                {denied ? (
                  <p
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{
                      backgroundColor: "var(--emergency-surface)",
                      color: "var(--emergency)",
                    }}
                  >
                    {t("push.denied")}
                  </p>
                ) : null}

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("push.yourCommunes")}
                  </h3>
                  <ul className="space-y-1.5">{codes.map(communeRow)}</ul>
                  {codes.length < MAX_COMMUNES ? (
                    <div className="relative mt-2">
                      <Search
                        aria-hidden
                        className="absolute start-2.5 top-2.5 size-4 text-muted-foreground"
                      />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("push.searchCommune")}
                        aria-label={t("push.addCommune")}
                        className="w-full rounded-lg border border-border bg-transparent py-2 pe-3 ps-8 text-sm"
                      />
                      {matches.length ? (
                        <ul className="mt-1 overflow-hidden rounded-lg border border-border">
                          {matches.map((c: AdminUnit) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!codes.includes(c.code))
                                    setCodes([...codes, c.code]);
                                  setSearch("");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
                              >
                                <Plus
                                  aria-hidden
                                  className="size-3.5 text-muted-foreground"
                                />
                                {unitName(c, locale)}
                                {c.parent_id && wilayaById.get(c.parent_id) ? (
                                  <span className="text-xs text-muted-foreground">
                                    {unitName(
                                      wilayaById.get(c.parent_id)!,
                                      locale,
                                    )}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t("push.maxCommunes", { max: MAX_COMMUNES })}
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("push.lang")}
                  </h3>
                  <div className="flex gap-1" role="group">
                    {FCM_LANGS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        lang={l}
                        onClick={() => setLang(l)}
                        aria-pressed={lang === l}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-xs font-medium",
                          lang === l
                            ? "bg-[var(--accent-tint)] text-[var(--accent)]"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {
                          {
                            ar: "العربية",
                            fr: "Français",
                            en: "EN",
                            kab: "Taqbaylit",
                          }[l]
                        }
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("push.whatTitle")}
                  </h3>
                  <ul className="space-y-1 text-sm">
                    <li className="flex items-center justify-between">
                      <span>{t("push.whatFires")}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("push.whatFiresAlways")}
                      </span>
                    </li>
                    <li>{t("push.whatOnm")}</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("push.noDanger")}
                  </p>
                </section>

                {error ? (
                  <p className="text-xs" style={{ color: "var(--emergency)" }}>
                    {error}
                  </p>
                ) : null}
                {done ? (
                  <p className="text-xs text-[var(--accent)]">
                    {t("push.active", { count: codes.length })}
                  </p>
                ) : null}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy || !codes.length || denied}
                    onClick={() =>
                      Notification.permission === "granted"
                        ? activate()
                        : setStep("permission")
                    }
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {existing ? t("push.update") : t("push.activate")}
                  </button>
                  {existing ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={disable}
                      aria-label={t("push.disable")}
                      title={t("push.disable")}
                      className="rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-muted"
                    >
                      <BellOff aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
