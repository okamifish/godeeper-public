import type { NavGroup } from "@/types";

export const navConfig = {
  title: "GoDeeper Admin",
  url: "https://godeeper.app",
};

export const navGroups: NavGroup[] = [
  {
    label: "Admin",
    items: [
      { title: "Dashboard", url: "/admin", icon: "dashboard", isActive: true, items: [] },
      { title: "Users", url: "/admin/users", icon: "teams", items: [] },
    ],
  },
];
