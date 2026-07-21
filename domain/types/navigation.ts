export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: "command" | "signals" | "chat";
  disabled?: boolean;
};

export const primaryNavItems: NavItem[] = [
  {
    id: "command-center",
    label: "Command Center",
    href: "/",
    icon: "command",
  },
  {
    id: "signals",
    label: "Signals",
    href: "/signals/preview",
    icon: "signals",
    disabled: true,
  },
];
