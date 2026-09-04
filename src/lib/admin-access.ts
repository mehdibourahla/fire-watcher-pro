import type { AppRole } from "./roles";

export type AdminSection = {
  key: string;
  path: string;
  roles: AppRole[];
  ready: boolean;
};

const PANEL_ROLES: AppRole[] = [
  "admin",
  "operator",
  "report_moderator",
  "translator",
  "incident_editor",
];

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: "triage", path: "/admin", roles: PANEL_ROLES, ready: true },
  {
    key: "sources",
    path: "/admin/sources",
    roles: ["operator", "admin"],
    ready: true,
  },
  {
    key: "fires",
    path: "/admin/fires",
    roles: ["operator", "admin"],
    ready: true,
  },
  {
    key: "risk",
    path: "/admin/risk",
    roles: ["operator", "admin"],
    ready: true,
  },
  {
    key: "incidents",
    path: "/admin/incidents",
    roles: ["incident_editor", "operator", "admin"],
    ready: true,
  },
  {
    key: "broadcasts",
    path: "/admin/broadcasts",
    roles: ["operator", "admin"],
    ready: true,
  },
  {
    key: "queues",
    path: "/admin/queues",
    roles: ["report_moderator", "translator", "admin"],
    ready: true,
  },
  {
    key: "places",
    path: "/admin/places",
    roles: ["operator", "admin"],
    ready: true,
  },
  { key: "people", path: "/admin/people", roles: ["admin"], ready: true },
  { key: "audit", path: "/admin/audit", roles: PANEL_ROLES, ready: true },
];

export function sectionsFor(roles: AppRole[]): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) =>
    section.roles.some((role) => roles.includes(role)),
  );
}

export function canReachPanel(roles: AppRole[]): boolean {
  return sectionsFor(roles).length > 0;
}
