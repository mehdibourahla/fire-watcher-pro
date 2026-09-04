import type { AdminTranslation } from "./en";

export const adminFr: AdminTranslation = {
  nav: {
    triage: "Triage",
    sources: "Sources",
    fires: "Incendies",
    risk: "Risque",
    incidents: "Incidents",
    broadcasts: "Diffusions",
    queues: "Files",
    places: "Lieux",
    people: "Personnes",
    audit: "Journal",
  },
  shell: {
    title: "Exploitation",
    noAccess: "Cet espace est réservé aux opérateurs de Nadhir.",
  },
  triage: {
    title: "À traiter",
    allClear: "Tout est à jour.",
    checkedAt: "Vérifié {{time}}",
    killSwitch: "Les diffusions sont suspendues par le coupe-circuit.",
    sourceStale: "{{count}} sources ne transmettent plus.",
    riskUnpublished:
      "La prévision de risque n'a pas été publiée pour le point du jour.",
    firesAwaiting:
      "{{count}} incendies attendent une résolution au-dessus du seuil d'alerte.",
    translationUnapplied:
      "{{count}} traductions acceptées ne sont pas arrivées dans leur fichier.",
    queueDepth: "{{count}} éléments attendent une relecture.",
  },
  role: {
    admin: "administrateur",
    operator: "opérateur",
    report_moderator: "modérateur des signalements",
    translator: "traducteur",
    incident_editor: "éditeur d'incidents",
    user: "membre",
  },
};
