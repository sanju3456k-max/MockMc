// Service Worker Registration for PWA / WebAPK
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] ServiceWorker registered with scope:', registration.scope);

          // Check if worker was installed or has updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New version ready.');
                  } else {
                    console.log('[PWA] App is ready for offline/WebAPK install.');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.warn('[PWA] ServiceWorker registration failed:', error);
        });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      register();
    } else {
      window.addEventListener('load', register);
    }
  }
}
