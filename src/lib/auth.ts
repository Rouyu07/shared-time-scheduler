import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const newToken = () => randomBytes(32).toString("base64url");
export function hashToken(token: string) {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new Error("TOKEN_PEPPER must have at least 32 characters");
  return createHmac("sha256", pepper).update(token).digest("hex");
}
export function matches(token: string | undefined, hash: string) {
  if (!token || token.length > 256) return false;
  const a = Buffer.from(hashToken(token)),
    b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const cookieName = (kind: "admin" | "participant", id: string) =>
  `st_${kind}_${id}`;
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
});
export type Session = { admin?: string; participant?: string };
