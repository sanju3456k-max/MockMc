import { useState, useCallback } from 'react';

export type UiScale = '85%' | '100%' | '115%' | '130%' | '145%';

export interface UIScaleConfig {
  appZoom: number;
}

export const DEFAULT_UI_SCALE_CONFIG: UIScaleConfig = {
  appZoom: 100,
};

export function useUIScale() {
  const [scaleConfig, setScaleConfig] = useState<UIScaleConfig>(DEFAULT_UI_SCALE_CONFIG);

  const updateScaleConfig = useCallback((updates: Partial<UIScaleConfig>) => {
    setScaleConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setScaleConfig(DEFAULT_UI_SCALE_CONFIG);
  }, []);

  const setScale = useCallback((_scale: UiScale) => {}, []);

  return {
    scaleConfig,
    updateScaleConfig,
    resetToDefaults,
    scale: '100%' as UiScale,
    setScale,
  };
}

export { useUIScale as useUiScale };
