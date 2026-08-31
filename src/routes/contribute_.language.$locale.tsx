import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  REVIEWABLE,
  SUGGESTION_MAX,
  countSubmittable,
  groupRows,
  isSubmittable,
  readDrafts,
  readReviewerKey,
  rowsFor,
  writeDrafts,
  type Draft,
  type DraftMap,
  type ReviewableLocale,
  type StringRow,
} from "@/lib/translate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contribute_/language/$locale")({
  beforeLoad: ({ params }) => {
    if (!REVIEWABLE.includes(params.locale as ReviewableLocale))
      throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Review a translation — Nadhir" },
      {
        name: "description",
        content:
          "Read Nadhir's interface strings beside their English source and suggest corrections. No account needed.",
      },
    ],
  }),
  component: ReviewPage,
});

type Filter = "all" | "todo" | "changed" | "confirmed";

function Row({
  row,
  draft,
  rtl,
  onChange,
}: {
  row: StringRow;
  draft: Draft | undefined;
  rtl: boolean;
  onChange: (next: Draft | undefined) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const suggesting = open || draft?.verdict === "suggested";
  const confirmed = draft?.verdict === "confirmed";

  return (
    <li
      className={cn(
        "grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-start md:gap-5",
        confirmed && "bg-[var(--accent-tint)]/40",
      )}
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10.5px] leading-none text-faint">
          {row.path}
        </span>
        <span dir="ltr" className="text-[13.5px] leading-relaxed">
          {row.source}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span
          dir={rtl ? "rtl" : "ltr"}
          className={cn(
            "text-[13.5px] leading-relaxed",
            suggesting ? "text-faint line-through" : "text-muted-foreground",
          )}
        >
          {row.current || "—"}
        </span>

        {suggesting ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              autoFocus={open && !draft}
              dir={rtl ? "rtl" : "ltr"}
              maxLength={SUGGESTION_MAX}
              value={draft?.suggestion ?? ""}
              onChange={(e) =>
                onChange({ verdict: "suggested", suggestion: e.target.value })
              }
              placeholder={t("translate.suggestionPlaceholder")}
              className="min-h-16 w-full rounded-md border border-[var(--accent)] bg-background p-2.5 text-[13.5px] leading-relaxed"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange(undefined);
              }}
              className="self-start text-xs text-muted-foreground underline underline-offset-2"
            >
              {t("translate.discard")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 md:flex-col md:items-stretch">
        <button
          type="button"
          aria-pressed={confirmed}
          onClick={() =>
            onChange(confirmed ? undefined : { verdict: "confirmed" })
          }
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
            confirmed
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Check aria-hidden className="size-3.5" />
          {t("translate.looksRight")}
        </button>
        {!suggesting ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              onChange({ verdict: "suggested", suggestion: row.current });
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil aria-hidden className="size-3.5" />
            {t("translate.suggest")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ReviewPage() {
  const { t } = useTranslation();
  const locale = Route.useParams().locale as ReviewableLocale;
  const rtl = locale === "ar";

  const rows = useMemo(() => rowsFor(locale), [locale]);
  const [drafts, setDrafts] = useState<DraftMap>(() => readDrafts(locale));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const update = (path: string, next: Draft | undefined) => {
    setDrafts((prev) => {
      const copy = { ...prev };
      if (next) copy[path] = next;
      else delete copy[path];
      writeDrafts(locale, copy);
      return copy;
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const draft = drafts[row.path];
      if (filter === "todo" && draft) return false;
      if (filter === "changed" && draft?.verdict !== "suggested") return false;
      if (filter === "confirmed" && draft?.verdict !== "confirmed")
        return false;
      if (!q) return true;
      return (
        row.source.toLowerCase().includes(q) ||
        row.current.toLowerCase().includes(q) ||
        row.path.toLowerCase().includes(q)
      );
    });
  }, [rows, drafts, filter, query]);

  const groups = useMemo(() => groupRows(visible), [visible]);
  const pending = countSubmittable(drafts);
  const reviewed = Object.keys(drafts).length;

  const submit = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(drafts)
        .filter(([, d]) => isSubmittable(d))
        .map(([path, d]) => {
          const row = rows.find((r) => r.path === path);
          return {
            keyPath: path,
            sourceText: row?.source ?? "",
            currentText: row?.current ?? "",
            suggestion: d.suggestion ?? null,
            verdict: d.verdict,
            note: d.note ?? null,
          };
        });
      const res = await fetch("/api/public/contribute/translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          reviewerKey: readReviewerKey(),
          reviewerName: name || null,
          rows: payload,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        saved?: number;
        reason?: string;
      };
      if (!body.ok) throw new Error(body.reason ?? "failed");
      return body.saved ?? 0;
    },
    onSuccess: (saved) => {
      setSent(saved);
      setError(null);
      setDrafts({});
      writeDrafts(locale, {});
    },
    onError: (e: Error) =>
      setError(
        e.message === "rateLimited"
          ? t("translate.errRateLimited")
          : t("translate.errFailed"),
      ),
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t("translate.filterAll") },
    { key: "todo", label: t("translate.filterTodo") },
    { key: "changed", label: t("translate.filterChanged") },
    { key: "confirmed", label: t("translate.filterConfirmed") },
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-32 pt-10">
      <Link
        to="/contribute"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
        {t("translate.back")}
      </Link>

      <header className="mt-5 flex flex-col gap-4">
        <h1 className="font-display text-[clamp(28px,5vw,40px)] font-semibold leading-tight">
          {t("translate.title", { language: t(`translate.lang_${locale}`) })}
        </h1>
        <p className="max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground">
          {t("translate.lede")}
        </p>
      </header>

      <div className="card mt-7 flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-sm font-medium">
            {t("translate.progress", { done: reviewed, total: rows.length })}
          </span>
          <span className="tabular text-xs text-faint">
            {Math.round((reviewed / rows.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(reviewed / rows.length) * 100}%` }}
          />
        </div>
        <p className="text-xs leading-relaxed text-faint">
          {t("translate.draftNote")}
        </p>
      </div>

      <div className="sticky top-14 z-10 -mx-5 mt-6 flex flex-wrap items-center gap-2 border-b border-border bg-ground/95 px-5 py-3 backdrop-blur">
        <div className="relative flex-1 md:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("translate.search")}
            className="h-9 w-full rounded-md border border-border bg-background ps-9 pe-3 text-[13.5px]"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.key
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          {t("translate.noMatches")}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {groups.map((group) => {
            const collapsed = openGroups[group.key] === false;
            const done = group.rows.filter((r) => drafts[r.path]).length;
            return (
              <section key={group.key} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((p) => ({ ...p, [group.key]: collapsed }))
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      collapsed && "-rotate-90 rtl:rotate-90",
                    )}
                  />
                  <span className="flex flex-col">
                    <span className="font-display text-[15px] font-semibold">
                      {t(`translate.group_${group.key}`)}
                    </span>
                    <span className="font-mono text-[10.5px] text-faint">
                      {group.key}
                    </span>
                  </span>
                  <span className="tabular ms-auto text-xs text-muted-foreground">
                    {done} / {group.rows.length}
                  </span>
                </button>
                {!collapsed ? (
                  <ul className="border-t border-border">
                    {group.rows.map((row) => (
                      <Row
                        key={row.path}
                        row={row}
                        draft={drafts[row.path]}
                        rtl={rtl}
                        onChange={(next) => update(row.path, next)}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {pending > 0 || sent > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3 px-5 py-3">
            {sent > 0 ? (
              <>
                <Check aria-hidden className="size-4 text-[var(--accent)]" />
                <span className="text-sm">
                  {t("translate.sent", { count: sent })}
                </span>
                <button
                  type="button"
                  onClick={() => setSent(0)}
                  className="ms-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={t("common.dismiss")}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">
                  {t("translate.pending", { count: pending })}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("translate.namePlaceholder")}
                  className="h-9 w-40 rounded-md border border-border bg-background px-3 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDrafts({});
                    writeDrafts(locale, {});
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] text-muted-foreground"
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  {t("translate.clear")}
                </button>
                <button
                  type="button"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate()}
                  className="ms-auto inline-flex h-9 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {submit.isPending
                    ? t("translate.sending")
                    : t("translate.send")}
                </button>
              </>
            )}
          </div>
          {error ? (
            <p className="mx-auto max-w-[1100px] px-5 pb-3 text-[13px] text-[var(--emergency)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
