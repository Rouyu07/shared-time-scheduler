"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sectionTitles: Record<string, string> = {
  availability: "填寫可行時間",
  results: "推薦結果",
  vote: "投票決定時間",
  members: "成員進度",
  discussion: "討論",
  more: "更多",
  manage: "管理排程",
  confirmed: "正式會議",
};

export default function MobileHeader() {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <header className="mobile-header mobile-home-header">
        <Link className="brand" href="/" aria-label="REX 合時首頁">
          <span className="rex-logo"><img src="/rex-logo.png" alt="REX" /></span>
          <span className="brand-product">合時</span>
        </Link>
      </header>
    );
  }
  const parts = pathname.split("/").filter(Boolean);
  const isNew = pathname === "/s/new";
  const scheduleId = !isNew && parts[0] === "s" ? parts[1] : null;
  const section = parts[2] ?? "overview";
  return (
    <header className="mobile-header mobile-task-header">
      <Link href={scheduleId ? `/s/${scheduleId}` : "/"} aria-label="返回">
        ←
      </Link>
      <strong>{isNew ? "建立排程" : sectionTitles[section] ?? "排程進度"}</strong>
      <span aria-hidden="true" />
    </header>
  );
}
