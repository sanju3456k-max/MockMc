/**
 * Format and prettify HTML code with clean 2-space indentation,
 * safely preserving content inside <pre>, <code>, <style>, and <script> tags.
 */
export function formatHtmlCode(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // 1. Temporarily extract preserved blocks (<pre>, <code>, <style>, <script>)
  const preservedBlocks: string[] = [];
  const placeholderPrefix = '___PRESERVED_HTML_BLOCK_';

  let sanitized = html.replace(/<(pre|code|style|script)[\s\S]*?<\/\1>/gi, (match) => {
    const idx = preservedBlocks.length;
    preservedBlocks.push(match);
    return `${placeholderPrefix}${idx}___`;
  });

  // 2. Normalize whitespace between tags
  sanitized = sanitized
    .replace(/>\s+</g, '><')
    .replace(/</g, '\n<')
    .replace(/>/g, '>\n');

  const lines = sanitized.split('\n').map(l => l.trim()).filter(Boolean);
  let indentLevel = 0;
  const indentStr = '  ';
  const formattedLines: string[] = [];

  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype'
  ]);

  for (let line of lines) {
    if (!line) continue;

    // Check if line is closing tag
    const isClosing = /^<\/[a-zA-Z0-9_-]+>/.test(line);
    // Check if line is self-closing or void tag
    const tagNameMatch = line.match(/^<([a-zA-Z0-9_!:-]+)/);
    const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    const isVoid = voidTags.has(tagName) || line.endsWith('/>');
    const isComment = /^<!--[\s\S]*?-->$/.test(line);
    const isOpening = !isClosing && !isVoid && !isComment && /^<[a-zA-Z0-9_:-]+/.test(line);

    // If it's a closing tag, decrease indent before printing
    if (isClosing) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    formattedLines.push(indentStr.repeat(indentLevel) + line);

    // If it's an opening tag that isn't void or self-closing, increase indent after printing
    if (isOpening) {
      indentLevel++;
    }
  }

  // Combine lines
  let result = formattedLines.join('\n');

  // Restore preserved blocks
  preservedBlocks.forEach((block, idx) => {
    result = result.replace(`${placeholderPrefix}${idx}___`, block);
  });

  return result.trim();
}
