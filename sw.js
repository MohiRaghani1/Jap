const CACHE_NAME =
  "naam-jap-counter-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json"
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
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request)
            .then(networkResponse => {
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
      clients.matchAll({
        type: "window",
        includeUncontrolled: true
      }).then(clientList => {
        for (
          const client of clientList
        ) {
          if (
            "focus" in client
          ) {
            return client.focus();
          }
        }

        if (
          clients.openWindow
        ) {
          return clients.openWindow(
            "./index.html"
          );
        }
      })
    );
  }
);
