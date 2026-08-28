import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use & disclaimer — Nadhir" },
      {
        name: "description",
        content:
          "Nadhir is an informational wildfire early-warning service for Algeria. Read the terms of use, limitations and safety disclaimer.",
      },
      { property: "og:title", content: "Terms of use & disclaimer — Nadhir" },
      { property: "og:description", content: "Terms, limitations and safety disclaimer for the Nadhir wildfire service." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { t } = useTranslation();
  const sections = ["purpose", "noGuarantee", "emergency", "userContent", "licence", "changes"] as const;
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6">
      <h1 className="text-2xl">{t("legal.termsTitle")}</h1>
      <div className="panel mt-4 space-y-4 p-5">
        {sections.map((s) => (
          <section key={s}>
            <h2 className="text-base">{t(`legal.terms_${s}_title`)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`legal.terms_${s}_body`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
