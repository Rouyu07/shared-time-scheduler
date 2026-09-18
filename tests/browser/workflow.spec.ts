import { test, expect, type Locator, type Page } from "@playwright/test";
import { db } from "../../src/lib/db";
const ids: string[] = [];

async function expectFixedMobileNavigation(page: Page, primaryCta?: Locator) {
  const nav = page.locator(".mobile-bottom-nav");
  await expect(nav).toBeVisible();
  const styles = await nav.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      bottom: Math.abs(innerHeight - box.bottom),
      links: Array.from(element.querySelectorAll("a")).map((link) => {
        const target = link.getBoundingClientRect();
        return { width: target.width, height: target.height };
      }),
    };
  });
  expect(styles.position).toBe("fixed");
  expect(styles.bottom).toBeLessThanOrEqual(1);
  expect(styles.links).toHaveLength(4);
  expect(styles.links.every((target) => target.width >= 44 && target.height >= 44)).toBeTruthy();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(nav).toBeVisible();
  const afterScroll = await nav.boundingBox();
  expect(afterScroll).not.toBeNull();
  expect(afterScroll!.y).toBeGreaterThanOrEqual(0);
  expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(845);

  if (primaryCta) {
    await primaryCta.scrollIntoViewIfNeeded();
    const [ctaBox, navBox] = await Promise.all([
      primaryCta.boundingBox(),
      nav.boundingBox(),
    ]);
    expect(ctaBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  }
}

