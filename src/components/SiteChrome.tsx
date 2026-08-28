import { Link } from "@tanstack/react-router";
import { Bell, Flame, MapPin, Settings, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/BrandMark";
import { RISK_LEVELS, riskSolid } from "@/components/nadhir/risk-visuals";
import { LOCALES, LOCALE_LABELS, applyLocale } from "@/i18n";
import { dangerLevelKey } from "@/lib/nadhir";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/", key: "nav.map" },
  { to: "/forecast", key: "nav.forecast" },
  { to: "/history", key: "nav.history" },
  { to: "/status", key: "nav.status" },
  { to: "/about", key: "nav.about" },
] as const;

const TABS = [
  { to: "/", key: "nav.map", Icon: MapPin },
  { to: "/forecast", key: "nav.forecast", Icon: Flame },
  { to: "/alerts", key: "nav.alerts", Icon: Bell },
  { to: "/settings", key: "nav.settings", Icon: Settings },
] as const;

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={t("nav.language")}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          onClick={() => applyLocale(locale)}
          aria-current={i18n.language === locale ? "true" : undefined}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            i18n.language === locale
              ? "bg-[var(--accent-tint)] text-[var(--accent)]"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}

export function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="h-6 w-6 shrink-0" />
          <span className="font-display text-lg font-semibold">
            {t("common.appName")}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("common.tagline")}
          </span>
        </Link>

        <nav
          className="ms-4 hidden items-center gap-1 lg:flex"
          aria-label={t("nav.map")}
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:font-medium [&.active]:text-foreground"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Link
            to="/zones"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {t("nav.account")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function BottomTabs() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.map")}
      className="sticky bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface lg:hidden"
    >
      {TABS.map(({ to, key, Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === "/" }}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground [&.active]:text-[var(--accent)]"
        >
          <Icon aria-hidden className="size-5" />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

export function EmergencyNumbers({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const numbers = [
    { label: t("emergency.civil"), number: "14" },
    { label: t("emergency.forest"), number: "1070" },
    { label: t("emergency.general"), number: "112" },
  ];

  return (
    <section
      className={cn("rounded-xl px-4 py-3", compact ? "text-xs" : "text-sm")}
      style={{ backgroundColor: "var(--emergency-surface)" }}
    >
      <h2
        className="flex items-center gap-2 font-medium"
        style={{ color: "var(--emergency)", fontFamily: "inherit" }}
      >
        <TriangleAlert aria-hidden className="size-4" />
        {t("emergency.title")}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {numbers.map((n) => (
          <li key={n.number} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{n.label}</span>
            <a
              href={`tel:${n.number}`}
              className="tabular font-semibold underline underline-offset-2"
              style={{ color: "var(--emergency)" }}
            >
              {n.number}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RiskLegend({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {t("risk.legend")}
      </span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{
                backgroundColor: riskSolid(level),
                boxShadow: "0 0 0 1.5px var(--mark-ring)",
              }}
            />
            <span className="tabular text-muted-foreground">{level}</span>
            <span>{t(`risk.${dangerLevelKey(level)}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-muted-foreground">
        <span>{t("common.appName")}</span>
        <Link to="/about" className="hover:text-foreground">
          {t("nav.about")}
        </Link>
        <Link to="/developers" className="hover:text-foreground">
          {t("nav.developers")}
        </Link>
        <Link to="/status" className="hover:text-foreground">
          {t("nav.status")}
        </Link>
        <Link to="/terms" className="hover:text-foreground">
          {t("legal.terms")}
        </Link>
        <Link to="/privacy" className="hover:text-foreground">
          {t("legal.privacy")}
        </Link>
        <span className="ms-auto">{t("about.attribution")}</span>
      </div>
    </footer>
  );
}

export function DegradedBanner({ onDismiss }: { onDismiss?: () => void }) {
  const { t } = useTranslation();
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
      style={{
        backgroundColor: "var(--emergency-surface)",
        color: "var(--emergency)",
      }}
    >
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      {t("map.degraded")}
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="ms-auto underline">
          {t("common.dismiss")}
        </button>
      ) : null}
    </p>
  );
}
