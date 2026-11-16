/** shared-password auth helpers (used by middleware and the login route; Edge-runtime safe) */
export const COOKIE = "tt_auth";

export async function authToken(password: string) {
  const data = new TextEncoder().encode(`timetable:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