async function expectMobileWidths(page: Page) {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
test.afterAll(async () => {
  await db.schedule.deleteMany({ where: { publicId: { in: ids } } });
  await db.$disconnect();
});
test("desktop and mobile: create, join, submit, automatic voting, close, confirm and calendar", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /大家的時間/ })).toBeVisible();
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFixedMobileNavigation(
    page,
    page.getByRole("link", { name: "建立第一個排程" }),
  );
  const homeBell = page.getByRole("button", { name: "通知中心" });
  await expect(homeBell).toBeVisible();
  await homeBell.click();
  await expect(page.getByRole("dialog", { name: "通知" }).getByText("目前沒有新通知")).toBeVisible();
  await page.getByRole("button", { name: "關閉通知" }).click();
  await expectMobileWidths(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/home-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectFixedMobileNavigation(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".mobile-header")).toBeHidden();
  await Promise.all([
    page.waitForURL("**/s/new"),
    page.getByRole("link", { name: "建立第一個排程" }).click(),
  ]);
  await expect(page.getByLabel("排程名稱")).toBeVisible();
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
  await expect(page.locator(".rex-logo img").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/create-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFixedMobileNavigation(
    page,
    page.getByRole("button", { name: "下一步" }),
  );
  await expect(page.getByText("基本資訊", { exact: true })).toBeVisible();
  await expect(page.getByLabel("開始日期")).toBeHidden();
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("開始日期")).toBeVisible();
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("填寫截止時間")).toBeVisible();
  await page.getByRole("button", { name: "返回日期時間" }).click();
  await page.getByRole("button", { name: "上一步" }).click();
  await expectMobileWidths(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/create-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole("button", { name: "建立排程，取得分享連結" })
    .click();
  await expect(page.getByText("請輸入排程名稱。")).toBeVisible();
  await expect(page.getByLabel("排程名稱")).toBeFocused();
  await page.getByLabel("排程名稱").fill("瀏覽器驗收・專題討論");
  await page.getByLabel("你的顯示名稱").fill("發起者");
  await page.getByLabel("總人數").fill("4");
  await page.getByLabel("開始日期").fill("2027-09-16");
  await page.getByLabel("結束日期").fill("2027-09-18");
  await page.getByLabel("每日開始").fill("19:00");
  await page.getByLabel("每日結束").fill("21:00");
  await page.getByRole("button", { name: "建立排程，取得分享連結" }).click();
  await expect(
    page.getByRole("heading", { name: "邀請大家，找個好時間。" }),
  ).toBeVisible();
  const share = await page.getByLabel("分享連結", { exact: true }).inputValue();
  const id = new URL(share).pathname.split("/")[2];
  ids.push(id);
  await page.goto(share);
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
  await expect(page.getByLabel("目前瀏覽身分")).toContainText("發起者");
  await expect(page.getByLabel("目前瀏覽身分")).toContainText("建立者");
  await page.getByText("為什麼沒有重新輸入名字？").click();
  await expect(
    page.getByText("分享連結本身不包含管理權限。", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("留言內容").fill("期待和大家見面");
  await page.getByRole("button", { name: "送出留言" }).click();
  await expect(page.getByText("建立者", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "刪除這則留言？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保留留言" }).click();
  await expect(page.getByText("期待和大家見面")).toBeVisible();
  await page.getByRole("link", { name: "我的時間", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "發起者 的可行時間" }),
  ).toBeVisible();
  await expect(
    page.locator(".availability-desktop").getByRole("button", { name: "全選", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".availability-day-column")).toHaveCount(3);
  for (let i = 0; i < 3; i++)
    await page.locator(".availability-desktop .time-slot").nth(i).click();
  await page.screenshot({
    path: "test-results/availability-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "儲存我的可行時間" }).click();
  await expect(page.locator(".notice[role='status']")).toContainText("已提交");
  await page.getByRole("link", { name: "共同時間", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "等待全員提交" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/waiting-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const guest = await context.newPage();
  await guest.goto(share);
  await expectFixedMobileNavigation(
    guest,
    guest.getByRole("button", { name: "加入排程" }),
  );
  await expect(
    guest.getByRole("link", { name: "管理排程", exact: true }),
  ).toHaveCount(0);
  await expect(guest.getByLabel("目前瀏覽身分")).toHaveCount(0);
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/join-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await guest.getByLabel("加入用顯示名稱").fill("小陳");
  await guest.getByRole("button", { name: "加入排程" }).click();
  await expect(guest.getByRole("status")).toContainText("已加入");
  await expect(guest.getByLabel("目前瀏覽身分")).toContainText("小陳");
  await expect(guest.getByLabel("目前瀏覽身分")).toContainText("參與者");
  await guest.getByRole("link", { name: "時間", exact: true }).click();
  await expect(guest.getByText(/9\/16.*週四/).first()).toBeVisible();
  await expect(guest.getByText("2027-09-16", { exact: true })).toBeHidden();
  const guestSlots = guest.locator(".availability-mobile .time-slot");
  await expect(guestSlots).toHaveCount(4);
  await guestSlots.first().focus();
  await guest.keyboard.press("ArrowDown");
  await expect(guestSlots.nth(1)).toBeFocused();
  await guest.getByRole("button", { name: "儲存我的可行時間" }).click();
  await expect(
    guest.getByRole("heading", { name: "提交空白可行時間？" }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "返回選擇" }).click();
  for (let i = 0; i < 3; i++) await guestSlots.nth(i).click();
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/availability-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await expect(guest.locator(".mobile-bottom-nav")).toBeVisible();
  const mobileLayout = await guest.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".mobile-bottom-nav");
    const save = document.querySelector<HTMLElement>(".save-bar");
    const slot = document.querySelector<HTMLElement>(
      ".availability-mobile .time-slot",
    );
    if (!nav || !save || !slot) throw new Error("mobile controls are missing");
    const navBox = nav.getBoundingClientRect();
    const saveBox = save.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    return {
      saveAboveNavigation: saveBox.bottom <= navBox.top + 1,
      slotWidth: slotBox.width,
      slotHeight: slotBox.height,
    };
  });
  expect(mobileLayout.saveAboveNavigation).toBeTruthy();
  expect(mobileLayout.slotWidth).toBeGreaterThanOrEqual(44);
  expect(mobileLayout.slotHeight).toBeGreaterThanOrEqual(44);
  await guest.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [lastSlotBox, saveBarBox] = await Promise.all([
    guestSlots.last().boundingBox(),
    guest.locator(".save-bar").boundingBox(),
  ]);
  expect(lastSlotBox).not.toBeNull();
  expect(saveBarBox).not.toBeNull();
  expect(lastSlotBox!.y + lastSlotBox!.height).toBeLessThanOrEqual(saveBarBox!.y + 1);
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await guest.getByRole("button", { name: "儲存我的可行時間" }).click();
  await expect(guest.locator(".app-toast.success")).toContainText("已儲存可行時間");
  await guest.screenshot({
    path: "test-results/availability-toast-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await guest.goto(`${share}/discussion`);
  await expect(guest.getByRole("heading", { name: "留個訊息" })).toBeVisible();
  await expectFixedMobileNavigation(
    guest,
    guest.getByRole("button", { name: "送出留言" }),
  );
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/discussion-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await guest.goto(share);
  await expect(
    guest.getByRole("heading", { name: "這次一起的夥伴" }),
  ).toBeVisible();
  await expectMobileWidths(guest);
  await expect(
    guest.getByText("所有人提交後，系統會整理共同可行時間。"),
  ).toBeVisible();
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/waiting-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });

  const joinAndSubmit = async (name: string) => {
    const isolated = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const participant = await isolated.newPage();
    await participant.goto(share);
    await participant.getByLabel("加入用顯示名稱").fill(name);
    await participant.getByRole("button", { name: "加入排程" }).click();
    await participant.getByRole("link", { name: "時間", exact: true }).click();
    for (let i = 0; i < 3; i++)
      await participant
        .locator(".availability-mobile .time-slot")
        .nth(i)
        .click();
    await participant.getByRole("button", { name: "儲存我的可行時間" }).click();
    return { context: isolated, page: participant };
  };
  const participantB = await joinAndSubmit("小林");
  const otherParticipant = await joinAndSubmit("小吳");

  await guest.goto(`${share}/availability`);
  await expect(guestSlots.first()).toBeDisabled();
  const bell = guest.getByRole("button", { name: /通知中心/ });
  await expect(bell).toBeVisible();
  const bellBox = await bell.boundingBox();
  expect(bellBox).not.toBeNull();
  expect(bellBox!.width).toBeGreaterThanOrEqual(44);
  expect(bellBox!.height).toBeGreaterThanOrEqual(44);
  await expect(guest.locator(".notification-bell i")).toBeVisible();
  await bell.click();
  const notificationPanel = guest.getByRole("dialog", { name: "通知" });
  await expect(notificationPanel.getByText("投票已開始", { exact: true })).toBeVisible();
  await expectMobileWidths(guest);
  await guest.screenshot({
    path: "test-results/notifications-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await notificationPanel.getByRole("button", { name: "全部標為已讀" }).click();
  await expect(guest.locator(".notification-bell i")).toHaveCount(0);
  await notificationPanel.getByRole("button", { name: "關閉通知" }).click();
  await guest.goto(`${share}/results`);
  await expect(
    guest.getByRole("heading", { name: "完整共同時間" }),
  ).toBeVisible();
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/results-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await guest.goto(`${share}/vote`);
  await expect(guest.locator(".vote-card")).toHaveCount(2);
  await guest.getByRole("button", { name: "選這個時段" }).first().click();
  await guest.getByRole("button", { name: "送出投票" }).click();
  await expect(guest.getByRole("status")).toContainText("投票已更新");
  await guest.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [lastCandidateBox, voteActionBox] = await Promise.all([
    guest.locator(".vote-card").last().boundingBox(),
    guest.locator(".vote-submit-bar").boundingBox(),
  ]);
  expect(lastCandidateBox).not.toBeNull();
  expect(voteActionBox).not.toBeNull();
  expect(lastCandidateBox!.y + lastCandidateBox!.height).toBeLessThanOrEqual(
    voteActionBox!.y + 1,
  );
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/vote-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await participantB.page.goto(`${share}/vote`);
  await participantB.page.getByRole("button", { name: "選這個時段" }).first().click();
  await participantB.page.getByRole("button", { name: "送出投票" }).click();
  await expect(participantB.page.getByText("投票已完成，等待建立者確認會議時間。")).toHaveCount(0);
  await otherParticipant.page.goto(`${share}/vote`);
  await otherParticipant.page.getByRole("button", { name: "選這個時段" }).last().click();
  await otherParticipant.page.getByRole("button", { name: "送出投票" }).click();
  await expect(otherParticipant.page.getByText("投票已完成，等待建立者確認會議時間。")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${share}/vote`);
  await page.getByRole("button", { name: "選這個時段" }).last().click();
  await page.getByRole("button", { name: "送出投票" }).click();
  await expect(page.getByRole("status")).toContainText("投票已更新");
  await expect(page.getByText("投票已完成，請確認正式時間。")).toBeVisible();
  await expect(page.getByRole("button", { name: "更新投票" })).toHaveCount(0);
  await page.getByRole("button", { name: /通知中心/ }).click();
  const ownerNotifications = page.getByRole("dialog", { name: "通知" });
  await expect(ownerNotifications.getByText("請確認正式時間", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/notifications-owner-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await ownerNotifications.getByRole("button", { name: "關閉通知" }).click();
  await page.getByRole("link", { name: "確認正式時間" }).click();
  await expect(
    page.getByRole("heading", { name: "確認最終會議" }),
  ).toBeVisible();
  await expectFixedMobileNavigation(page);
  await page.getByLabel("會議地點").fill("圖書館討論室");
  await page.getByLabel("線上會議連結").fill("https://example.com/meeting");
  await page
    .getByRole("button", { name: "檢查並確認正式會議" })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "成立這場正式會議？",
  });
  await expect(confirmation).toContainText("圖書館討論室");
  await expect(confirmation).toContainText("Asia/Taipei");
  await page.screenshot({
    path: "test-results/confirmation-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  await confirmation.getByRole("button", { name: "確認成立會議" }).click();
  await expect(page.getByRole("status")).toContainText("會議已確認");
  await expect(
    page.getByRole("heading", { name: "會議已成立！" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "會議已成立！" })
    .getByRole("link", { name: "查看正式會議" })
    .click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "瀏覽器驗收・專題討論" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "加入 Google Calendar" }),
  ).toHaveAttribute("href", /dates=20270916T110000Z/);
  const cal = await page.request.get(`/api/schedules/${id}/calendar`);
  expect(cal.status()).toBe(200);
  expect(await cal.text()).toContain("BEGIN:VALARM");
  await page.screenshot({
    path: "test-results/confirmed-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await guest.reload();
  await expect(guest.locator(".notification-bell i")).toBeVisible();
  await guest.getByRole("button", { name: /通知中心/ }).click();
  const meetingNotification = guest.getByRole("dialog", { name: "通知" });
  await expect(meetingNotification.getByText("會議已成立", { exact: true })).toBeVisible();
  await meetingNotification.getByRole("button", { name: "關閉通知" }).click();
  await guest.getByRole("link", { name: /^總覽/ }).click();
  await expect(guest.getByText("會議已確認", { exact: false }).first()).toBeVisible();
  await guest.goto(`${share}/confirmed`);
  await expect(
    guest.getByRole("heading", { name: "瀏覽器驗收・專題討論" }),
  ).toBeVisible();
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await expectMobileWidths(guest);
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "test-results/confirmed-mobile-v2.png",
    fullPage: false,
    animations: "disabled",
  });
  for (const width of [360, 430]) {
    await guest.setViewportSize({ width, height: 844 });
    await expectFixedMobileNavigation(guest);
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await participantB.context.close();
  await otherParticipant.context.close();
  await context.close();
});
test("HTTP origin validation, private tokens and locked settings", async ({
  request,
}) => {
  const body = {
    title: "HTTP test",
    creatorName: "Owner",
    expectedParticipants: 1,
    startDate: "2027-09-17",
    endDate: "2027-09-17",
    dailyStartTime: "19:00",
    dailyEndTime: "20:00",
    durationMinutes: 60,
    timezone: "Asia/Taipei",
  };
  const denied = await request.post("/api/schedules", {
    data: body,
    headers: { Origin: "https://foreign.example" },
  });
  expect(denied.status()).toBe(403);
  const created = await request.post("/api/schedules", {
    data: body,
    headers: { Origin: "http://localhost:3000" },
  });
  expect(created.status()).toBe(201);
  const data = await created.json();
  ids.push(data.publicId);
  expect(
    created
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .every((h) => /HttpOnly/i.test(h.value)),
  ).toBeTruthy();
  const read = await request.get(`/api/schedules/${data.publicId}`);
  const publicData = await read.text();
  expect(publicData).not.toMatch(/tokenHash|adminToken|participantToken/);
  expect(read.headers()["cache-control"]).toBe("no-store");
  const update = await request.patch(`/api/schedules/${data.publicId}`, {
    data: { title: "changed" },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(update.status()).toBe(405);
  expect((await request.get("/api/schedules/not-found")).status()).toBe(404);
});

test("single best skips voting and only the creator can confirm", async ({
  page,
  browser,
}) => {
  const created = await page.request.post("/api/schedules", {
    data: {
      title: "單一最佳驗收",
      creatorName: "建立者",
      expectedParticipants: 1,
      startDate: "2027-09-19",
      endDate: "2027-09-19",
      dailyStartTime: "19:00",
      dailyEndTime: "20:00",
      durationMinutes: 60,
      timezone: "Asia/Taipei",
    },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(created.status()).toBe(201);
  const data = await created.json();
  ids.push(data.publicId);
  const share = `/s/${data.publicId}`;
  await page.goto(`${share}/availability`);
  const slots = page.locator(".availability-desktop .time-slot");
  await slots.nth(0).click();
  await slots.nth(1).click();
  await page.getByRole("button", { name: "儲存我的可行時間" }).click();
  await page.getByRole("link", { name: "共同時間" }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "時段投票" })).toHaveCount(0);

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto(share);
  await expect(
    anonymous.getByRole("link", { name: "管理排程", exact: true }),
  ).toHaveCount(0);
  await anonymousContext.close();

  await page.getByRole("link", { name: "管理排程", exact: true }).click();
  await expect(page.getByRole("heading", { name: "確認最終會議" })).toBeVisible();
  await page.getByRole("button", { name: "檢查並確認正式會議" }).click();
  await page
    .getByRole("dialog", { name: "成立這場正式會議？" })
    .getByRole("button", { name: "確認成立會議" })
    .click();
  await expect(page.getByRole("status")).toContainText("會議已確認");
});

test("expired incomplete schedule can be cancelled and stays read-only", async ({
  page,
  browser,
}) => {
  const created = await page.request.post("/api/schedules", {
    data: {
      title: "截止與取消驗收",
      creatorName: "建立者",
      expectedParticipants: 2,
      startDate: "2027-09-20",
      endDate: "2027-09-20",
      dailyStartTime: "19:00",
      dailyEndTime: "21:00",
      durationMinutes: 60,
      timezone: "Asia/Taipei",
      deadline: "2027-09-20T18:00",
    },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(created.status()).toBe(201);
  const data = await created.json();
  ids.push(data.publicId);
  await db.schedule.update({
    where: { publicId: data.publicId },
    data: { deadline: new Date(Date.now() - 60_000) },
  });
  const share = `/s/${data.publicId}`;
  await page.goto(share);
  await expect(page.getByText("填寫已截止，但尚未全員提交")).toBeVisible();

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto(share);
  await expect(anonymous.getByLabel("加入用顯示名稱")).toHaveCount(0);
  await anonymousContext.close();

  await page.getByRole("link", { name: "管理排程", exact: true }).click();
  await page.getByRole("button", { name: "取消此排程" }).click();
  await page.getByRole("button", { name: "確定取消" }).click();
  await expect(page.getByRole("status")).toContainText("排程已取消");
  await page.goto(`${share}/availability`);
  await expect(page.locator(".availability-desktop .time-slot").first()).toBeDisabled();
  await expect(page.getByText("此排程已取消，所有資料僅供查看")).toBeVisible();
});

