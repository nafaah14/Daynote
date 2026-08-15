/**
 * Scheduled push sender — Cloudflare Worker port of
 * netlify/functions/send-reminders.js. Runs on a Cron Trigger (see
 * wrangler.toml) instead of Netlify's `export const config = { schedule }`.
 *
 * Same job as the original: every few minutes, look for records that have
 * just come due and push them to devices notifications are enabled on.
 * Reminders and payment items both just have a top-level `dueAt`, so one
 * sweep covers both — DUE_TYPES is the only thing a future due-date-bearing
 * module needs to add itself to.
 *
 * firebase-admin can't run in a Worker (gRPC — see firestore.js's header
 * comment), so Firestore reads/writes go through the REST API instead. The
 * lookback window, filter, push, prune, and pushedAt write-back logic below
 * is translated line-for-line from the original, not redesigned — including
 * keeping the N-per-user query loop rather than switching to a single
 * collection-group query.
 *
 * Needs, in this Worker's environment variables (wrangler secret put, or
 * .dev.vars locally — see .dev.vars.example):
 *   VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY   (a service account)
 *
 * Until those exist it exits quietly. The in-app bell works regardless, and
 * so do notifications raised while the app is open.
 */
import webpush from 'web-push';
import {
  getAccessToken, listUserIds, queryDue, queryByType, patchDeletedAt, patchPushed,
} from './firestore.js';

/* Comfortably wider than the schedule, so a slow or skipped run doesn't drop a
   reminder. pushedAt prevents the overlap from sending twice. */
const LOOKBACK_MS = 60 * 60 * 1000;

const SUB = 'system.pushSubscription';

/**
 * One entry per module that wants a due-date push. `test` filters the raw
 * record beyond the dueAt window (e.g. skip a completed reminder or a paused
 * payment); `notice` builds the title/body/link for whichever record matched.
 */
const DUE_TYPES = [
  {
    type: 'reminders.task',
    test: (r) => !r.doneAt,
    notice: (r) => ({ title: 'Reminder due', url: '/reminders', body: r.title }),
  },
  {
    type: 'payments.item',
    test: (r) => r.data?.active !== false && r.data?.remind !== false,
    notice: (r) => ({
      title: r.data?.kind === 'pay' ? 'Payment due' : 'Payment expected',
      url: '/payments',
      body: r.title,
    }),
  },
];

// A bare `export async function scheduled(...)` isn't enough for Wrangler's
// bundler to recognize this as an ES Module Worker — it specifically looks
// for a default export. Without it, it falls back to the legacy "Service
// Worker" format, which doesn't support nodejs_compat's Node built-in
// polyfills (crypto, buffer, ...) at all, and the build fails before this
// code ever runs.
export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(run(env));
  },
};

async function run(env) {
  const pub = env.VITE_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { console.log('VAPID keys not set — skipping.'); return; }
  if (!env.FB_PROJECT_ID) { console.log('Firebase Admin not set — skipping.'); return; }

  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:you@example.com', pub, priv);

  const token = await getAccessToken({
    clientEmail: env.FB_CLIENT_EMAIL,
    privateKeyPem: env.FB_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
  const projectId = env.FB_PROJECT_ID;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const from = new Date(nowMs - LOOKBACK_MS).toISOString();

  const userIds = await listUserIds(token, projectId);
  let sent = 0;

  for (const uid of userIds) {
    const windowed = await queryDue(token, projectId, uid, from, now);

    const due = windowed
      .filter((r) => !r.deletedAt && !r.data?.pushedAt)
      .map((r) => ({ r, cfg: DUE_TYPES.find((c) => c.type === r.type) }))
      .filter(({ r, cfg }) => cfg && cfg.test(r));

    if (!due.length) continue;

    const subRecords = await queryByType(token, projectId, uid, SUB);
    const subs = subRecords.filter((r) => !r.deletedAt && r.data?.endpoint);

    if (!subs.length) continue;

    for (const { r: rec, cfg } of due) {
      const notice = cfg.notice(rec);
      const payload = JSON.stringify({
        title: notice.title,
        body: notice.body,
        tag: `${cfg.type}-${rec.id}`,
        url: notice.url,
      });

      await Promise.all(subs.map((s) =>
        webpush
          .sendNotification({ endpoint: s.data.endpoint, keys: s.data.keys }, payload)
          .catch(async (err) => {
            // 404/410 means the browser dropped it — retiring dead endpoints
            // stops us retrying them every five minutes forever
            if (err.statusCode === 404 || err.statusCode === 410) {
              await patchDeletedAt(token, projectId, uid, s.id, new Date().toISOString()).catch(() => {});
            }
          })
      ));

      await patchPushed(token, projectId, uid, rec.id, { ...rec.data, pushedAt: now }, now);
      sent++;
    }
  }

  console.log(`Pushed ${sent} notification(s).`);
}
