import type { Metadata, Viewport } from "next";
import Link from "next/link";
import MobileNavigation from "@/components/mobile-navigation";
import MobileHeader from "@/components/mobile-header";
import NotificationCenter from "@/components/notification-center";
import "./globals.css";
import "./brand.css";
export const metadata: Metadata = {
  title: "合時｜REX",
  description: "讓每個人的時間，找到交集。免註冊的多人共同時間排程。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>
        <MobileHeader />
        <NotificationCenter />
        <header className="site-header">
          <Link className="brand" href="/" aria-label="REX 合時首頁">
            <span className="rex-logo">
              <img src="/rex-logo.png" alt="REX" />
            </span>
            <span className="brand-product">
              合時<small>BY REX</small>
            </span>
          </Link>
          <div id="desktop-identity-slot" />
        </header>
        {children}
        <MobileNavigation />
        <footer id="about">
          <div className="footer-brand">
            <span className="rex-logo">
              <img src="/rex-logo.png" alt="REX 開發團隊" />
            </span>
            <span>
              合時
              <small>A LITTLE LESS PLANNING. A LITTLE MORE TOGETHER.</small>
            </span>
          </div>
          <span>讓相聚，從一個好時間開始。</span>
        </footer>
      </body>
    </html>
  );
}
