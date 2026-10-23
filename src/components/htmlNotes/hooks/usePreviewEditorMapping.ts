import { useState, useCallback, useRef } from 'react';
import { findMatchingLineRangeInHtml, LineRangeMatch } from '../utils/htmlSelectionMapper';

interface UsePreviewEditorMappingOptions {
  code: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onOpenAiAssistant?: () => void;
}

export function usePreviewEditorMapping({
  code,
  textareaRef,
  onOpenAiAssistant
}: UsePreviewEditorMappingOptions) {
  const [isSelectRefiningModeEnabled, setIsSelectRefiningModeEnabled] = useState<boolean>(true);
  const [activeSelectionPane, setActiveSelectionPane] = useState<'editor' | 'preview' | null>(null);
  const [selectedTextForAi, setSelectedTextForAi] = useState<string | null>(null);

  const [highlightedLineIdx, setHighlightedLineIdx] = useState<number | null>(null);
  const [highlightedLineRange, setHighlightedLineRange] = useState<{ start: number; end: number } | null>(null);
  const [highlightedCharRange, setHighlightedCharRange] = useState<{ start: number; end: number } | null>(null);
  const [isBlinking, setIsBlinking] = useState<boolean>(false);
  const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleSelectRefiningMode = useCallback(() => {
    setIsSelectRefiningModeEnabled(prev => !prev);
  }, []);

  // When text is selected or unselected in the preview pane (either iframe or desktop canvas)
  const handlePreviewTextSelected = useCallback((selectedText: string) => {
    // If user unselects the text in the preview pane, clear visual highlight only
    if (!selectedText || !selectedText.trim()) {
      setHighlightedLineIdx(null);
      setHighlightedLineRange(null);
      setHighlightedCharRange(null);
      setIsBlinking(false);
      if (blinkTimeoutRef.current) {
        clearTimeout(blinkTimeoutRef.current);
        blinkTimeoutRef.current = null;
      }
      return;
    }

    if (selectedText.trim().length < 2) return;

    const clean = selectedText.trim();
    setSelectedTextForAi(clean);
    setActiveSelectionPane('preview');

    // Run high-accuracy multi-strategy locator
    const match: LineRangeMatch | null = findMatchingLineRangeInHtml(code, clean);

    if (match) {
      setHighlightedLineIdx(match.start);
      setHighlightedLineRange({ start: match.start, end: match.end });
      if (match.charStart !== undefined && match.charEnd !== undefined) {
        setHighlightedCharRange({ start: match.charStart, end: match.charEnd });
      } else {
        setHighlightedCharRange(null);
      }
      setIsBlinking(true);

      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = setTimeout(() => setIsBlinking(false), 3000);
    }
  }, [code]);

  // When text is selected in the editor textarea
  const handleEditorTextSelected = useCallback((selectedText: string) => {
    if (!selectedText || !selectedText.trim()) {
      return;
    }
    setActiveSelectionPane('editor');
    setSelectedTextForAi(selectedText.trim());
  }, []);

  // When AI Refine action is triggered from either pane
  const handleRefineSelection = useCallback((selectedText: string) => {
    setSelectedTextForAi(selectedText);
    onOpenAiAssistant?.();
  }, [onOpenAiAssistant]);

  return {
    isSelectRefiningModeEnabled,
    toggleSelectRefiningMode,
    activeSelectionPane,
    setActiveSelectionPane,
    selectedTextForAi,
    setSelectedTextForAi,
    highlightedLineIdx,
    setHighlightedLineIdx,
    highlightedLineRange,
    setHighlightedLineRange,
    highlightedCharRange,
    isBlinking,
    setIsBlinking,
    blinkTimeoutRef,
    handlePreviewTextSelected,
    handleEditorTextSelected,
    handleRefineSelection
  };
}

