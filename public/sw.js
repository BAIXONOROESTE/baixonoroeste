// Push notifications service worker for Baixo Noroeste inventário.
// Handles 'push' events (displays a notification) and 'notificationclick'
// events (focuses/opens the target URL).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_e) {
      data = { title: "Notificação", body: event.data.text() };
    }
  }
  const title = data.title || "Baixo Noroeste";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    tag: data.tag,
    data: { url: data.url || "/", ...(data.data || {}) },
    requireInteraction: data.requireInteraction === true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const absolute = new URL(targetUrl, self.location.origin).href;
      for (const client of allClients) {
        try {
          if (client.url === absolute && "focus" in client) {
            return client.focus();
          }
        } catch (_e) {
          // ignore
        }
      }
      // Fallback: reuse any open client and navigate.
      for (const client of allClients) {
        try {
          if ("navigate" in client && "focus" in client) {
            await client.navigate(absolute);
            return client.focus();
          }
        } catch (_e) {
          // ignore
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absolute);
      }
      return undefined;
    })(),
  );
});
