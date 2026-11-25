export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavItem {
  title: string;
  url: string;
  icon: string;
  shortcut?: string[];
  isActive?: boolean;
  items: NavItem[];
  access?: Record<string, unknown>;
}
