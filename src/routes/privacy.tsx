import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Nadhir" },
      {
        name: "description",
        content:
          "What personal data Nadhir stores for wildfire alerts, how long it is kept, and how to delete your account data.",
      },
      { property: "og:title", content: "Privacy policy — Nadhir" },
      {
        property: "og:description",
        content:
          "Data collected by Nadhir for wildfire alerting, retention and deletion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  const sections = [
    "collect",
    "use",
    "retention",
    "sharing",
    "rights",
    "contact",
  ] as const;
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6">
      <h1 className="text-2xl">{t("legal.privacyTitle")}</h1>
      <div className="panel mt-4 space-y-4 p-5">
        {sections.map((s) => (
          <section key={s}>
            <h2 className="text-base">{t(`legal.privacy_${s}_title`)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`legal.privacy_${s}_body`)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
