import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> 為每一場相聚，找到共同時間
        </div>
        <h1>
          大家的時間，
          <br />
          <span>終於對上了。</span>
        </h1>
        <p className="hero-copy">
          分組報告、專題討論，或一場期待已久的聚會。
          <br />
          分享連結、填上時間，讓合時幫你找到交集。
        </p>
        <Link className="button primary large" href="/s/new">
          建立第一個排程 <span>↗</span>
        </Link>
        <p className="quiet">不用註冊・每個人的時間都算數</p>
      </section>
      <section className="hero-visual" aria-label="共同時間示意圖">
        <div className="mock-heading">
          <span className="mini-logo">◷</span>
          <div>
            <b>下次討論，什麼時候？</b>
            <p>找到我們都能到的時間</p>
          </div>
          <span className="pill">示意</span>
        </div>
        <div className="mock-days">
          <span>時間</span>
          <b>週一</b>
          <b>週二</b>
          <b>週三</b>
          <b>週四</b>
        </div>
        {["18:00", "18:30", "19:00", "19:30"].map((time, row) => (
          <div className="mock-row" key={time}>
            <span>{time}</span>
            {[0, 1, 2, 3].map((col) => (
              <i
                key={col}
                className={
                  col === 2 ? "match" : (row + col) % 3 === 0 ? "partial" : ""
                }
              >
                {col === 2 ? "✓" : ""}
              </i>
            ))}
          </div>
        ))}
        <div className="mock-result">
          <span className="result-check">✓</span>
          <div>
            <b>找到共同的好時間</b>
            <p>週三 18:00 – 19:00</p>
          </div>
          <strong>
            4 / 4<span>都能參加</span>
          </strong>
        </div>
      </section>
      <section className="steps" id="how-it-works">
        <article>
          <span>01 / 建立</span>
          <h2>一個連結，邀請大家</h2>
          <p>設定日期、人數與會議時長，分享給這次要一起參加的人。</p>
        </article>
        <article>
          <span>02 / 填寫</span>
          <h2>留給每個人選擇</h2>
          <p>點選自己的可行時間，等全員提交，再找出最佳交集。</p>
        </article>
        <article>
          <span>03 / 決定</span>
          <h2>好時間，一起決定</h2>
          <p>多個最佳時段就投票，最後由發起者確認，加入個人行事曆。</p>
        </article>
      </section>
    </main>
  );
}
