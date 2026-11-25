import { usePathname } from "next/navigation";

export interface BreadcrumbItem {
  title: string;
  link: string;
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => ({
    title: segment.charAt(0).toUpperCase() + segment.slice(1),
    link: "/" + segments.slice(0, index + 1).join("/"),
  }));
}
