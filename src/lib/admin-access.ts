import type { AttentionItem } from "./admin-attention";
import type { AppRole } from "./roles";

export type AdminGroup =
  "overview" | "review" | "operations" | "reference" | "admin";

export type AdminSection = {
  key: string;
  path: string;
  group: AdminGroup;
  roles: AppRole[];
  attention: AttentionItem[];
};

const PANEL_ROLES: AppRole[] = [
  "admin",
  "operator",
  "report_moderator",
  "translator",
  "incident_editor",
];
const OPS: AppRole[] = ["operator", "admin"];

export const ADMIN_GROUPS: AdminGroup[] = [
  "overview",
  "review",
  "operations",
  "reference",
  "admin",
];

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: "overview",
    path: "/admin",
    group: "overview",
    roles: PANEL_ROLES,
    attention: [],
  },
  {
    key: "fires",
    path: "/admin/fires",
    group: "review",
    roles: OPS,
    attention: ["fires"],
  },
  {
    key: "queues",
    path: "/admin/queues",
    group: "review",
    roles: ["report_moderator", "translator", "admin"],
    attention: ["citizen_reports", "translations", "ideas"],
  },
  {
    key: "sources",
    path: "/admin/sources",
    group: "operations",
    roles: OPS,
    attention: [
      "sources_unhealthy",
      "operational_incidents",
      "source_gaps",
      "ita_review",
      "ita_failed",
    ],
  },
  {
    key: "broadcasts",
    path: "/admin/broadcasts",
    group: "operations",
    roles: ["admin"],
    attention: ["broadcasting_off", "delivery_backlog"],
  },
  {
    key: "risk",
    path: "/admin/risk",
    group: "operations",
    roles: OPS,
    attention: ["risk_pending"],
  },
  {
    key: "incidents",
    path: "/admin/incidents",
    group: "reference",
    roles: ["incident_editor", "operator", "admin"],
    attention: [],
  },
  {
    key: "places",
    path: "/admin/places",
    group: "reference",
    roles: OPS,
    attention: [],
  },
  {
    key: "people",
    path: "/admin/people",
    group: "admin",
    roles: ["admin"],
    attention: [],
  },
  {
    key: "audit",
    path: "/admin/audit",
    group: "admin",
    roles: PANEL_ROLES,
    attention: [],
  },
];

export function sectionsFor(roles: readonly string[]): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) =>
    section.roles.some((role) => roles.includes(role)),
  );
}

export function canReachPanel(roles: readonly string[]): boolean {
  return sectionsFor(roles).length > 0;
}
