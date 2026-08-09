/**
 * Scheduled push sender. Runs on Netlify's cron (see netlify.toml).
 *
 * This is the "something outside the phone" a PWA cannot be. Every few minutes
 * it looks for records that have just come due and pushes them to devices
 * you've enabled notifications on. Reminders and payment items both just have
 * a top-level `dueAt`, so one sweep covers both — DUE_TYPES is the only thing
 * a future due-date-bearing module needs to add itself to.
 *
 * Needs, in Netlify's environment variables:
 *   VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY   (a service account)
 *
 * Until those exist it exits quietly. The in-app bell works regardless, and so
 * do notifications raised while the app is open.
 */
import webpush from 'web-push';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const config = { schedule: '*/5 * * * *' };

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

function admin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FB_PROJECT_ID,
        clientEmail: process.env.FB_CLIENT_EMAIL,
        privateKey: process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler() {
  const pub = process.env.VITE_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return new Response('VAPID keys not set — skipping.', { status: 200 });
  if (!process.env.FB_PROJECT_ID) return new Response('Firebase Admin not set — skipping.', { status: 200 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:you@example.com', pub, priv);

  const db = admin();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const from = new Date(nowMs - LOOKBACK_MS).toISOString();

  const users = await db.collection('users').listDocuments();
  let sent = 0;

  for (const user of users) {
    /**
     * Range on ONE field, then filter the rest in code.
     *
     * The obvious query — type ==, doneAt ==, dueAt <= — mixes equality and
     * range across three fields, needs a composite index, and throws
     * FAILED_PRECONDITION until somebody notices and builds one. A window on
     * dueAt alone uses the automatic single-field index and reads only the few
     * records that recently came due.
     */
    const snap = await user.collection('records')
      .where('dueAt', '>=', from)
      .where('dueAt', '<=', now)
      .get();

    const due = snap.docs
      .map((d) => d.data())
      .filter((r) => !r.deletedAt && !r.data?.pushedAt)
      .map((r) => ({ r, cfg: DUE_TYPES.find((c) => c.type === r.type) }))
      .filter(({ r, cfg }) => cfg && cfg.test(r));

    if (!due.length) continue;

    const subsSnap = await user.collection('records').where('type', '==', SUB).get();
    const subs = subsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => !r.deletedAt && r.data?.endpoint);

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
              await user.collection('records').doc(s.id)
                .set({ deletedAt: new Date().toISOString() }, { merge: true })
                .catch(() => {});
            }
          })
      ));

      await user.collection('records').doc(rec.id).set(
        { data: { ...rec.data, pushedAt: now }, updatedAt: now },
        { merge: true }
      );
      sent++;
    }
  }

  return new Response(`Pushed ${sent} notification(s).`, { status: 200 });
}
