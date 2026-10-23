import { sanitizeAndRepairCode } from '../../../lib/htmlNotesSync';

/**
 * Merges updated body HTML back into a full HTML document template,
 * preserving top DOCTYPE, <html>, <head>, <style>, <meta> tags and bottom closing tags.
 */
export function mergeUpdatedBodyIntoFullDocument(originalDocHtml: string, updatedBodyHtml: string): string {
  if (!updatedBodyHtml || typeof updatedBodyHtml !== 'string') return originalDocHtml || '';
  if (!originalDocHtml || !originalDocHtml.trim()) return updatedBodyHtml;

  let cleanNewBody = updatedBodyHtml.trim();

  // Strip accidental outer .a4-centering-stage or .a4-container wrapper to prevent nesting
  cleanNewBody = cleanNewBody.replace(/^<div\s+class=["'][^"']*\ba4-centering-stage\b[^"']*["'][^>]*>\s*<div\s+class=["'][^"']*\ba4-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>$/i, '$1').trim();
  cleanNewBody = cleanNewBody.replace(/^<div\s+class=["'][^"']*\ba4-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>$/i, '$1').trim();

  // Strip any lingering editor selection outlines, focus rings, or active string highlights
  cleanNewBody = cleanNewBody
    .replace(/\boutline\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-offset\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-color\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-style\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-width\s*:\s*[^;"]+;?/gi, '')
    .replace(/\bclass=["']([^"']*\s)?studio-active-selected-element(\s[^"']*)?["']/gi, (match, p1, p2) => {
      const remaining = `${p1 || ''}${p2 || ''}`.trim();
      return remaining ? ` class="${remaining}"` : '';
    });

  // Ensure any math formulas in new body are sanitized and repaired
  cleanNewBody = sanitizeAndRepairCode(cleanNewBody);

  const trimmedOriginal = originalDocHtml.trim();
  const trimmedNewBody = cleanNewBody;

  const hasDoctype = /<!DOCTYPE/i.test(trimmedOriginal);
  const hasHead = /<head[\s>]/i.test(trimmedOriginal);
  const hasHtmlTag = /<html[\s>]/i.test(trimmedOriginal);

  // If original was not a full HTML document (plain snippet), return updatedBodyHtml directly
  if (!hasDoctype && !hasHead && !hasHtmlTag) {
    return trimmedNewBody;
  }

  // Case 1: Original has <body> ... </body>
  const bodyMatch = trimmedOriginal.match(/^([\s\S]*?<body[^>]*>)([\s\S]*?)(<\/body>[\s\S]*?)$/i);
  if (bodyMatch) {
    const prefix = bodyMatch[1]; // Everything up to and including <body>
    const suffix = bodyMatch[3]; // Everything from </body> to </html>
    return `${prefix}\n${trimmedNewBody}\n${suffix}`;
  }

  // Case 2: Original has </head> but no <body> tag
  const headEndMatch = trimmedOriginal.match(/^([\s\S]*?<\/head>)([\s\S]*?)$/i);
  if (headEndMatch) {
    const headPart = headEndMatch[1];
    return `${headPart}\n<body>\n${trimmedNewBody}\n</body>\n</html>`;
  }

  // Case 3: Original has <!DOCTYPE html> or <html> at start
  const htmlStartMatch = trimmedOriginal.match(/^([\s\S]*?<html[^>]*>)([\s\S]*?)$/i);
  if (htmlStartMatch) {
    const htmlPrefix = htmlStartMatch[1];
    return `${htmlPrefix}\n<body>\n${trimmedNewBody}\n</body>\n</html>`;
  }

  return trimmedNewBody;
}
