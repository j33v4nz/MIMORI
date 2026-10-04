"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  Bot,
  Radar,
  GitCompare,
  ShieldCheck,
  KeyRound,
  Settings
} from "lucide-react";

export function NavLinks() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/events", label: "Events", icon: Layers },
    { href: "/agents", label: "Agents", icon: Bot },
    { href: "/detections", label: "Detections", icon: Radar },
    { href: "/behavior-diff", label: "Behavior Diff", icon: GitCompare },
    { href: "/rules", label: "Rules", icon: ShieldCheck },
    { href: "/keys", label: "API Keys", icon: KeyRound },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <ul className="flex-1 py-2 space-y-1">
      {links.map((link) => {
        const isActive =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 py-2.5 font-body-md text-sm transition-colors duration-75 ${
                isActive
                  ? "text-primary font-bold border-l-4 border-primary pl-4 bg-surface-container-low"
                  : "text-secondary pl-5 hover:text-on-surface hover:bg-surface-container-low"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 ${
                  isActive ? "text-primary" : "text-secondary"
                }`}
                aria-hidden="true"
              />
              <span>{link.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
