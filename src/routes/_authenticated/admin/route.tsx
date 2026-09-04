import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { sectionsFor } from "@/lib/admin-access";
import { myRolesQuery } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminShell,
});

function AdminShell() {
  const { t } = useTranslation("admin");
  const roles = useQuery(myRolesQuery);

  if (roles.isLoading) return null;

  const sections = sectionsFor(roles.data ?? []);

  if (sections.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("shell.noAccess")}</p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row">
      <nav aria-label={t("shell.title")} className="md:w-48 md:shrink-0">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("shell.title")}
        </p>
        <ul className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {sections.map((section) => (
            <li key={section.key}>
              {section.ready ? (
                <Link
                  to={section.path}
                  activeOptions={{ exact: section.path === "/admin" }}
                  className="block whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  activeProps={{
                    className: "bg-muted font-medium text-foreground",
                  }}
                >
                  {t(`nav.${section.key}`)}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="block whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground/50"
                >
                  {t(`nav.${section.key}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
