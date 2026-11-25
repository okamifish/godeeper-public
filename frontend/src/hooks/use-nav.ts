import { usePathname } from "next/navigation";
import type { NavGroup } from "@/types";

export function useNav() {
  const pathname = usePathname();
  return { pathname };
}

export function useFilteredNavGroups(groups: NavGroup[]): NavGroup[] {
  return groups;
}
