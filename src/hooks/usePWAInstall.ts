import { useState, useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(true); // Default true so user can always see install instructions or trigger prompt
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isIframe, setIsIframe] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    // Check if app is running inside an iframe (like AI Studio preview pane)
    try {
      setIsIframe(window.self !== window.top);
    } catch {
      setIsIframe(true);
    }
    // Check if app is running in standalone mode (already installed as PWA / WebAPK)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');

      if (isStandaloneMode) {
        setIsInstalled(true);
        setIsInstallable(false);
      }
    };

    checkStandalone();

    // Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isIosDevice);

    // Capture beforeinstallprompt event (Chrome, Edge, Android, Opera)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser from showing auto-banner prematurely
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setIsInstallable(true);
      console.log('[PWA] beforeinstallprompt captured!');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsModalOpen(false);
      console.log('[PWA] App successfully installed!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        console.log('[PWA] User install choice:', choiceResult.outcome);
        if (choiceResult.outcome === 'accepted') {
          setIsInstalled(true);
          setIsInstallable(false);
          setDeferredPrompt(null);
          setIsModalOpen(false);
        }
        return choiceResult.outcome;
      } catch (error) {
        console.warn('[PWA] Error triggering prompt:', error);
        setIsModalOpen(true);
        return 'manual';
      }
    } else {
      // Fallback: Open modal with exact step-by-step installation instructions for Chrome / Mobile / Safari
      setIsModalOpen(true);
      return 'manual';
    }
  };

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isIframe,
    deferredPrompt,
    isModalOpen,
    setIsModalOpen,
    triggerInstall,
  };
}
