import Link from "next/link";
export default function NotFound() {
  return (
    <main className="narrow">
      <h1>找不到這個頁面</h1>
      <p>請確認分享連結是否完整。</p>
      <Link href="/">回首頁 →</Link>
    </main>
  );
}
