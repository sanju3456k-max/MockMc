import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DocumentHeading, EditorSearchMatch } from '../types';
import type { HtmlNotesPreviewPaneHandle } from '../components/HtmlNotesPreviewPane';

interface UseHtmlNotesSearchOptions {
  code: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  fullScreenIframeRef?: React.RefObject<HTMLIFrameElement | null>;
  previewPaneRef: React.RefObject<HtmlNotesPreviewPaneHandle | null>;
  setHighlightedLineIdx: (idx: number | null) => void;
  setIsBlinking: (val: boolean) => void;
  blinkTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  viewMode?: string;
}

export function useHtmlNotesSearch({
  code,
  textareaRef,
  iframeRef,
  fullScreenIframeRef,
  previewPaneRef,
  setHighlightedLineIdx,
  setIsBlinking,
  blinkTimeoutRef,
  viewMode = 'preview'
}: UseHtmlNotesSearchOptions) {
  // Code Editor Search Bar State
  const [isEditorSearchOpen, setIsEditorSearchOpen] = useState<boolean>(false);
  const [editorSearchTerm, setEditorSearchTerm] = useState<string>('');
  const [editorMatches, setEditorMatches] = useState<EditorSearchMatch[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Preview Search Bar State
  const [isPreviewSearchOpen, setIsPreviewSearchOpen] = useState<boolean>(false);
  const [previewSearchTerm, setPreviewSearchTerm] = useState<string>('');
  const [previewMatchCount, setPreviewMatchCount] = useState<number>(0);
  const [currentPreviewMatchIdx, setCurrentPreviewMatchIdx] = useState<number>(0);
  const previewSearchInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Page Map & Active Tracking from IFrame
  const [iframeHeadingPageMap, setIframeHeadingPageMap] = useState<DocumentHeading[]>([]);
  const [activeHeadingText, setActiveHeadingText] = useState<string>('');
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [activePage, setActivePage] = useState<number>(1);

  // Listen for iframe pagination postMessage broadcasts
  useEffect(() => {
    const handleIframeMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'STUDIO_HEADING_PAGE_MAP' && Array.isArray(e.data.headings)) {
        setIframeHeadingPageMap(e.data.headings);
      } else if (e.data.type === 'STUDIO_ACTIVE_PAGE_AND_HEADING') {
        if (typeof e.data.activePage === 'number') setActivePage(e.data.activePage);
        if (typeof e.data.activeHeadingText === 'string') setActiveHeadingText(e.data.activeHeadingText);
        if (typeof e.data.activeHeadingId === 'string') setActiveHeadingId(e.data.activeHeadingId);
      }
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []);

  // Extract Document Headings outline for sidebar with enriched pageIndex
  const headingsList = useMemo<DocumentHeading[]>(() => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(code || '', 'text/html');
      const nodes = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      
      const parsedHeadings: DocumentHeading[] = nodes.map((h, i) => {
        const text = h.textContent?.trim() || `Heading ${i + 1}`;
        const id = h.id || h.getAttribute('data-note-id') || `head_${i}`;
        const level = parseInt(h.tagName.substring(1), 10);
        
        // Match with iframe calculated page map
        const mapped = iframeHeadingPageMap.find(
          m => m.id === id || (m.text && m.text.toLowerCase() === text.toLowerCase())
        );

        return {
          id,
          level,
          text,
          index: i,
          pageIndex: mapped ? mapped.pageIndex : 1
        };
      });

      return parsedHeadings;
    } catch {
      return [];
    }
  }, [code, iframeHeadingPageMap]);

  // Jump to heading in code and preview simultaneously with exact screen mapping
  const handleJumpToHeading = useCallback((headingText: string, headingIndex?: number) => {
    if (!headingText || !headingText.trim()) return;

    const cleanHead = headingText.trim();
    setActiveHeadingText(cleanHead);
    const matchedHeadingItem = headingsList.find(
      (h) => (headingIndex !== undefined && h.index === headingIndex) || h.text.toLowerCase() === cleanHead.toLowerCase()
    );
    if (matchedHeadingItem) {
      setActiveHeadingId(matchedHeadingItem.id);
      if (typeof matchedHeadingItem.pageIndex === 'number') {
        setActivePage(matchedHeadingItem.pageIndex);
      }
    }

    const lines = (code || '').split('\n');

    let lineIdx = -1;

    // 1. If headingIndex is provided, find the exact N-th heading tag in the code editor
    if (headingIndex !== undefined && headingIndex >= 0) {
      let headingCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/<h[1-6]/i.test(lines[i])) {
          if (headingCount === headingIndex) {
            lineIdx = i;
            break;
          }
          headingCount++;
        }
      }
    }

    // 2. Fallback to text matching if index match failed or wasn't provided
    if (lineIdx === -1) {
      lineIdx = lines.findIndex(l => l.includes(cleanHead));
      if (lineIdx === -1) {
        lineIdx = lines.findIndex(l => l.toLowerCase().includes(cleanHead.toLowerCase()));
      }
      if (lineIdx === -1) {
        const words = cleanHead.split(/\s+/).filter(w => w.length > 2);
        if (words.length > 0) {
          lineIdx = lines.findIndex(l => {
            const isHeading = /<h[1-6]/i.test(l);
            return isHeading && words.every(w => l.toLowerCase().includes(w.toLowerCase()));
          });
        }
      }
    }

    if (lineIdx !== -1 && textareaRef.current) {
      setHighlightedLineIdx(lineIdx);
      setIsBlinking(true);
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = setTimeout(() => setIsBlinking(false), 2000);

      const ta = textareaRef.current;
      const computedStyle = window.getComputedStyle(ta);
      const parsedLineHeight = parseFloat(computedStyle.lineHeight);
      const lineHeight = !isNaN(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 22;
      const targetScroll = Math.max(0, lineIdx * lineHeight - ta.clientHeight * 0.12);
      ta.scrollTo({ top: targetScroll, behavior: 'smooth' });

      const charOffset = lines.slice(0, lineIdx).join('\n').length + (lineIdx > 0 ? 1 : 0);
      if (viewMode === 'editor' || viewMode === 'split') {
        try {
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(charOffset, charOffset + lines[lineIdx].length);
        } catch (_) {}
      }
    }

    const scrollPayload = {
      type: 'SCROLL_TO_HEADING',
      headingText: cleanHead,
      headingIndex
    };

    if (previewPaneRef.current) {
      previewPaneRef.current.scrollToHeading(cleanHead, headingIndex);
    }
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(scrollPayload, '*');
      } catch (e) {}
    }
    if (fullScreenIframeRef?.current?.contentWindow) {
      try {
        fullScreenIframeRef.current.contentWindow.postMessage(scrollPayload, '*');
      } catch (e) {}
    }
  }, [code, textareaRef, iframeRef, fullScreenIframeRef, previewPaneRef, setHighlightedLineIdx, setIsBlinking, blinkTimeoutRef]);

  // Code editor search handlers
  const handleEditorSearch = useCallback((term: string) => {
    setEditorSearchTerm(term);
    if (!term.trim()) {
      setEditorMatches([]);
      setCurrentMatchIdx(0);
      return;
    }
    const lines = code.split('\n');
    const matches: EditorSearchMatch[] = [];
    lines.forEach((line, lineIdx) => {
      let startIdx = 0;
      while ((startIdx = line.toLowerCase().indexOf(term.toLowerCase(), startIdx)) !== -1) {
        matches.push({ lineIdx, start: startIdx, end: startIdx + term.length });
        startIdx += term.length;
      }
    });
    setEditorMatches(matches);
    setCurrentMatchIdx(0);
  }, [code]);

  const jumpToEditorMatch = useCallback((match: EditorSearchMatch) => {
    if (!textareaRef.current) return;
    const targetScroll = Math.max(0, match.lineIdx * 22 - 100);
    textareaRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, [textareaRef]);

  const handleNextSearchMatch = useCallback(() => {
    if (editorMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % editorMatches.length;
    setCurrentMatchIdx(nextIdx);
    jumpToEditorMatch(editorMatches[nextIdx]);
  }, [editorMatches, currentMatchIdx, jumpToEditorMatch]);

  const handlePrevSearchMatch = useCallback(() => {
    if (editorMatches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + editorMatches.length) % editorMatches.length;
    setCurrentMatchIdx(prevIdx);
    jumpToEditorMatch(editorMatches[prevIdx]);
  }, [editorMatches, currentMatchIdx, jumpToEditorMatch]);

  // Preview search handlers
  const handlePreviewSearch = useCallback((term: string) => {
    setPreviewSearchTerm(term);
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: 'STUDIO_SEARCH', term }, '*');
      } catch (err) {
        console.warn('Iframe search postMessage error:', err);
      }
    }
  }, [iframeRef]);

  const handleNextPreviewMatch = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'STUDIO_SEARCH_NEXT' }, '*');
    }
  }, [iframeRef]);

  const handlePrevPreviewMatch = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'STUDIO_SEARCH_PREV' }, '*');
    }
  }, [iframeRef]);

  const clearPreviewHighlights = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'STUDIO_SEARCH_CLEAR' }, '*');
    }
  }, [iframeRef]);

  return {
    isEditorSearchOpen,
    setIsEditorSearchOpen,
    editorSearchTerm,
    setEditorSearchTerm,
    editorMatches,
    currentMatchIdx,
    searchInputRef,
    handleEditorSearch,
    handleNextSearchMatch,
    handlePrevSearchMatch,
    isPreviewSearchOpen,
    setIsPreviewSearchOpen,
    previewSearchTerm,
    setPreviewSearchTerm,
    previewMatchCount,
    setPreviewMatchCount,
    currentPreviewMatchIdx,
    setCurrentPreviewMatchIdx,
    previewSearchInputRef,
    handlePreviewSearch,
    handleNextPreviewMatch,
    handlePrevPreviewMatch,
    clearPreviewHighlights,
    headingsList,
    handleJumpToHeading,
    activeHeadingText,
    activeHeadingId,
    activePage
  };
}
