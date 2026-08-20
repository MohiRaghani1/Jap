const CACHE_NAME =
  "naam-jap-counter-svg-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./icon-192.svg",
  "./icon-512.svg"
];

self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache =>
          cache.addAll(APP_FILES)
        )
        .then(() =>
          self.skipWaiting()
        )
    );
  }
);

self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      caches.keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(key =>
                caches.delete(key)
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )
    );
  }
);

self.addEventListener(
  "fetch",
  event => {
    if (
      event.request.method !== "GET"
    ) {
      return;
    }

    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request)
            .then(networkResponse => {
              if (
                !networkResponse ||
                networkResponse.status !== 200 ||
                networkResponse.type !== "basic"
              ) {
                return networkResponse;
              }

              const responseClone =
                networkResponse.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(
                    event.request,
                    responseClone
                  );
                });

              return networkResponse;
            })
            .catch(() =>
              caches.match(
                "./index.html"
              )
            );
        })
    );
  }
);

self.addEventListener(
  "notificationclick",
  event => {
    event.notification.close();

    event.waitUntil(
      self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      }).then(clientList => {
        for (
          const client of clientList
        ) {
          if ("focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(
            "./index.html"
          );
        }

        return undefined;
      })
    );
  }
);
