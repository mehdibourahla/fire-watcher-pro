import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { EmergencyNumbers } from "@/components/SiteChrome";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Nadhir — methodology & data sources" },
      {
        name: "description",
        content:
          "How Nadhir detects wildfires in Algeria, how fire danger is computed, and which open data sources and licences it uses.",
      },
      {
        property: "og:title",
        content: "About Nadhir — methodology & data sources",
      },
      {
        property: "og:description",
        content:
          "Detection method, fire danger rating, limits and open data licences behind Nadhir.",
      },
    ],
  }),
  component: AboutPage,
});

// Only sources the system actually contacts are credited; EFFIS/GWIS is not yet wired up.
const SOURCES = [
  {
    name: "NASA FIRMS (VIIRS / MODIS)",
    licence: "Public domain",
    url: "https://firms.modaps.eosdis.nasa.gov/",
  },
  {
    name: "EUMETSAT Meteosat MTG FCI",
    licence: "EUMETSAT open data",
    url: "https://www.eumetsat.int/",
  },
  {
    name: "Open-Meteo weather",
    licence: "CC-BY 4.0",
    url: "https://open-meteo.com/",
  },
  {
    name: "OpenStreetMap",
    licence: "ODbL",
    url: "https://www.openstreetmap.org/copyright",
  },
];

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </section>
  );
}

function AboutPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[820px] px-4 py-8">
      <h1 className="text-2xl">{t("about.title")}</h1>
      <Section title={t("about.missionTitle")} body={t("about.mission")} />
      <Section title={t("about.howTitle")} body={t("about.how")} />
      <Section title={t("about.dangerTitle")} body={t("about.danger")} />
      <Section title={t("about.limitsTitle")} body={t("about.limits")} />
      <Section title={t("about.dataTitle")} body={t("about.data")} />

      <ul className="panel mt-4 divide-y divide-border text-sm">
        {SOURCES.map((s) => (
          <li
            key={s.name}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              {s.name}
            </a>
            <span className="text-xs text-muted-foreground">{s.licence}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <EmergencyNumbers />
      </div>
    </div>
  );
}
