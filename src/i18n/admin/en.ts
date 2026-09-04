export const adminEn = {
  nav: {
    triage: "Triage",
    sources: "Sources",
    fires: "Fires",
    risk: "Risk",
    incidents: "Incidents",
    broadcasts: "Broadcasts",
    queues: "Queues",
    places: "Places",
    people: "People",
    audit: "Audit",
  },
  shell: {
    title: "Operations",
    noAccess: "This area is reserved for Nadhir operators.",
  },
  triage: {
    title: "What needs attention",
    allClear: "Everything is current.",
    checkedAt: "Checked {{time}}",
    killSwitch: "Broadcasts are suppressed by the kill-switch.",
    sourceStale: "{{count}} sources have stopped reporting.",
    riskUnpublished:
      "The risk forecast has not published for today's checkpoint.",
    firesAwaiting: "{{count}} fires await resolution above the alerting bar.",
    translationUnapplied:
      "{{count}} accepted translations have not reached their locale file.",
    queueDepth: "{{count}} items are waiting to be reviewed.",
  },
  role: {
    admin: "administrator",
    operator: "operator",
    report_moderator: "report moderator",
    translator: "translator",
    incident_editor: "incident editor",
    user: "member",
  },
};

export type AdminTranslation = typeof adminEn;
