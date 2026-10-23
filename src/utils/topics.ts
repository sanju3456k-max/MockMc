import type { MathTest } from '../types';

export const DEFAULT_TOPICS: string[] = [
  'Matrices and Determinants',
  'Mensuration',
  'Statics',
  'Dynamics',
  'Conic Sections',
  'Algebra',
  'Calculus',
  'Geometry',
  'Trigonometry',
  'Arithmetic & Numbers',
  'Probability & Statistics',
  'Linear Algebra',
  'General Mathematics',
];

const STORAGE_KEY = 'custom_math_topics';

/**
 * Retrieve list of user-created custom topics from localStorage
 */
export function getSavedCustomTopics(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sanitized: string[] = [];
      const seen = new Set<string>();
      for (const item of parsed) {
        if (typeof item === 'string' && item.trim().length > 0) {
          const trimmed = item.trim();
          const lower = trimmed.toLowerCase();
          const isDefault = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === lower);
          if (!isDefault && !seen.has(lower)) {
            seen.add(lower);
            sanitized.push(trimmed);
          }
        }
      }
      return sanitized;
    }
  } catch (e) {
    console.warn('Failed to read custom topics from localStorage:', e);
  }
  return [];
}

/**
 * Save a newly created custom topic to localStorage
 */
export function saveCustomTopic(newTopic: string): string[] {
  if (!newTopic || typeof newTopic !== 'string') return getSavedCustomTopics();
  const trimmed = newTopic.trim();
  if (!trimmed) return getSavedCustomTopics();

  const lower = trimmed.toLowerCase();
  const isDefault = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === lower);
  if (isDefault) return getSavedCustomTopics();

  const existing = getSavedCustomTopics();
  const alreadyExists = existing.some((t) => t.toLowerCase() === lower);
  let updated = existing;
  if (!alreadyExists) {
    updated = [...existing, trimmed];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('custom-topics-updated', { detail: trimmed }));
      }
    } catch (e) {
      console.warn('Failed to save custom topic to localStorage:', e);
    }
  }
  return updated;
}

/**
 * Return all topics combining default topics, saved custom topics, and any topics present in test library
 */
export function getAllAvailableTopics(tests?: MathTest[]): string[] {
  const customFromStorage = getSavedCustomTopics();
  const topicsMap = new Map<string, string>(); // lowerCase -> original case

  DEFAULT_TOPICS.forEach((t) => {
    topicsMap.set(t.toLowerCase(), t);
  });

  customFromStorage.forEach((t) => {
    if (t && t.trim()) {
      const trimmed = t.trim();
      if (!topicsMap.has(trimmed.toLowerCase())) {
        topicsMap.set(trimmed.toLowerCase(), trimmed);
      }
    }
  });

  if (tests && Array.isArray(tests)) {
    tests.forEach((test) => {
      if (test && test.topic && typeof test.topic === 'string' && test.topic.trim()) {
        const trimmed = test.topic.trim();
        if (!topicsMap.has(trimmed.toLowerCase())) {
          topicsMap.set(trimmed.toLowerCase(), trimmed);
        }
      }
    });
  }

  return Array.from(topicsMap.values());
}
