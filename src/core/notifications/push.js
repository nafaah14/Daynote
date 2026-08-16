/**
 * The CLIENT half of notifications. This is everything that can honestly run
 * from a static site: ask permission, register the service worker, subscribe
 * to push, and fire a LOCAL notification for testing.
 *
 * What this file CANNOT do: wake your phone at 7am for a due reminder. That
 * needs something outside the phone — see netlify/functions/send-reminders.js
 * and the README. Nothing client-side can schedule a future push reliably;
 * that limitation is in the platform, not in this code.
 */

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const permission = () => (pushSupported() ? Notification.permission : 'unsupported');

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getRegistration() {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.ready;
}

export const SUB_TYPE = 'system.pushSubscription';

/** A PushSubscription isn't plain JSON until you unwrap it. */
export const subToJSON = (sub) => {
  const j = sub.toJSON();
  return { endpoint: j.endpoint, keys: j.keys, expirationTime: j.expirationTime || null };
};

/**
 * Ask permission and subscribe. Returns the PushSubscription so the caller can
 * SAVE it — an unsaved subscription is the reason scheduled push silently does
 * nothing: the server has no address to send to.
 */
export async function enablePush() {
  if (!pushSupported()) throw new Error('This device or browser does not support notifications.');

  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error(
      result === 'denied'
        ? 'Notifications are blocked. Turn them on for this site in your browser settings.'
        : 'Permission was not granted.'
    );
  }

  const reg = await getRegistration();
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  // Without a VAPID key we can't create a push subscription, but local
  // notifications still work — so enabling still means something on-device.
  if (!vapid) return { local: true, subscription: null };

  const existing = await reg.pushManager.getSubscription();
  const subscription = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  return { local: false, subscription };
}

export async function disablePush() {
  const reg = await getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}

/** Fire a notification right now, through the service worker. No server needed. */
export async function sendTestNotification() {
  if (permission() !== 'granted') {
    const r = await Notification.requestPermission();
    if (r !== 'granted') throw new Error('Allow notifications first.');
  }
  const reg = await getRegistration();
  await reg.showNotification('Daybook', {
    body: 'Notifications are working on this device.',
    tag: 'daybook-test',
    badge: '/icons/icon-192.png',
    icon: '/icons/icon-192.png',
    data: { url: '/' },
  });
}
