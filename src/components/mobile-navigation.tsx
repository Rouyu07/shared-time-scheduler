"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicItems = [
  { href: "/", label: "首頁", icon: "⌂" },
  { href: "/s/new", label: "建立", icon: "+" },
  { href: "/#how-it-works", label: "流程", icon: "✓" },
  { href: "/#about", label: "關於", icon: "•••" },
];

export default function MobileNavigation() {
  const pathname = usePathname();
  const isScheduleWorkspace = /^\/s\/[^/]+/.test(pathname) && pathname !== "/s/new";

  if (isScheduleWorkspace) return null;

  return (
    <nav
      className="mobile-bottom-nav public-mobile-navigation"
      aria-label="手機主導覽"
    >
      {publicItems.map((item) => {
        const active =
          item.href === "/s/new"
            ? pathname === "/s/new"
            : item.href === "/"
              ? pathname === "/"
              : false;
        return (
          <Link href={item.href} aria-current={active ? "page" : undefined} key={item.href}>
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
