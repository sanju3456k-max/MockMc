import type { MathTest, MathQuestion } from '../types';

/**
 * Formats a share message incorporating the test title (asset name) and the link.
 */
export function formatTestShareMessage(testTitle: string, shareUrl: string): string {
  const cleanTitle = (testTitle || 'Practice Test').trim();
  return `Check out this practice test "${cleanTitle}"!\nClick the link to open and save it in your app:\n${shareUrl}`;
}

/**
 * Encodes a MathTest object into a compact, URL-safe Base64 hash parameter.
 * Uses URL hash (#shareTest=...) so browser NEVER transmits payload in HTTP GET header to server.
 */
export function encodeTestToShareUrl(test: MathTest): string {
  const compact = {
    i: test.id,
    t: test.title,
    d: test.description || '',
    p: test.topic || 'General Mathematics',
    m: test.timeLimitMinutes || test.time || 15,
    s: test.passingScorePercentage || 60,
    q: (test.questions || []).map((q: MathQuestion) => {
      const item: Record<string, any> = {
        x: q.text,
        c: q.correctAnswer,
      };
      if (q.options && q.options.length > 0) item.o = q.options;
      if (q.explanation || q.solution) item.e = q.explanation || q.solution;
      if (q.imageUrl) item.u = q.imageUrl;
      if (q.paperLayout) item.l = q.paperLayout;
      return item;
    }),
  };

  const jsonStr = JSON.stringify(compact);
  const base64 = btoa(
    encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
  const cleanBase64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  return `${baseUrl}#shareTest=${cleanBase64}`;
}

/**
 * Attempts to generate a short share URL via backend (/api/share) with fallback to URL hash payload.
 */
export async function createShareUrlAsync(test: MathTest): Promise<string> {
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.shareId) {
        return `${baseUrl}#s=${data.shareId}`;
      }
    }
  } catch {
    // Fallback to client-side encoded hash
  }
  return encodeTestToShareUrl(test);
}

/**
 * Decodes a shareTest Base64 parameter back into a structured MathTest object.
 */
export function decodeTestFromShareUrl(shareParam: string): MathTest | null {
  try {
    let base64 = shareParam.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonStr);

    // Support both compact schema (t, q, x, c, o, e) and raw standard MathTest JSON
    const title = parsed.t || parsed.title;
    const questionsRaw = parsed.q || parsed.questions;

    if (!title || !Array.isArray(questionsRaw) || questionsRaw.length === 0) {
      return null;
    }

    const questions: MathQuestion[] = questionsRaw.map((q: any, idx: number) => {
      if (q.x !== undefined) {
        return {
          id: `q_${idx + 1}`,
          text: q.x || '',
          options: Array.isArray(q.o) ? q.o : undefined,
          correctAnswer: String(q.c ?? '0'),
          explanation: q.e || undefined,
          imageUrl: q.u || undefined,
          paperLayout: q.l || undefined,
        };
      }
      return {
        id: q.id || `q_${idx + 1}`,
        text: q.text || '',
        options: Array.isArray(q.options) ? q.options : undefined,
        correctAnswer: String(q.correctAnswer ?? '0'),
        explanation: q.explanation || q.solution || undefined,
        imageUrl: q.imageUrl || undefined,
        paperLayout: q.paperLayout || undefined,
      };
    });

    return {
      id: `shared_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(title),
      description: parsed.d || parsed.description || 'Shared Practice Test',
      topic: parsed.p || parsed.topic || 'General Mathematics',
      timeLimitMinutes: typeof parsed.m === 'number' ? parsed.m : (parsed.timeLimitMinutes || 15),
      passingScorePercentage: typeof parsed.s === 'number' ? parsed.s : (parsed.passingScorePercentage || 60),
      questions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
    };
  } catch (e) {
    console.warn('Share test link decode error:', e);
    return null;
  }
}
