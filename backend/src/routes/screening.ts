import { Elysia, t } from "elysia";
import { ISSUE_TYPES, STATUS_LABELS } from "../screening/screen";
import { review, runScreening } from "../screening/service";

export const screeningRoutes = new Elysia({ prefix: "/screening" })
  /** full screening result (re-computed from the DB on every call) */
  .get("/", async () => {
    const { items, summary, token, screenedAt } = await runScreening();
    return { items, summary, token, screenedAt, statusLabels: STATUS_LABELS, issueLabels: ISSUE_TYPES };
  })
  /** numbers only (for the dashboard) */
  .get("/summary", async () => {
    const { summary, screenedAt } = await runScreening();
    return { summary, screenedAt };
  })
  .post("/review",({ body }) => review(body.itemId, body.approve), {
    body: t.Object({ itemId: t.String(), approve: t.Boolean() }),
  });
