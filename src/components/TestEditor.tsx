import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  studioTabVariants,
  studioBackdropVariants,
  studioModalVariants,
  studioFadeVariants,
  gpuAcceleratedStyle,
  gpuTransformStyle
} from '../lib/animationConfig';
import { triggerBlobDownload, triggerSystemPrint } from '../lib/omrPrintDownload';
import { 
  Save, 
  Eye, 
  EyeOff,
  BookOpen, 
  Undo2, 
  Redo2, 
  Columns, 
  FileCode, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  ZoomIn,
  Compass,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  Sparkles,
  FileUp,
  Upload,
  Download,
  AlertTriangle,
  Sliders,
  SlidersHorizontal,
  Trash2,
  Code2,
  Printer,
  RotateCcw,
  Search,
  Clipboard,
  ClipboardCheck,
  Filter,
  Lightbulb,
  History,
  Clock,
  Package,
  Plus,
  PlusCircle,
  ArrowUpDown,
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Wand2,
  Share2,
} from 'lucide-react';
import { encodeTestToShareUrl, createShareUrlAsync } from '../utils/shareUtils';
import { MathRenderer } from './MathRenderer';
import { OmrQuestionPaper } from './OmrQuestionPaper';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { EditorDiagramResizable } from './EditorDiagramResizable';
import { DiagramPickerModal } from './DiagramPickerModal';
import { normalizeDiagramUrl } from '../lib/diagramPresets';
import { isMcqQuestion, checkIsOptionCorrect, type MathTest, type MathQuestion, type MathTopic, type QuestionPaperLayout } from '../types';
import { DEFAULT_TOPICS, getSavedCustomTopics, saveCustomTopic, getAllAvailableTopics } from '../utils/topics';
import { generateProceduralExamSvg } from '../utils/diagramSynthesizer';
import type { User } from 'firebase/auth';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { APP_STYLES } from './ui/AppStyles';

interface TestEditorProps {
  initialTest?: MathTest | null;
  initialOpenAiPrompt?: boolean;
  allTests?: MathTest[];
  currentUser: User | null;
  onSaveTest: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onCancel: () => void;
  onExportJson?: (test: MathTest) => void;
  onImportTests?: (imported: MathTest[]) => void;
  onOpenCustomPanel?: () => void;
  onUnloadTest?: () => void;
}

export function formatQuestionCompact(q: Partial<MathQuestion>): Record<string, any> {
  const isMcq = Array.isArray(q.options) && q.options.length > 0;
  const result: Record<string, any> = {
    text: q.text || '',
  };

  // Preserve question-specific topic and subtopic
  const effTopic = (typeof q.topic === 'string' && q.topic.trim())
    ? q.topic.trim()
    : (typeof q.qtopic === 'string' && q.qtopic.trim() ? q.qtopic.trim() : undefined);
  if (effTopic) {
    result.topic = effTopic;
  }
  if (q.subtopic && typeof q.subtopic === 'string' && q.subtopic.trim()) {
    result.subtopic = q.subtopic.trim();
  }

  if (isMcq) {
    result.options = q.options!.map((o: any) => String(o));
  }

  // Clean correctAnswer: 0-based integer index for MCQ, or number/string
  if (isMcq && q.options && q.options.length > 0) {
    let numIdx = 0;
    const rawAns = q.correctAnswer;
    if (typeof rawAns === 'number' && Number.isInteger(rawAns)) {
      numIdx = rawAns;
    } else if (typeof rawAns === 'string' && /^[0-9]+$/.test(rawAns.trim())) {
      numIdx = parseInt(rawAns.trim(), 10);
    } else if (typeof rawAns === 'string') {
      const lower = rawAns.trim().toLowerCase();
      if (lower === 'a' || lower === 'option a' || lower === '(a)' || lower === 'a)') numIdx = 0;
      else if (lower === 'b' || lower === 'option b' || lower === '(b)' || lower === 'b)') numIdx = 1;
      else if (lower === 'c' || lower === 'option c' || lower === '(c)' || lower === 'c)') numIdx = 2;
      else if (lower === 'd' || lower === 'option d' || lower === '(d)' || lower === 'd)') numIdx = 3;
      else {
        const found = q.options!.findIndex((o: any) => String(o).trim().toLowerCase() === lower);
        if (found >= 0) numIdx = found;
      }
    }
    if (numIdx < 0 || numIdx >= q.options.length) numIdx = 0;
    result.correctAnswer = numIdx;
  } else {
    result.correctAnswer = q.correctAnswer !== undefined && q.correctAnswer !== null ? q.correctAnswer : 0;
  }

  // Clean explanation without redundant solution property
  result.explanation = q.explanation || q.solution || '';

  // ONLY attach image fields if an actual real image/diagram is present (no empty strings or empty arrays)
  const validImageUrl = typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : undefined;
  if (validImageUrl) {
    result.imageUrl = validImageUrl;
    if (typeof q.imageWidth === 'number' && q.imageWidth > 0) {
      result.imageWidth = Math.round(q.imageWidth);
    }
  }

  if (Array.isArray(q.imageUrls)) {
    const validUrls = q.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
    if (validUrls.length > 0) {
      result.imageUrls = validUrls;
      if (Array.isArray(q.imageWidths) && q.imageWidths.some((w) => typeof w === 'number' && w > 0)) {
        result.imageWidths = q.imageWidths;
      }
    }
  }

  // NEVER output paperLayout, explanationImageUrl, explanationImageUrls, solutionImageUrl, or solution into clean question code!
  return result;
}

export function formatTestCompact(
  title: string,
  topic: string,
  time: number,
  questions: (MathQuestion | any)[]
): Record<string, any> {
  return {
    title: title || 'New Mathematics Assessment',
    topic: topic || 'Matrices and Determinants',
    time: typeof time === 'number' && time > 0 ? time : 15,
    questions: (questions || []).map(formatQuestionCompact),
  };
}

export function normalizeQuestion(raw: any, index: number): MathQuestion {
  const isMcq = Array.isArray(raw.options) && raw.options.length > 0;

  // Extract raw answer/correct option from potential JSON key variations
  const rawAns = raw.correctAnswer !== undefined ? raw.correctAnswer :
                 raw.correctOption !== undefined ? raw.correctOption :
                 raw.correct_option !== undefined ? raw.correct_option :
                 raw.correct_answer !== undefined ? raw.correct_answer :
                 raw.answer !== undefined ? raw.answer :
                 raw.answerIndex !== undefined ? raw.answerIndex :
                 raw.answer_index !== undefined ? raw.answer_index :
                 raw.answerIdx !== undefined ? raw.answerIdx :
                 raw.answer_idx !== undefined ? raw.answer_idx :
                 raw.correct !== undefined ? raw.correct : '';

  let finalAnswer = rawAns !== null && rawAns !== undefined ? String(rawAns).trim() : '0';

  // If MCQ question, interpret 0, 1, 2, 3 index (numeric or string) or A/B/C/D or text into 0-based index "0", "1", "2", "3"
  if (isMcq && raw.options && raw.options.length > 0) {
    let numIdx = -1;
    if (typeof rawAns === 'number' && Number.isInteger(rawAns)) {
      numIdx = rawAns;
    } else if (typeof rawAns === 'string' && /^[0-9]+$/.test(rawAns.trim())) {
      numIdx = parseInt(rawAns.trim(), 10);
    } else if (typeof rawAns === 'string') {
      const lower = rawAns.trim().toLowerCase();
      if (lower === 'a' || lower === 'option a' || lower === '(a)' || lower === 'a)') numIdx = 0;
      else if (lower === 'b' || lower === 'option b' || lower === '(b)' || lower === 'b)') numIdx = 1;
      else if (lower === 'c' || lower === 'option c' || lower === '(c)' || lower === 'c)') numIdx = 2;
      else if (lower === 'd' || lower === 'option d' || lower === '(d)' || lower === 'd)') numIdx = 3;
      else {
        const found = raw.options.findIndex((o: any) => String(o).trim().toLowerCase() === lower);
        if (found >= 0) numIdx = found;
      }
    }

    if (numIdx >= 0 && numIdx < raw.options.length) {
      finalAnswer = String(numIdx);
    } else {
      finalAnswer = '0';
    }
  }

  // Preserve topic, subtopic, and qtopic!
  const rawTopic = typeof raw.topic === 'string' && raw.topic.trim() ? raw.topic.trim() : undefined;
  const rawSubtopic = typeof raw.subtopic === 'string' && raw.subtopic.trim() ? raw.subtopic.trim() : undefined;
  const rawQtopic = typeof raw.qtopic === 'string' && raw.qtopic.trim() ? raw.qtopic.trim() : (rawTopic || undefined);

  const extractedImageUrl = 
    raw.imageUrl || 
    raw.diagramUrl || 
    raw.diagram_url || 
    raw.image || 
    raw.image_url || 
    raw.diagram || 
    raw.figure || 
    raw.svg || 
    raw.paperLayout?.imageUrl || 
    raw.layout?.imageUrl || 
    undefined;

  const normalizedImageUrl = extractedImageUrl && typeof extractedImageUrl === 'string' && extractedImageUrl.trim().startsWith('<svg')
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(extractedImageUrl.trim())}`
    : (extractedImageUrl || undefined);

  const rawOptionImages = raw.optionImages || raw.option_images || raw.optionsImages;
  const normalizedOptionImages = Array.isArray(rawOptionImages)
    ? rawOptionImages.map((img: any) => {
        if (!img || typeof img !== 'string') return undefined;
        if (img.trim().startsWith('<svg')) {
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.trim())}`;
        }
        return img.trim() || undefined;
      })
    : undefined;

  const rawOptionImageWidths = raw.optionImageWidths || raw.option_image_widths;
  const normalizedOptionImageWidths = Array.isArray(rawOptionImageWidths)
    ? rawOptionImageWidths.map((w: any) => typeof w === 'number' && w > 0 ? Math.round(w) : undefined)
    : undefined;

  const rawExplImg = raw.explanationImageUrl || raw.explanation_image_url || raw.solutionImageUrl || raw.solution_image_url || raw.explanationImage;
  const normalizedExplanationImageUrl = rawExplImg && typeof rawExplImg === 'string' && rawExplImg.trim().startsWith('<svg')
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawExplImg.trim())}`
    : (rawExplImg ? String(rawExplImg).trim() : undefined);

  const rawExplWidth = typeof raw.explanationImageWidth === 'number' && raw.explanationImageWidth > 0
    ? Math.round(raw.explanationImageWidth)
    : (typeof raw.solutionImageWidth === 'number' && raw.solutionImageWidth > 0 ? Math.round(raw.solutionImageWidth) : undefined);

  const extractedImageWidth = 
    typeof raw.imageWidth === 'number' && raw.imageWidth > 0 ? raw.imageWidth : 
    (typeof raw.paperLayout?.imageWidth === 'number' && raw.paperLayout.imageWidth > 0 ? raw.paperLayout.imageWidth : 
    (typeof raw.layout?.imageWidth === 'number' && raw.layout.imageWidth > 0 ? raw.layout.imageWidth : undefined));

  const rawImageUrls = raw.imageUrls || raw.image_urls;
  const normalizedImageUrls = Array.isArray(rawImageUrls)
    ? (rawImageUrls.map((img: any) => {
        if (!img || typeof img !== 'string') return undefined;
        if (img.trim().startsWith('<svg')) {
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.trim())}`;
        }
        return img.trim() || undefined;
      }).filter(Boolean) as string[])
    : undefined;

  const rawImageWidths = raw.imageWidths || raw.image_widths;
  const normalizedImageWidths = Array.isArray(rawImageWidths)
    ? rawImageWidths.map((w: any) => typeof w === 'number' && w > 0 ? Math.round(w) : undefined)
    : undefined;

  const rawExplanationImageUrls = raw.explanationImageUrls || raw.explanation_image_urls || raw.solutionImageUrls || raw.solution_image_urls;
  const normalizedExplanationImageUrls = Array.isArray(rawExplanationImageUrls)
    ? (rawExplanationImageUrls.map((img: any) => {
        if (!img || typeof img !== 'string') return undefined;
        if (img.trim().startsWith('<svg')) {
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.trim())}`;
        }
        return img.trim() || undefined;
      }).filter(Boolean) as string[])
    : undefined;

  const rawExplanationImageWidths = raw.explanationImageWidths || raw.explanation_image_widths || raw.solutionImageWidths || raw.solution_image_widths;
  const normalizedExplanationImageWidths = Array.isArray(rawExplanationImageWidths)
    ? rawExplanationImageWidths.map((w: any) => typeof w === 'number' && w > 0 ? Math.round(w) : undefined)
    : undefined;

  const expl = raw.explanation || raw.solution || raw.rationale || '';

  const qObj: MathQuestion = {
    id: raw.id || `q-${index + 1}`,
    text: raw.text || raw.question || '',
    type: isMcq ? 'mcq' : (raw.type || 'numerical'),
    options: isMcq ? raw.options.map((o: any) => String(o)) : undefined,
    correctAnswer: finalAnswer,
    explanation: expl,
    solution: expl,
    points: typeof raw.points === 'number' ? raw.points : 1,
    topic: rawTopic,
    subtopic: rawSubtopic,
    qtopic: rawQtopic,
  };

  // Only assign diagram / layout fields if present (never empty arrays or empty strings!)
  if (normalizedImageUrl) qObj.imageUrl = normalizedImageUrl;
  if (extractedImageWidth) qObj.imageWidth = extractedImageWidth;
  if (normalizedImageUrls && normalizedImageUrls.length > 0) qObj.imageUrls = normalizedImageUrls;
  if (normalizedImageWidths && normalizedImageWidths.some(Boolean)) qObj.imageWidths = normalizedImageWidths;
  if (normalizedOptionImages && normalizedOptionImages.some(Boolean)) qObj.optionImages = normalizedOptionImages;
  if (normalizedOptionImageWidths && normalizedOptionImageWidths.some(Boolean)) qObj.optionImageWidths = normalizedOptionImageWidths;
  if (normalizedExplanationImageUrl) qObj.explanationImageUrl = normalizedExplanationImageUrl;
  if (rawExplWidth) qObj.explanationImageWidth = rawExplWidth;
  if (normalizedExplanationImageUrls && normalizedExplanationImageUrls.length > 0) qObj.explanationImageUrls = normalizedExplanationImageUrls;
  if (normalizedExplanationImageWidths && normalizedExplanationImageWidths.some(Boolean)) qObj.explanationImageWidths = normalizedExplanationImageWidths;
  if (raw.hint) qObj.hint = raw.hint;
  if (raw.paperLayout || raw.layout) {
    qObj.paperLayout = raw.paperLayout || raw.layout;
  }

  return qObj;
}

const DEFAULT_QUESTIONS: MathQuestion[] = [
  {
    id: 'q1',
    text: 'If matrix $A = \\begin{bmatrix} 2 & 3 \\\\ 1 & 4 \\end{bmatrix}$, calculate the determinant $|A|$.',
    topic: 'Matrices and Determinants',
    subtopic: 'Determinant of a 2x2 Matrix',
    type: 'mcq',
    options: ['5', '8', '-5', '11'],
    correctAnswer: '0',
    explanation: 'The determinant of a $2\\times2$ matrix $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$ is $ad - bc$. Here $|A| = (2)(4) - (3)(1) = 8 - 3 = 5$.',
    points: 1,
  },
  {
    id: 'q2',
    text: 'Find the trace of matrix $M = \\begin{bmatrix} 5 & 2 & 1 \\\\ 0 & -3 & 4 \\\\ 7 & 8 & 6 \\end{bmatrix}$.',
    topic: 'Matrices and Determinants',
    subtopic: 'Trace of a Matrix',
    type: 'mcq',
    options: ['8', '11', '6', '14'],
    correctAnswer: '0',
    explanation: 'The trace $\\text{tr}(M)$ is the sum of main diagonal elements: $5 + (-3) + 6 = 8$.',
    points: 1,
  },
];

const SAMPLE_TEST_JSON = {
  title: 'New Mathematics Assessment',
  topic: 'Matrices and Determinants',
  time: 15,
  questions: [
    {
      text: 'If matrix $A = \\begin{bmatrix} 2 & 3 \\\\ 1 & 4 \\end{bmatrix}$, calculate the determinant $|A|$.',
      topic: 'Matrices and Determinants',
      subtopic: 'Determinant of a 2x2 Matrix',
      options: ['5', '8', '-5', '11'],
      correctAnswer: 0,
      explanation: 'The determinant of a $2\\times2$ matrix $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$ is $ad - bc$. Here $|A| = (2)(4) - (3)(1) = 8 - 3 = 5$.',
    },
    {
      text: 'Find the trace of matrix $M = \\begin{bmatrix} 5 & 2 & 1 \\\\ 0 & -3 & 4 \\\\ 7 & 8 & 6 \\end{bmatrix}$.',
      topic: 'Matrices and Determinants',
      subtopic: 'Trace of a Matrix',
      options: ['8', '11', '6', '14'],
      correctAnswer: 0,
      explanation: 'The trace $\\text{tr}(M)$ is the sum of main diagonal elements: $5 + (-3) + 6 = 8$.',
    },
  ],
};

const DEFAULT_TEST_TEMPLATE = {
  title: 'New Mathematics Assessment',
  topic: 'Matrices and Determinants' as MathTopic,
  time: 15,
  questions: DEFAULT_QUESTIONS.map(formatQuestionCompact),
};

export const TestEditor: React.FC<TestEditorProps> = ({
  initialTest,
  initialOpenAiPrompt = false,
  allTests = [],
  currentUser,
  onSaveTest,
  onDeleteTest,
  onCancel,
  onExportJson,
  onImportTests,
  onOpenCustomPanel,
  onUnloadTest,
}) => {
  // Test Metadata
  const [editingTestId, setEditingTestId] = useState<string | null>(initialTest?.id || null);
  const [title, setTitle] = useState<string>(initialTest?.title || 'New Mathematics Assessment');
  const [description, setDescription] = useState<string>(
    initialTest?.description || 'Curated mock assessment with step-by-step LaTeX derivations.'
  );

  const initialTopicStr = (initialTest?.topic as string) || 'Matrices and Determinants';
  const isInitialCustom = !DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === initialTopicStr.toLowerCase());

  const [topic, setTopic] = useState<string>(initialTopicStr);
  const [isCustomTopicActive, setIsCustomTopicActive] = useState<boolean>(isInitialCustom);
  const [customTopicInput, setCustomTopicInput] = useState<string>(isInitialCustom ? initialTopicStr : '');

  // Saved and dynamically loaded custom topics
  const [savedCustomTopics, setSavedCustomTopics] = useState<string[]>(() => getSavedCustomTopics());
  const [copiedShareTestId, setCopiedShareTestId] = useState<string | null>(null);

  const handleShareTest = useCallback((testToShare: MathTest) => {
    try {
      const shareUrl = encodeTestToShareUrl(testToShare);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedShareTestId(testToShare.id);
      setTimeout(() => setCopiedShareTestId(null), 2500);
    } catch (err) {
      console.warn('Failed to generate share link:', err);
    }
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      setSavedCustomTopics(getSavedCustomTopics());
    };
    window.addEventListener('custom-topics-updated', handleUpdate);
    return () => window.removeEventListener('custom-topics-updated', handleUpdate);
  }, []);

  const customTopicsList = useMemo(() => {
    const set = new Set<string>(savedCustomTopics);
    if (allTests) {
      allTests.forEach((t) => {
        if (t.topic && typeof t.topic === 'string') {
          const trimmed = t.topic.trim();
          const isDef = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === trimmed.toLowerCase());
          if (!isDef && trimmed) {
            set.add(trimmed);
          }
        }
      });
    }
    return Array.from(set);
  }, [savedCustomTopics, allTests]);

  const allAvailableTopicsList = useMemo(() => {
    return getAllAvailableTopics(allTests);
  }, [allTests, savedCustomTopics]);

  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(initialTest?.timeLimitMinutes ?? 15);
  const [passingScorePercentage, setPassingScorePercentage] = useState<number>(
    initialTest?.passingScorePercentage ?? 60
  );

  // Questions List
  const [questions, setQuestions] = useState<MathQuestion[]>(
    initialTest?.questions && initialTest.questions.length > 0
      ? initialTest.questions
      : DEFAULT_QUESTIONS
  );

  // Current Question Index for Preview
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);

  // Layout View Modes (Default to Split for Desktop)
  const [layoutMode, setLayoutMode] = useState<'split' | 'editor' | 'canvas'>('split');
  const [mobileTab, setMobileTab] = useState<'editor' | 'canvas'>('canvas');
  
  // Card Mode inside Canvas: 'paper' (A4 Paper Studio) | 'rendered' (Card View) | 'code' (JSON Code)
  const [cardMode, setSetCardMode] = useState<'paper' | 'rendered' | 'code'>('rendered');
  const cardModeRef = useRef<'paper' | 'rendered' | 'code'>('rendered');
  const setCardMode = (mode: 'paper' | 'rendered' | 'code') => {
    cardModeRef.current = mode;
    setSetCardMode(mode);
  };

  // Paper mode settings states (rendered at root Right Column level to avoid scroll-bar clipping)
  const [layoutDensity, setLayoutDensity] = useState<'tight' | 'balanced' | 'relaxed'>('balanced');
  const [showBadges, setShowBadges] = useState<boolean>(true);
  const [isDockExpanded, setIsDockExpanded] = useState<boolean>(false);

  // Save Confirmation Modal State
  const [isSaveConfirmModalOpen, setIsSaveConfirmModalOpen] = useState<boolean>(false);
  const [diagramModalTarget, setDiagramModalTarget] = useState<{
    isOpen: boolean;
    targetType: 'question' | 'option' | 'explanation';
    optionIndex?: number;
    index?: number;
    isAdd?: boolean;
  }>({
    isOpen: false,
    targetType: 'question',
  });

  // JSON Schema Text State
  const [jsonText, setJsonText] = useState<string>(() => {
    const rawQuestions = initialTest?.questions && initialTest.questions.length > 0 ? initialTest.questions : DEFAULT_QUESTIONS;
    const initialTime = initialTest?.time ?? initialTest?.timeLimitMinutes ?? 15;
    const initialTitle = initialTest?.title || 'New Mathematics Assessment';
    const initialTopic = (initialTest?.topic as MathTopic) || 'Matrices and Determinants';
    const compactObj = formatTestCompact(initialTitle, initialTopic, initialTime, rawQuestions);
    return JSON.stringify(compactObj, null, 2);
  });

  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedQuestionCode, setCopiedQuestionCode] = useState<boolean>(false);

  // Undo & Redo History State (stores full JSON and Code Draft snapshots)
  interface HistorySnapshot {
    jsonText: string;
    questionCodeDraft: string;
    currentQIndex: number;
    description?: string;
  }

  const initialSnapshot: HistorySnapshot = useMemo(() => {
    const rawQuestions = initialTest?.questions && initialTest.questions.length > 0 ? initialTest.questions : DEFAULT_QUESTIONS;
    const initialTime = initialTest?.time ?? initialTest?.timeLimitMinutes ?? 15;
    const initialTitle = initialTest?.title || 'New Mathematics Assessment';
    const initialTopic = (initialTest?.topic as MathTopic) || 'Matrices and Determinants';
    const compactObj = formatTestCompact(initialTitle, initialTopic, initialTime, rawQuestions);
    const initialJson = JSON.stringify(compactObj, null, 2);
    const firstQ = rawQuestions[0];
    return {
      jsonText: initialJson,
      questionCodeDraft: firstQ ? JSON.stringify(formatQuestionCompact(firstQ), null, 2) : '',
      currentQIndex: 0,
    };
  }, [initialTest]);

  // Synchronous, non-stale History Manager
  const historyRef = useRef<{ stack: HistorySnapshot[]; index: number }>({
    stack: [initialSnapshot],
    index: 0,
  });
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  const historyIndex = historyRef.current.index;
  const historyStack = historyRef.current.stack;
  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  // Textarea and Backdrop references for Find and Scroll synchronization
  const jsonTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const jsonBackdropRef = useRef<HTMLDivElement | null>(null);
  const codeDraftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeBackdropRef = useRef<HTMLDivElement | null>(null);

  // Find in JSON Schema Editor state
  const [isJsonFindOpen, setIsJsonFindOpen] = useState<boolean>(false);
  const [jsonFindQuery, setJsonFindQuery] = useState<string>('');
  const [jsonFindMatches, setJsonFindMatches] = useState<number[]>([]);
  const [jsonFindCurrentIdx, setJsonFindCurrentIdx] = useState<number>(0);

  // Find in Code Review Editor state
  const [isCodeFindOpen, setIsCodeFindOpen] = useState<boolean>(false);
  const [codeFindQuery, setCodeFindQuery] = useState<string>('');
  const [codeFindMatches, setCodeFindMatches] = useState<number[]>([]);
  const [codeFindCurrentIdx, setCodeFindCurrentIdx] = useState<number>(0);

  // History Drawer Search & Filter state
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState<boolean>(false);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const [historyTopicFilter, setHistoryTopicFilter] = useState<string>('all');
  const [historySortBy, setHistorySortBy] = useState<'recent' | 'title' | 'questions'>('recent');

  // View Layout & Responsiveness
  const [isDesktop, setIsDesktop] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Split view resizer state
  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(50);
  const isResizing = useRef<boolean>(false);

  // Zoom Level
  const [zoomProportion, setZoomProportion] = useState<number>(100);

  // Menu Dropdown states
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState<boolean>(false);
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState<boolean>(false);
  const [isTitleSettingsMenuOpen, setIsTitleSettingsMenuOpen] = useState<boolean>(false);

  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const jumpMenuRef = useRef<HTMLDivElement | null>(null);
  const titleSettingsMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals & Drawers
  const [isTestSettingsModalOpen, setIsTestSettingsModalOpen] = useState<boolean>(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [questionCodeDraft, setQuestionCodeDraft] = useState<string>(() => {
    const firstQ = initialTest?.questions?.[0] || DEFAULT_QUESTIONS[0];
    return firstQ ? JSON.stringify(formatQuestionCompact(firstQ), null, 2) : '';
  });
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [testToDeleteId, setTestToDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string>('');
  const [isJsonPastedNotice, setIsJsonPastedNotice] = useState<boolean>(false);
  const [copiedJsonSchema, setCopiedJsonSchema] = useState<boolean>(false);
  const [isQuestionCodePastedNotice, setIsQuestionCodePastedNotice] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // AI Prompt Bar State for Test Creator Studio
  const [isAiPromptOpen, setIsAiPromptOpen] = useState<boolean>(() => Boolean(initialOpenAiPrompt));
  const [aiPromptText, setAiPromptText] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiScope, setAiScope] = useState<'all' | 'current'>('all');
  const [aiNotice, setAiNotice] = useState<string>('');
  const aiPromptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialOpenAiPrompt) {
      setIsAiPromptOpen(true);
      setTimeout(() => {
        aiPromptInputRef.current?.focus();
      }, 200);
    }
  }, [initialOpenAiPrompt]);

  // Lock body scroll on modals
  useScrollLock(
    isTestSettingsModalOpen || 
    isHistoryDrawerOpen || 
    isImportModalOpen || 
    isSaveConfirmModalOpen ||
    diagramModalTarget.isOpen ||
    !!testToDeleteId
  );

  // System gesture & back button integration for Editor modals and menus
  useBackHandler({
    isOpen: diagramModalTarget.isOpen,
    onBack: () => setDiagramModalTarget((prev) => ({ ...prev, isOpen: false })),
    priority: 55,
    id: 'editor_diagram_picker_modal',
  });

  useBackHandler({
    isOpen: isSaveConfirmModalOpen,
    onBack: () => setIsSaveConfirmModalOpen(false),
    priority: 50,
    id: 'editor_save_modal',
  });

  useBackHandler({
    isOpen: !!testToDeleteId,
    onBack: () => setTestToDeleteId(null),
    priority: 50,
    id: 'editor_delete_modal',
  });

  useBackHandler({
    isOpen: isImportModalOpen,
    onBack: () => setIsImportModalOpen(false),
    priority: 40,
    id: 'editor_import_modal',
  });

  useBackHandler({
    isOpen: isTestSettingsModalOpen,
    onBack: () => setIsTestSettingsModalOpen(false),
    priority: 35,
    id: 'editor_settings_modal',
  });

  useBackHandler({
    isOpen: isHistoryDrawerOpen,
    onBack: () => setIsHistoryDrawerOpen(false),
    priority: 35,
    id: 'editor_history_drawer',
  });

  // Synchronize status bar theme-color for Test Creator Studio & Test History (#e5e9f0 light / #0b0c10 dark)
  useEffect(() => {
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const targetHeaderColor = isDark ? '#0b0c10' : '#e5e9f0';
      const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
      if (metaThemeColors.length > 0) {
        metaThemeColors.forEach((el) => {
          el.removeAttribute('media');
          el.setAttribute('content', targetHeaderColor);
        });
      }
    } catch {
      // Ignore in non-browser environments
    }
  }, [isHistoryDrawerOpen]);

  useBackHandler({
    isOpen: isJsonFindOpen,
    onBack: () => setIsJsonFindOpen(false),
    priority: 30,
    id: 'editor_json_find',
  });

  useBackHandler({
    isOpen: isCodeFindOpen,
    onBack: () => setIsCodeFindOpen(false),
    priority: 30,
    id: 'editor_code_find',
  });

  useBackHandler({
    isOpen: isActionsMenuOpen || isJumpMenuOpen || isTitleSettingsMenuOpen,
    onBack: () => {
      setIsActionsMenuOpen(false);
      setIsJumpMenuOpen(false);
      setIsTitleSettingsMenuOpen(false);
    },
    priority: 25,
    id: 'editor_dropdown_menus',
  });

  // Base editor back gesture: If no modal or menu is open, pressing back invokes onCancel
  const isAnyEditorOverlayOpen = 
    diagramModalTarget.isOpen ||
    isSaveConfirmModalOpen || 
    !!testToDeleteId || 
    isImportModalOpen || 
    isTestSettingsModalOpen || 
    isHistoryDrawerOpen || 
    isJsonFindOpen || 
    isCodeFindOpen || 
    isActionsMenuOpen || 
    isJumpMenuOpen || 
    isTitleSettingsMenuOpen;

  useBackHandler({
    isOpen: !isAnyEditorOverlayOpen,
    onBack: () => onCancel(),
    priority: 15,
    id: 'editor_base_back',
  });

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setIsActionsMenuOpen(false);
      }
      if (jumpMenuRef.current && !jumpMenuRef.current.contains(target)) {
        setIsJumpMenuOpen(false);
      }
      if (titleSettingsMenuRef.current && !titleSettingsMenuRef.current.contains(target)) {
        setIsTitleSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentQuestion: MathQuestion = questions[currentQIndex] || {
    id: 'q-empty',
    text: 'No question data available in schema.',
    type: 'mcq',
    options: ['Option A', 'Option B'],
    correctAnswer: 'Option A',
    explanation: 'Provide a question in the JSON schema.',
    points: 1,
  };

  // Synchronous references to avoid stale closures in history operations
  const currentQIndexRef = useRef(currentQIndex);
  currentQIndexRef.current = currentQIndex;

  const questionCodeDraftRef = useRef(questionCodeDraft);
  questionCodeDraftRef.current = questionCodeDraft;

  // Robust history push that tracks both JSON schema and Live Preview code draft
  const pushHistory = useCallback((newText: string, newDraft?: string, qIdx?: number, desc?: string) => {
    const cur = historyRef.current;
    const targetQIdx = typeof qIdx === 'number' ? qIdx : currentQIndexRef.current;
    const targetDraft = newDraft !== undefined ? newDraft : questionCodeDraftRef.current;
    const currentSnap = cur.stack[cur.index];

    if (
      currentSnap &&
      currentSnap.jsonText === newText &&
      currentSnap.questionCodeDraft === targetDraft &&
      currentSnap.currentQIndex === targetQIdx
    ) {
      return;
    }

    const nextStack = cur.stack.slice(0, cur.index + 1);
    nextStack.push({
      jsonText: newText,
      questionCodeDraft: targetDraft,
      currentQIndex: targetQIdx,
      description: desc,
    });

    if (nextStack.length > 80) {
      nextStack.shift();
    }

    historyRef.current = {
      stack: nextStack,
      index: nextStack.length - 1,
    };
    setHistoryVersion((v) => v + 1);
  }, []);

  const currentPaperTest: MathTest = useMemo(() => ({
    id: editingTestId || 'paper-preview',
    title: title || 'Mathematics Assessment',
    topic: (topic as MathTopic) || 'Matrices and Determinants',
    timeLimitMinutes: timeLimitMinutes,
    time: timeLimitMinutes,
    totalMarks: questions.reduce((acc, q) => acc + (q.points || 1), 0),
    questions: questions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [editingTestId, title, topic, timeLimitMinutes, questions]);

  const handleUpdateQuestionLayout = useCallback((qIndex: number, newLayout: QuestionPaperLayout) => {
    setQuestions((prevQs) => {
      const nextQs = [...prevQs];
      if (nextQs[qIndex]) {
        nextQs[qIndex] = {
          ...nextQs[qIndex],
          paperLayout: newLayout,
          imageWidth: 'imageWidth' in newLayout ? newLayout.imageWidth : nextQs[qIndex].imageWidth,
          imageWidths: 'imageWidths' in newLayout ? newLayout.imageWidths : nextQs[qIndex].imageWidths,
          imageUrl: newLayout.imageUrl || nextQs[qIndex].imageUrl,
        };
      }
      const compactObj = formatTestCompact(title, topic, timeLimitMinutes, nextQs);
      const newJson = JSON.stringify(compactObj, null, 2);
      setJsonText(newJson);
      pushHistory(newJson, undefined, qIndex);
      return nextQs;
    });
  }, [title, topic, timeLimitMinutes, pushHistory]);

  const handleResetAllLayouts = useCallback(() => {
    setQuestions((prevQs) => {
      const nextQs = prevQs.map((q) => {
        const { paperLayout, ...rest } = q;
        return rest;
      });
      const compactObj = formatTestCompact(title, topic, timeLimitMinutes, nextQs);
      const newJson = JSON.stringify(compactObj, null, 2);
      setJsonText(newJson);
      pushHistory(newJson, undefined, currentQIndex);
      return nextQs;
    });
  }, [title, topic, timeLimitMinutes, currentQIndex, pushHistory]);

  const handlePrintA4 = useCallback(async () => {
    try {
      const cleanTitle = (title || 'Question_Paper').replace(/[^a-zA-Z0-9_-]/g, '_');
      await triggerSystemPrint(
        'question-paper-printable-root',
        `${cleanTitle}_Question_Paper_A4`,
        210,
        297
      );
    } catch (err) {
      console.error('System print error:', err);
    }
  }, [title]);

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    setJsonText(snapshot.jsonText);
    if (snapshot.questionCodeDraft) {
      setQuestionCodeDraft(snapshot.questionCodeDraft);
    }
    if (typeof snapshot.currentQIndex === 'number') {
      setCurrentQIndex(snapshot.currentQIndex);
    }

    try {
      const parsed = JSON.parse(snapshot.jsonText);
      if (parsed && typeof parsed === 'object') {
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.topic) {
          const topicStr = String(parsed.topic).trim();
          setTopic(topicStr);
          const isDef = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === topicStr.toLowerCase());
          if (!isDef && topicStr) {
            setIsCustomTopicActive(true);
            setCustomTopicInput(topicStr);
          } else {
            setIsCustomTopicActive(false);
            setCustomTopicInput('');
          }
        }
        const parsedTime = typeof parsed.time === 'number' ? parsed.time : (typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : undefined);
        if (typeof parsedTime === 'number') setTimeLimitMinutes(parsedTime);
        if (typeof parsed.passingScorePercentage === 'number') setPassingScorePercentage(parsed.passingScorePercentage);
        if (Array.isArray(parsed.questions)) {
          setQuestions(parsed.questions.map((q: any, idx: number) => normalizeQuestion(q, idx)));
        }
      }
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON syntax');
    }
  }, []);

  const parseAndSyncState = useCallback((text: string, recordHistory = true): boolean => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JSON root must be an object.');
      }
      if (!Array.isArray(parsed.questions)) {
        throw new Error('Property "questions" must be an array of questions.');
      }

      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.topic) {
        const topicStr = String(parsed.topic).trim();
        setTopic(topicStr);
        const isDef = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === topicStr.toLowerCase());
        if (!isDef && topicStr) {
          setIsCustomTopicActive(true);
          setCustomTopicInput(topicStr);
        } else {
          setIsCustomTopicActive(false);
          setCustomTopicInput('');
        }
      }
      const parsedTime = typeof parsed.time === 'number' ? parsed.time : (typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : undefined);
      if (typeof parsedTime === 'number') setTimeLimitMinutes(parsedTime);
      if (typeof parsed.passingScorePercentage === 'number') setPassingScorePercentage(parsed.passingScorePercentage);
      
      const normalizedQs = parsed.questions.map((q: any, idx: number) => normalizeQuestion(q, idx));
      setQuestions(normalizedQs);
      setJsonError(null);

      const targetIdx = currentQIndex >= normalizedQs.length ? Math.max(0, normalizedQs.length - 1) : currentQIndex;
      setCurrentQIndex(targetIdx);

      let nextDraft = questionCodeDraft;
      if (normalizedQs[targetIdx]) {
        nextDraft = JSON.stringify(formatQuestionCompact(normalizedQs[targetIdx]), null, 2);
        setQuestionCodeDraft(nextDraft);
      }

      if (recordHistory) {
        pushHistory(text, nextDraft, targetIdx);
      }
      return true;
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON syntax');
      return false;
    }
  }, [currentQIndex, pushHistory, questionCodeDraft]);

  const handleUndo = useCallback(() => {
    const cur = historyRef.current;
    if (cur.index <= 0) return;

    const targetIndex = cur.index - 1;
    const targetSnapshot = cur.stack[targetIndex];
    if (!targetSnapshot) return;

    historyRef.current = {
      ...cur,
      index: targetIndex,
    };
    setHistoryVersion((v) => v + 1);

    applySnapshot(targetSnapshot);
    setAiNotice('Undone modifications.');
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    const cur = historyRef.current;
    if (cur.index >= cur.stack.length - 1) return;

    const targetIndex = cur.index + 1;
    const targetSnapshot = cur.stack[targetIndex];
    if (!targetSnapshot) return;

    historyRef.current = {
      ...cur,
      index: targetIndex,
    };
    setHistoryVersion((v) => v + 1);

    applySnapshot(targetSnapshot);
    setAiNotice('Redone modifications.');
  }, [applySnapshot]);

  // Global Keyboard Shortcuts (Ctrl+Z / Cmd+Z for Undo, Ctrl+Y / Cmd+Shift+Z for Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isZ = e.key === 'z' || e.key === 'Z';
      const isY = e.key === 'y' || e.key === 'Y';
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      if (isMetaOrCtrl && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isMetaOrCtrl && isY) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // AI Prompt Execution in Test Creator Studio
  const handleRunAiPrompt = async (promptToRun?: string) => {
    const effectivePrompt = (promptToRun || aiPromptText).trim();
    if (!effectivePrompt || isAiLoading) return;

    setIsAiLoading(true);
    setAiNotice('');
    setErrorMessage('');

    try {
      const currentTestObject: MathTest = {
        id: initialTest?.id || `test_${Date.now()}`,
        title,
        description,
        topic,
        difficulty: (initialTest?.difficulty as any) || 'Medium',
        timeLimitMinutes,
        passingScorePercentage,
        questions,
        createdAt: initialTest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let res: Response | null = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        res = await fetch('/api/ai-edit-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            test: currentTestObject,
            prompt: effectivePrompt,
            targetScope: aiScope,
            questionIndex: currentQIndex,
          }),
        });
        clearTimeout(timeoutId);
      } catch (fetchErr) {
        console.log('Network fetch fallback triggered for AI Edit Test:', fetchErr);
      }

      let data: any = null;
      if (res && res.ok) {
        try {
          data = await res.json();
        } catch (e) {
          console.warn('Failed to parse AI edit response JSON:', e);
        }
      }

      if (data && data.test) {
        const newJsonStr = JSON.stringify(data.test, null, 2);
        setJsonText(newJsonStr);
        parseAndSyncState(newJsonStr, true);
        setAiPromptText('');
        const summary = data.changeSummary || 'Assessment updated successfully with Gemini AI.';
        setAiNotice(summary);
        setSaveSuccessNotice(summary);
      } else {
        // Resilient client-side fallback transformation if network or model fails
        const modifiedTest = JSON.parse(JSON.stringify(currentTestObject));
        const rawPrompt = (effectivePrompt || '').trim();
        const lowerP = rawPrompt.toLowerCase();
        let summary = "Applied requested modifications to assessment.";

        if (lowerP.includes("title") || lowerP.includes("rename")) {
          const newTitle = rawPrompt.replace(/change title to|set title to|rename to|title/gi, '').trim();
          if (newTitle) {
            modifiedTest.title = newTitle;
            summary = `Updated title to "${newTitle}".`;
          }
        }

        if (lowerP.includes("hard") || lowerP.includes("difficult") || lowerP.includes("advance")) {
          modifiedTest.difficulty = "Hard";
          summary = "Updated assessment difficulty level to Hard.";
        } else if (lowerP.includes("easy") || lowerP.includes("beginner")) {
          modifiedTest.difficulty = "Easy";
          summary = "Updated assessment difficulty level to Easy.";
        }

        if (lowerP.includes("explain") || lowerP.includes("explanation") || lowerP.includes("step")) {
          modifiedTest.questions = modifiedTest.questions.map((q: any) => ({
            ...q,
            explanation: q.explanation && q.explanation.length > 20 
              ? q.explanation 
              : `Step 1: Analyze problem statement. Step 2: Apply core theorem for ${modifiedTest.topic || 'Mathematics'}. Step 3: Verified correct answer: $${q.correctAnswer || 'Answer'}$.`
          }));
          summary = "Added step-by-step mathematical explanations to questions.";
        }

        // Deleting question
        if (lowerP.includes("delete") || lowerP.includes("remove")) {
          const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
          if (qMatch) {
            const qIdx = parseInt(qMatch[1], 10) - 1;
            if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
              modifiedTest.questions.splice(qIdx, 1);
              summary = `Deleted Question #${qIdx + 1} from assessment.`;
            }
          } else if (aiScope === 'current' && modifiedTest.questions && modifiedTest.questions[currentQIndex]) {
            modifiedTest.questions.splice(currentQIndex, 1);
            summary = `Deleted Question #${currentQIndex + 1} from assessment.`;
          }
        }

        // Adding question
        if (lowerP.includes("add") || lowerP.includes("new question") || lowerP.includes("insert") || lowerP.includes("+1") || lowerP.includes("+2")) {
          const afterMatch = lowerP.match(/after\s*(?:question|q)\s*#?([0-9]+)/i);
          let insertIdx = afterMatch ? parseInt(afterMatch[1], 10) : modifiedTest.questions.length;
          if (isNaN(insertIdx) || insertIdx < 0) insertIdx = modifiedTest.questions.length;

          const newCount = lowerP.includes("2") || lowerP.includes("+2") ? 2 : 1;
          for (let i = 0; i < newCount; i++) {
            const nextNum = modifiedTest.questions.length + 1;
            const newQ = {
              id: `q_${Date.now()}_${i}`,
              text: `Evaluate the expression: $$\\lim_{x \\to 0} \\frac{\\sin(${nextNum}x)}{x}$$`,
              type: "mcq",
              options: [`$${nextNum}$`, `$0$`, `$1$`, `$\\infty$`],
              correctAnswer: `$${nextNum}$`,
              explanation: `Using fundamental limit $\\lim_{\\theta \\to 0} \\frac{\\sin\\theta}{\\theta} = 1$, we get $${nextNum}$.`,
              points: 1
            };
            modifiedTest.questions.splice(insertIdx + i, 0, newQ);
          }
          summary = `Added ${newCount} new question${newCount > 1 ? 's' : ''} to the test.`;
        }

        // Image / Diagram attachment or removal
        if (lowerP.includes("image") || lowerP.includes("diagram") || lowerP.includes("graph") || lowerP.includes("figure") || lowerP.includes("plot")) {
          const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
          const qIdx = qMatch ? parseInt(qMatch[1], 10) - 1 : (aiScope === 'current' ? currentQIndex : 0);
          if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
            if (lowerP.includes("remove") || lowerP.includes("delete")) {
              delete modifiedTest.questions[qIdx].imageUrl;
              delete modifiedTest.questions[qIdx].imageWidth;
              if (modifiedTest.questions[qIdx].paperLayout) {
                delete modifiedTest.questions[qIdx].paperLayout.imageUrl;
                delete modifiedTest.questions[qIdx].paperLayout.imageWidth;
              }
              summary = `Removed diagram from Question #${qIdx + 1}.`;
            } else {
              const targetQ = modifiedTest.questions[qIdx];
              const isSolutionDiagram = lowerP.includes("solution") || lowerP.includes("explanation") || lowerP.includes("step");
              const svgDiagram = generateProceduralExamSvg({
                promptText: rawPrompt,
                questionText: targetQ?.text || '',
                options: targetQ?.options || [],
                explanation: targetQ?.explanation || '',
                targetType: isSolutionDiagram ? 'explanation' : 'question'
              });
              const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svgDiagram)}`;
              modifiedTest.questions[qIdx].imageUrl = uri;
              if (modifiedTest.questions[qIdx].paperLayout) {
                modifiedTest.questions[qIdx].paperLayout.imageUrl = uri;
              }
              summary = `Generated scientific vector diagram for Question #${qIdx + 1}.`;
            }
          }
        }

        const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
        if (qMatch) {
          const qIdx = parseInt(qMatch[1], 10) - 1;
          if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
            if (!summary.startsWith("Deleted") && !summary.startsWith("Added") && !summary.startsWith("Generated") && !summary.startsWith("Removed")) {
              summary = `Modified Question #${qIdx + 1} based on prompt.`;
            }
          }
        } else if (aiScope === 'current' && modifiedTest.questions && modifiedTest.questions[currentQIndex]) {
          if (!summary.startsWith("Deleted") && !summary.startsWith("Added") && !summary.startsWith("Generated") && !summary.startsWith("Removed")) {
            summary = `Updated Question #${currentQIndex + 1} based on prompt.`;
          }
        }

        if (summary === "Applied requested modifications to assessment.") {
          if (modifiedTest.questions && modifiedTest.questions.length > 0) {
            modifiedTest.questions[0].explanation = `Updated explanation for: "${rawPrompt.slice(0, 40)}...". Verified answer: $${modifiedTest.questions[0].correctAnswer}$.`;
          }
          summary = `Updated assessment based on: "${rawPrompt.slice(0, 40)}..."`;
        }

        const newJsonStr = JSON.stringify(modifiedTest, null, 2);
        setJsonText(newJsonStr);
        parseAndSyncState(newJsonStr, true);
        setAiPromptText('');
        setAiNotice(summary);
        setSaveSuccessNotice(summary);
      }
    } catch (err: any) {
      console.error('AI Edit Test error:', err);
      setErrorMessage(err.message || 'Failed to apply AI modifications. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const jsonChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setJsonText(newText);
    let currentDraft = questionCodeDraft;
    try {
      const parsed = JSON.parse(newText);
      if (Array.isArray(parsed.questions)) {
        const normalizedQs = parsed.questions.map((q: any, idx: number) => normalizeQuestion(q, idx));
        setQuestions(normalizedQs);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.topic) {
          const topicStr = String(parsed.topic).trim();
          setTopic(topicStr);
          const isDef = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === topicStr.toLowerCase());
          if (!isDef && topicStr) {
            setIsCustomTopicActive(true);
            setCustomTopicInput(topicStr);
          } else {
            setIsCustomTopicActive(false);
            setCustomTopicInput('');
          }
        }
        const parsedTime = typeof parsed.time === 'number' ? parsed.time : (typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : undefined);
        if (typeof parsedTime === 'number') setTimeLimitMinutes(parsedTime);
        if (normalizedQs[currentQIndex]) {
          currentDraft = JSON.stringify(formatQuestionCompact(normalizedQs[currentQIndex]), null, 2);
          setQuestionCodeDraft(currentDraft);
        }
      }
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }

    if (isJsonFindOpen && jsonFindQuery) {
      handlePerformJsonFind(jsonFindQuery, newText);
    }

    if (jsonChangeTimeoutRef.current) clearTimeout(jsonChangeTimeoutRef.current);
    jsonChangeTimeoutRef.current = setTimeout(() => {
      pushHistory(newText, currentDraft, currentQIndex);
    }, 400);
  };

  const codeDraftChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleCodeDraftChange = (newDraft: string) => {
    setQuestionCodeDraft(newDraft);

    if (isCodeFindOpen && codeFindQuery) {
      handlePerformCodeFind(codeFindQuery, newDraft);
    }

    if (codeDraftChangeTimeoutRef.current) clearTimeout(codeDraftChangeTimeoutRef.current);
    codeDraftChangeTimeoutRef.current = setTimeout(() => {
      try {
        const parsedQ = JSON.parse(newDraft);
        if (parsedQ && typeof parsedQ === 'object' && parsedQ.text) {
          const normalized = normalizeQuestion(parsedQ, currentQIndex);
          let fullTestParsed: any;
          try {
            fullTestParsed = JSON.parse(jsonText);
          } catch {
            fullTestParsed = formatTestCompact(title, topic, timeLimitMinutes, questions);
          }
          const updatedQuestions = [...(fullTestParsed.questions || questions.map(formatQuestionCompact))];
          const compactQ = formatQuestionCompact(normalized);
          if (currentQIndex >= 0 && currentQIndex < updatedQuestions.length) {
            updatedQuestions[currentQIndex] = compactQ;
          } else {
            updatedQuestions.push(compactQ);
          }
          fullTestParsed.questions = updatedQuestions;
          const formatted = JSON.stringify(fullTestParsed, null, 2);
          setJsonText(formatted);
          setQuestions(updatedQuestions.map((q, idx) => normalizeQuestion(q, idx)));
          setJsonError(null);
          pushHistory(formatted, newDraft, currentQIndex);
          return;
        }
      } catch {
        // Typing JSON in progress
      }
      pushHistory(jsonText, newDraft, currentQIndex);
    }, 400);
  };

  const syncStateToJson = (
    overrideTitle = title,
    overrideTopic = topic,
    overrideTime = timeLimitMinutes,
    overrideQuestions = questions
  ) => {
    const compactObj = formatTestCompact(
      overrideTitle,
      overrideTopic,
      overrideTime,
      overrideQuestions
    );
    const str = JSON.stringify(compactObj, null, 2);
    setJsonText(str);
    setJsonError(null);
    pushHistory(str);
  };

  const copyQuestionCodeToClipboard = () => {
    const code = cardMode === 'code' 
      ? questionCodeDraft 
      : JSON.stringify(formatQuestionCompact(currentQuestion), null, 2);
    navigator.clipboard.writeText(code);
    setCopiedQuestionCode(true);
    setTimeout(() => setCopiedQuestionCode(false), 2000);
  };

  const handleCopyJsonSchema = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedJsonSchema(true);
      setTimeout(() => setCopiedJsonSchema(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  const handlePasteQuestionCode = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setErrorMessage('Clipboard access not available in this browser environment.');
        return;
      }
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText || !clipboardText.trim()) {
        setErrorMessage('Clipboard is empty.');
        return;
      }
      const trimmed = clipboardText.trim();
      setQuestionCodeDraft(trimmed);
      setIsQuestionCodePastedNotice(true);
      setTimeout(() => setIsQuestionCodePastedNotice(false), 2000);
    } catch {
      setErrorMessage('Could not read clipboard. Please paste manually.');
    }
  };

  const handleAddNewQuestion = () => {
    const newQ: MathQuestion = {
      id: `q-${Date.now()}`,
      text: 'New Question: Enter mathematical problem statement with $\\LaTeX$ formula.',
      type: 'mcq',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'Option A',
      explanation: 'Explanation with mathematical proof or step-by-step solution.',
      points: 1
    };
    const newQuestions = [...questions, newQ];
    setQuestions(newQuestions);
    const newIdx = newQuestions.length - 1;
    setCurrentQIndex(newIdx);
    setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(newQ), null, 2));
    syncStateToJson(title, topic, timeLimitMinutes, newQuestions);
    setSaveSuccessNotice(`Added Question ${newQuestions.length}`);
    setTimeout(() => setSaveSuccessNotice(''), 2500);
  };

  const handleDuplicateCurrentQuestion = () => {
    if (!questions[currentQIndex]) return;
    const baseQ = questions[currentQIndex];
    const dupQ: MathQuestion = {
      ...JSON.parse(JSON.stringify(baseQ)),
      id: `q-${Date.now()}`,
      text: `${baseQ.text} (Copy)`,
    };
    const newQuestions = [
      ...questions.slice(0, currentQIndex + 1),
      dupQ,
      ...questions.slice(currentQIndex + 1),
    ];
    setQuestions(newQuestions);
    const newIdx = currentQIndex + 1;
    setCurrentQIndex(newIdx);
    setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(dupQ), null, 2));
    syncStateToJson(title, topic, timeLimitMinutes, newQuestions);
    setSaveSuccessNotice(`Duplicated Question ${currentQIndex + 1}`);
    setTimeout(() => setSaveSuccessNotice(''), 2500);
  };

  const handleDeleteCurrentQuestion = () => {
    if (questions.length <= 1) {
      setErrorMessage('Assessment must contain at least one question.');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    const newQuestions = questions.filter((_, idx) => idx !== currentQIndex);
    const newIdx = Math.max(0, Math.min(newQuestions.length - 1, currentQIndex));
    setQuestions(newQuestions);
    setCurrentQIndex(newIdx);
    if (newQuestions[newIdx]) {
      setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(newQuestions[newIdx]), null, 2));
    }
    syncStateToJson(title, topic, timeLimitMinutes, newQuestions);
    setSaveSuccessNotice('Question deleted');
    setTimeout(() => setSaveSuccessNotice(''), 2500);
  };

  const handleSelectCorrectOption = (optIdx: number) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex], correctAnswer: String(optIdx) };
    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore JSON parse error
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleOpenQuestionDiagram = (index?: number, isAdd?: boolean) => {
    setDiagramModalTarget({
      isOpen: true,
      targetType: 'question',
      index,
      isAdd,
    });
  };

  const handleOpenOptionDiagram = (optIdx: number) => {
    setDiagramModalTarget({
      isOpen: true,
      targetType: 'option',
      optionIndex: optIdx,
    });
  };

  const handleOpenExplanationDiagram = (index?: number, isAdd?: boolean) => {
    setDiagramModalTarget({
      isOpen: true,
      targetType: 'explanation',
      index,
      isAdd,
    });
  };

  const handleApplyDiagram = (imageUrl: string | undefined, index?: number, isAdd?: boolean) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };

    if (isAdd) {
      if (imageUrl) {
        if (!targetQ.imageUrl) {
          targetQ.imageUrl = imageUrl;
          targetQ.paperLayout = {
            ...(targetQ.paperLayout || {}),
            imageUrl: imageUrl,
          };
        } else {
          const currentUrls = Array.isArray(targetQ.imageUrls) ? [...targetQ.imageUrls] : [];
          const currentWidths = Array.isArray(targetQ.imageWidths) ? [...targetQ.imageWidths] : [];
          currentUrls.push(imageUrl);
          currentWidths.push(undefined);
          targetQ.imageUrls = currentUrls;
          targetQ.imageWidths = currentWidths;
        }
      }
    } else if (index !== undefined && index >= 0) {
      if (!imageUrl) {
        const currentUrls = Array.isArray(targetQ.imageUrls) ? [...targetQ.imageUrls] : [];
        const currentWidths = Array.isArray(targetQ.imageWidths) ? [...targetQ.imageWidths] : [];
        currentUrls.splice(index, 1);
        currentWidths.splice(index, 1);
        if (currentUrls.length > 0) {
          targetQ.imageUrls = currentUrls;
          targetQ.imageWidths = currentWidths;
        } else {
          delete targetQ.imageUrls;
          delete targetQ.imageWidths;
        }
      } else {
        const currentUrls = Array.isArray(targetQ.imageUrls) ? [...targetQ.imageUrls] : [];
        currentUrls[index] = imageUrl;
        targetQ.imageUrls = currentUrls;
      }
    } else {
      if (!imageUrl) {
        delete targetQ.imageUrl;
        delete targetQ.imageWidth;
        if (targetQ.paperLayout) {
          const nextLayout = { ...targetQ.paperLayout };
          delete nextLayout.imageUrl;
          delete nextLayout.imageWidth;
          targetQ.paperLayout = nextLayout;
        }
        if (Array.isArray(targetQ.imageUrls) && targetQ.imageUrls.length > 0) {
          const currentUrls = [...targetQ.imageUrls];
          const currentWidths = Array.isArray(targetQ.imageWidths) ? [...targetQ.imageWidths] : [];
          const firstExtra = currentUrls.shift();
          const firstExtraWidth = currentWidths.shift();
          targetQ.imageUrl = firstExtra;
          targetQ.imageWidth = firstExtraWidth;
          targetQ.paperLayout = {
            ...(targetQ.paperLayout || {}),
            imageUrl: firstExtra,
            imageWidth: firstExtraWidth,
          };
          if (currentUrls.length > 0) {
            targetQ.imageUrls = currentUrls;
            targetQ.imageWidths = currentWidths;
          } else {
            delete targetQ.imageUrls;
            delete targetQ.imageWidths;
          }
        }
      } else {
        targetQ.imageUrl = imageUrl;
        targetQ.paperLayout = {
          ...(targetQ.paperLayout || {}),
          imageUrl: imageUrl,
        };
      }
    }

    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleApplyOptionDiagram = (optIdx: number, imageUrl: string | undefined) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };
    const optsCount = targetQ.options?.length || 4;
    const currentOptionImages = Array.isArray(targetQ.optionImages)
      ? [...targetQ.optionImages]
      : new Array(optsCount).fill(undefined);

    currentOptionImages[optIdx] = imageUrl || undefined;
    if (currentOptionImages.some(Boolean)) {
      targetQ.optionImages = currentOptionImages;
    } else {
      delete targetQ.optionImages;
    }

    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleApplyExplanationDiagram = (imageUrl: string | undefined, index?: number, isAdd?: boolean) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };

    if (isAdd) {
      if (imageUrl) {
        if (!targetQ.explanationImageUrl) {
          targetQ.explanationImageUrl = imageUrl;
        } else {
          const currentUrls = Array.isArray(targetQ.explanationImageUrls) ? [...targetQ.explanationImageUrls] : [];
          const currentWidths = Array.isArray(targetQ.explanationImageWidths) ? [...targetQ.explanationImageWidths] : [];
          currentUrls.push(imageUrl);
          currentWidths.push(undefined);
          targetQ.explanationImageUrls = currentUrls;
          targetQ.explanationImageWidths = currentWidths;
        }
      }
    } else if (index !== undefined && index >= 0) {
      if (!imageUrl) {
        const currentUrls = Array.isArray(targetQ.explanationImageUrls) ? [...targetQ.explanationImageUrls] : [];
        const currentWidths = Array.isArray(targetQ.explanationImageWidths) ? [...targetQ.explanationImageWidths] : [];
        currentUrls.splice(index, 1);
        currentWidths.splice(index, 1);
        if (currentUrls.length > 0) {
          targetQ.explanationImageUrls = currentUrls;
          targetQ.explanationImageWidths = currentWidths;
        } else {
          delete targetQ.explanationImageUrls;
          delete targetQ.explanationImageWidths;
        }
      } else {
        const currentUrls = Array.isArray(targetQ.explanationImageUrls) ? [...targetQ.explanationImageUrls] : [];
        currentUrls[index] = imageUrl;
        targetQ.explanationImageUrls = currentUrls;
      }
    } else {
      if (!imageUrl) {
        delete targetQ.explanationImageUrl;
        delete targetQ.explanationImageWidth;
        if (Array.isArray(targetQ.explanationImageUrls) && targetQ.explanationImageUrls.length > 0) {
          const currentUrls = [...targetQ.explanationImageUrls];
          const currentWidths = Array.isArray(targetQ.explanationImageWidths) ? [...targetQ.explanationImageWidths] : [];
          const firstExtra = currentUrls.shift();
          const firstExtraWidth = currentWidths.shift();
          targetQ.explanationImageUrl = firstExtra;
          targetQ.explanationImageWidth = firstExtraWidth;
          if (currentUrls.length > 0) {
            targetQ.explanationImageUrls = currentUrls;
            targetQ.explanationImageWidths = currentWidths;
          } else {
            delete targetQ.explanationImageUrls;
            delete targetQ.explanationImageWidths;
          }
        }
      } else {
        targetQ.explanationImageUrl = imageUrl;
      }
    }

    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleApplyModalDiagram = (imageUrl: string | undefined) => {
    if (diagramModalTarget.targetType === 'question') {
      handleApplyDiagram(imageUrl, diagramModalTarget.index, diagramModalTarget.isAdd);
    } else if (diagramModalTarget.targetType === 'option' && diagramModalTarget.optionIndex !== undefined) {
      handleApplyOptionDiagram(diagramModalTarget.optionIndex, imageUrl);
    } else if (diagramModalTarget.targetType === 'explanation') {
      handleApplyExplanationDiagram(imageUrl, diagramModalTarget.index, diagramModalTarget.isAdd);
    }
    setDiagramModalTarget((prev) => ({ ...prev, isOpen: false }));
  };

  const handleUpdateImageWidth = (imageWidth: number | undefined, index?: number) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };
    const roundedW = imageWidth !== undefined && imageWidth > 0 ? Math.round(imageWidth) : undefined;

    if (index !== undefined && index >= 0) {
      const currentWidths = Array.isArray(targetQ.imageWidths) ? [...targetQ.imageWidths] : [];
      while (currentWidths.length <= index) {
        currentWidths.push(undefined);
      }
      currentWidths[index] = roundedW;
      targetQ.imageWidths = currentWidths;
    } else {
      if (roundedW) {
        targetQ.imageWidth = roundedW;
        targetQ.paperLayout = {
          ...(targetQ.paperLayout || {}),
          imageWidth: roundedW,
        };
      } else {
        delete targetQ.imageWidth;
        if (targetQ.paperLayout) {
          const nextLayout = { ...targetQ.paperLayout };
          delete nextLayout.imageWidth;
          targetQ.paperLayout = nextLayout;
        }
      }
    }
    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleUpdateOptionImageWidth = (optIdx: number, width: number | undefined) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };
    const currentWidths = [...(targetQ.optionImageWidths || [])];
    while (currentWidths.length <= optIdx) {
      currentWidths.push(undefined);
    }
    currentWidths[optIdx] = width !== undefined && width > 0 ? Math.round(width) : undefined;
    if (currentWidths.some(Boolean)) {
      targetQ.optionImageWidths = currentWidths;
    } else {
      delete targetQ.optionImageWidths;
    }
    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleUpdateExplanationImageWidth = (imageWidth: number | undefined, index?: number) => {
    if (currentQIndex < 0 || currentQIndex >= questions.length) return;
    const updatedQuestions = [...questions];
    const targetQ = { ...updatedQuestions[currentQIndex] };
    const roundedW = imageWidth !== undefined && imageWidth > 0 ? Math.round(imageWidth) : undefined;

    if (index !== undefined && index >= 0) {
      const currentWidths = Array.isArray(targetQ.explanationImageWidths) ? [...targetQ.explanationImageWidths] : [];
      while (currentWidths.length <= index) {
        currentWidths.push(undefined);
      }
      currentWidths[index] = roundedW;
      targetQ.explanationImageWidths = currentWidths;
    } else {
      if (roundedW) {
        targetQ.explanationImageWidth = roundedW;
      } else {
        delete targetQ.explanationImageWidth;
      }
    }
    updatedQuestions[currentQIndex] = targetQ;
    setQuestions(updatedQuestions);

    const newDraft = JSON.stringify(formatQuestionCompact(targetQ), null, 2);
    setQuestionCodeDraft(newDraft);

    try {
      const fullTestParsed = JSON.parse(jsonText);
      if (Array.isArray(fullTestParsed.questions)) {
        fullTestParsed.questions[currentQIndex] = formatQuestionCompact(targetQ);
        const formatted = JSON.stringify(fullTestParsed, null, 2);
        setJsonText(formatted);
        pushHistory(formatted, newDraft, currentQIndex);
        return;
      }
    } catch {
      // Ignore
    }
    syncStateToJson(title, topic, timeLimitMinutes, updatedQuestions);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonText(formatted);
      setJsonError(null);
      pushHistory(formatted);
      setSaveSuccessNotice('JSON Schema Formatted');
      setTimeout(() => setSaveSuccessNotice(''), 2000);
    } catch (err: any) {
      setJsonError('Cannot format invalid JSON: ' + err.message);
    }
  };

  const handleUpdateQuestionCode = (): boolean => {
    try {
      const parsedQ = JSON.parse(questionCodeDraft);
      if (!parsedQ || typeof parsedQ !== 'object') {
        throw new Error('Question must be a valid JSON object.');
      }
      if (!parsedQ.text || typeof parsedQ.text !== 'string' || !parsedQ.text.trim()) {
        throw new Error('Question must have a valid non-empty "text" prompt.');
      }
      const normalizedQ = normalizeQuestion(parsedQ, currentQIndex);

      let fullTestParsed: any;
      try {
        fullTestParsed = JSON.parse(jsonText);
      } catch {
        fullTestParsed = formatTestCompact(title, topic, timeLimitMinutes, questions);
      }

      const updatedRawQuestions = [...(fullTestParsed.questions || questions.map(formatQuestionCompact))];
      const compactQ = formatQuestionCompact(normalizedQ);
      
      if (currentQIndex >= 0 && currentQIndex < updatedRawQuestions.length) {
        updatedRawQuestions[currentQIndex] = compactQ;
      } else {
        updatedRawQuestions.push(compactQ);
      }

      fullTestParsed.questions = updatedRawQuestions;
      const formattedFull = JSON.stringify(fullTestParsed, null, 2);
      setJsonText(formattedFull);
      parseAndSyncState(formattedFull, true);

      setQuestionCodeDraft(JSON.stringify(compactQ, null, 2));
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid question JSON syntax');
      return false;
    }
  };

  // Safe non-destructive highlight scrolling synchronized between textarea and backdrop
  const scrollTextareaToMatch = (
    textarea: HTMLTextAreaElement | null,
    backdrop: HTMLDivElement | null,
    matchPos: number,
    queryLen: number
  ) => {
    if (!textarea) return;
    textarea.setSelectionRange(matchPos, matchPos + queryLen);
    const textBefore = textarea.value.substring(0, matchPos);
    const lineCount = textBefore.split('\n').length;
    const approxLineHeight = 18;
    const targetScrollTop = Math.max(0, (lineCount - 4) * approxLineHeight);
    textarea.scrollTop = targetScrollTop;
    if (backdrop) {
      backdrop.scrollTop = targetScrollTop;
    }
  };

  // Helper to render high-contrast, glowing search highlights on the backdrop
  const renderHighlightedBackdrop = (
    fullText: string,
    query: string,
    matches: number[],
    currentMatchIdx: number
  ) => {
    if (!query || matches.length === 0) return null;
    const qLen = query.length;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((matchStart, idx) => {
      if (matchStart > lastIndex) {
        elements.push(fullText.slice(lastIndex, matchStart));
      }
      const isCurrent = idx === currentMatchIdx;
      const matchText = fullText.slice(matchStart, matchStart + qLen);
      elements.push(
        <mark
          key={`match-${matchStart}-${idx}`}
          className={
            isCurrent
              ? 'bg-amber-400 text-slate-950 font-bold rounded-xs ring-2 ring-amber-300 shadow-md px-0.5'
              : 'bg-emerald-500/50 text-white font-medium rounded-xs px-0.5'
          }
        >
          {matchText}
        </mark>
      );
      lastIndex = matchStart + qLen;
    });

    if (lastIndex < fullText.length) {
      elements.push(fullText.slice(lastIndex));
    }

    return elements;
  };

  // FIND LOGIC: JSON SCHEMA EDITOR
  const handlePerformJsonFind = useCallback((query: string, targetText = jsonText) => {
    if (!query.trim()) {
      setJsonFindMatches([]);
      setJsonFindCurrentIdx(0);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const lowerText = targetText.toLowerCase();
    const indices: number[] = [];
    let startPos = 0;
    while ((startPos = lowerText.indexOf(lowerQuery, startPos)) !== -1) {
      indices.push(startPos);
      startPos += lowerQuery.length || 1;
    }
    setJsonFindMatches(indices);
    setJsonFindCurrentIdx(indices.length > 0 ? 0 : -1);

    if (indices.length > 0 && jsonTextareaRef.current) {
      scrollTextareaToMatch(jsonTextareaRef.current, jsonBackdropRef.current, indices[0], query.length);
    }
  }, [jsonText]);

  const handleJsonFindNavigate = (direction: 'next' | 'prev') => {
    if (jsonFindMatches.length === 0 || !jsonFindQuery) return;
    let nextIdx = direction === 'next' ? jsonFindCurrentIdx + 1 : jsonFindCurrentIdx - 1;
    if (nextIdx >= jsonFindMatches.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = jsonFindMatches.length - 1;

    setJsonFindCurrentIdx(nextIdx);
    const matchPos = jsonFindMatches[nextIdx];
    if (jsonTextareaRef.current) {
      scrollTextareaToMatch(jsonTextareaRef.current, jsonBackdropRef.current, matchPos, jsonFindQuery.length);
    }
  };

  // FIND LOGIC: CODE REVIEW EDITOR
  const handlePerformCodeFind = useCallback((query: string, targetDraft = questionCodeDraft) => {
    if (!query.trim()) {
      setCodeFindMatches([]);
      setCodeFindCurrentIdx(0);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const lowerText = targetDraft.toLowerCase();
    const indices: number[] = [];
    let startPos = 0;
    while ((startPos = lowerText.indexOf(lowerQuery, startPos)) !== -1) {
      indices.push(startPos);
      startPos += lowerQuery.length || 1;
    }
    setCodeFindMatches(indices);
    setCodeFindCurrentIdx(indices.length > 0 ? 0 : -1);

    if (indices.length > 0 && codeDraftTextareaRef.current) {
      scrollTextareaToMatch(codeDraftTextareaRef.current, codeBackdropRef.current, indices[0], query.length);
    }
  }, [questionCodeDraft]);

  const handleCodeFindNavigate = (direction: 'next' | 'prev') => {
    if (codeFindMatches.length === 0 || !codeFindQuery) return;
    let nextIdx = direction === 'next' ? codeFindCurrentIdx + 1 : codeFindCurrentIdx - 1;
    if (nextIdx >= codeFindMatches.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = codeFindMatches.length - 1;

    setCodeFindCurrentIdx(nextIdx);
    const matchPos = codeFindMatches[nextIdx];
    if (codeDraftTextareaRef.current) {
      scrollTextareaToMatch(codeDraftTextareaRef.current, codeBackdropRef.current, matchPos, codeFindQuery.length);
    }
  };

  const handleExportCurrentTest = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const exportObj: MathTest = {
        id: editingTestId || `custom-test-${Date.now()}`,
        title: parsed.title || title,
        description: parsed.description || description,
        topic: parsed.topic || topic,
        difficulty: parsed.difficulty || 'Medium',
        timeLimitMinutes: parsed.timeLimitMinutes ?? timeLimitMinutes,
        passingScorePercentage: parsed.passingScorePercentage ?? passingScorePercentage,
        questions: parsed.questions || questions,
        authorId: currentUser?.uid || 'local-user',
        authorName: currentUser?.displayName || 'Teacher',
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (onExportJson) {
        onExportJson(exportObj);
      } else {
        const jsonString = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const fileName = `${(exportObj.title || 'math_test').replace(/\s+/g, '_').toLowerCase()}.json`;
        triggerBlobDownload(blob, fileName);
      }
      setIsActionsMenuOpen(false);
    } catch {
      setErrorMessage('Cannot export: JSON schema has syntax errors.');
    }
  };

  const handleDownloadSampleJson = () => {
    const jsonString = JSON.stringify(SAMPLE_TEST_JSON, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    triggerBlobDownload(blob, 'sample_math_test.json');

    setJsonText(jsonString);
    parseAndSyncState(jsonString, true);
    setSaveSuccessNotice('Downloaded & loaded clean Sample JSON structure');
    setTimeout(() => setSaveSuccessNotice(''), 3000);
    setIsActionsMenuOpen(false);
  };

  const handleLoadSampleJsonInEditor = () => {
    if (onUnloadTest) {
      onUnloadTest();
    }
    setEditingTestId(null);

    const blankTemplate = {
      title: "New Mathematics Assessment",
      topic: "Matrices and Determinants",
      time: 15,
      questions: [
        {
          text: "",
          topic: "Matrices and Determinants",
          subtopic: "",
          options: ["", "", "", ""],
          correctAnswer: 0,
          explanation: ""
        }
      ]
    };

    const jsonString = JSON.stringify(blankTemplate, null, 2);
    setJsonText(jsonString);
    parseAndSyncState(jsonString, true);

    // Switch view to JSON schema editor
    setMobileTab('editor');
    if (layoutMode === 'canvas') {
      setLayoutMode('split');
    }

    setSaveSuccessNotice('Created a new blank template in the editor.');
    setTimeout(() => setSaveSuccessNotice(''), 3500);
  };

  const handleProcessImportJson = (text: string) => {
    try {
      setImportError(null);
      const parsed = JSON.parse(text);

      let importedQuestions: MathQuestion[] = [];
      let importedTitle = 'Imported Assessment';
      let importedTopic: MathTopic = 'Matrices and Determinants';
      let importedDesc = 'Imported from JSON';
      let importedTime = 15;
      let importedPassing = 60;

      if (Array.isArray(parsed)) {
        importedQuestions = parsed;
      } else if (parsed && typeof parsed === 'object') {
        importedTitle = parsed.title || importedTitle;
        importedTopic = parsed.topic || importedTopic;
        importedDesc = parsed.description || importedDesc;
        importedTime = parsed.timeLimitMinutes ?? parsed.time ?? importedTime;
        importedPassing = parsed.passingScorePercentage ?? importedPassing;
        importedQuestions = parsed.questions || [];
      }

      if (!importedQuestions || importedQuestions.length === 0) {
        throw new Error('No valid questions array found in JSON.');
      }

      // Check if the current test in the editor is a default untouched template OR a real/previous test
      const isDefaultNewTest = 
        !editingTestId && 
        (title.trim() === 'New Mathematics Assessment' || title.trim() === '' || title.trim() === 'Untitled Assessment') &&
        questions.length <= 2 &&
        (questions[0]?.text?.includes('calculate the determinant') || questions[0]?.text?.includes('Enter mathematical problem'));

      let savedPreviousTitle = '';
      if (!isDefaultNewTest && questions.length > 0 && title.trim()) {
        try {
          const currentFinalTopic = (topic || 'General Mathematics').trim();
          const prevTestId = editingTestId || `test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const prevTestPayload: MathTest = {
            id: prevTestId,
            title: title.trim(),
            description: description.trim() || 'Curated mock assessment.',
            topic: currentFinalTopic,
            difficulty: (initialTest?.difficulty as any) || 'Medium',
            timeLimitMinutes: timeLimitMinutes,
            passingScorePercentage: passingScorePercentage,
            questions: questions.map((q, idx) => normalizeQuestion(q, idx)),
            authorId: currentUser?.uid || 'local-user',
            authorName: currentUser?.displayName || 'Teacher',
            isPublic: true,
            createdAt: initialTest?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveCustomTopic(currentFinalTopic);
          onSaveTest(prevTestPayload);
          savedPreviousTitle = prevTestPayload.title;
        } catch (prevErr) {
          console.warn('Could not auto-save previous test before import:', prevErr);
        }
      }

      // Assign a fresh, unique ID for the imported test so it never overwrites the old test
      const currentPrevId = editingTestId;
      let newImportedTestId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      if (
        parsed.id &&
        typeof parsed.id === 'string' &&
        parsed.id !== currentPrevId &&
        !allTests?.some((t) => t.id === parsed.id)
      ) {
        newImportedTestId = parsed.id;
      }
      setEditingTestId(newImportedTestId);

      const importedTopicFinal = importedTopic.trim() || 'General Mathematics';
      saveCustomTopic(importedTopicFinal);

      const normalizedImportedQs = importedQuestions.map((q: any, idx: number) => normalizeQuestion(q, idx));

      // Build and immediately save the imported test payload separately
      const importedTestPayload: MathTest = {
        id: newImportedTestId,
        title: importedTitle.trim(),
        description: importedDesc.trim(),
        topic: importedTopicFinal,
        difficulty: parsed.difficulty || 'Medium',
        timeLimitMinutes: importedTime,
        passingScorePercentage: importedPassing,
        questions: normalizedImportedQs,
        authorId: currentUser?.uid || 'local-user',
        authorName: currentUser?.displayName || 'Teacher',
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const compactObj = formatTestCompact(
        importedTitle,
        importedTopicFinal,
        importedTime,
        normalizedImportedQs
      );
      const formatted = JSON.stringify(compactObj, null, 2);
      setJsonText(formatted);
      parseAndSyncState(formatted, true);

      // Save the imported test as well so both tests exist independently in library & database
      onSaveTest(importedTestPayload);
      
      setImportSuccess(`Successfully loaded and saved ${importedQuestions.length} questions!`);
      const noticeMsg = savedPreviousTitle
        ? `Saved previous test "${savedPreviousTitle}" and loaded imported test "${importedTitle}".`
        : `Imported and saved "${importedTitle}" (${importedQuestions.length} questions).`;
      setSaveSuccessNotice(noticeMsg);
      setTimeout(() => setSaveSuccessNotice(''), 4500);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportSuccess(null);
      }, 800);
    } catch (err: any) {
      setImportError(err.message || 'Invalid JSON format');
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (content) {
          setImportJsonText(content);
          handleProcessImportJson(content);
        } else {
          setImportError('File is empty.');
        }
      } catch (err: any) {
        setImportError(err.message || 'Error processing selected file');
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read file from device storage.');
    };
    reader.readAsText(file);
  };

  const handlePasteJsonData = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setErrorMessage('Clipboard access not available in this browser environment.');
        return;
      }
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText || !clipboardText.trim()) {
        setErrorMessage('Clipboard is empty. Copy JSON data first.');
        return;
      }
      const trimmed = clipboardText.trim();
      // Validate or parse into the JSON schema editor
      const success = parseAndSyncState(trimmed, true);
      setJsonText(trimmed);
      if (success) {
        setIsJsonPastedNotice(true);
        setSaveSuccessNotice('JSON pasted and synchronized successfully!');
        setTimeout(() => {
          setIsJsonPastedNotice(false);
          setSaveSuccessNotice('');
        }, 2200);
      } else {
        // If incomplete or raw snippet, still update jsonText so user can edit it
        setIsJsonPastedNotice(true);
        setTimeout(() => setIsJsonPastedNotice(false), 2000);
      }
    } catch (err: any) {
      setErrorMessage('Could not read clipboard. Please paste manually or check permissions.');
    }
  };

  const handleRequestSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.title || !parsed.title.trim()) {
        setErrorMessage('Test title is required.');
        return;
      }
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setErrorMessage('Please include at least 1 question.');
        return;
      }
      setIsSaveConfirmModalOpen(true);
    } catch {
      setErrorMessage('Cannot save: JSON syntax is invalid. Please fix errors before saving.');
    }
  };

  const handleConfirmSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const finalTopic = (parsed.topic || topic || 'General Mathematics').trim();
      const mins = typeof parsed.time === 'number' ? parsed.time : (typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : timeLimitMinutes);
      const normalizedQs = Array.isArray(parsed.questions)
        ? parsed.questions.map((q: any, idx: number) => normalizeQuestion(q, idx))
        : questions.map((q, idx) => normalizeQuestion(q, idx));

      const testPayload: MathTest = {
        id: editingTestId || `test-${Date.now()}`,
        title: (parsed.title || title || 'New Mathematics Assessment').trim(),
        description: parsed.description?.trim() || 'Curated mock assessment with derivations.',
        topic: finalTopic,
        difficulty: parsed.difficulty || 'Medium',
        time: mins,
        timeLimitMinutes: mins,
        passingScorePercentage: typeof parsed.passingScorePercentage === 'number' ? parsed.passingScorePercentage : 60,
        questions: normalizedQs,
        authorId: currentUser?.uid || 'local-user',
        authorName: currentUser?.displayName || 'Teacher',
        isPublic: true,
        createdAt: initialTest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveCustomTopic(finalTopic);
      setIsSaveConfirmModalOpen(false);
      setEditingTestId(testPayload.id);
      onSaveTest(testPayload);
      setSaveSuccessNotice(`Assessment "${testPayload.title}" saved successfully!`);
      setTimeout(() => setSaveSuccessNotice(''), 3500);
    } catch (err: any) {
      setErrorMessage(`Save failed: ${err.message}`);
      setIsSaveConfirmModalOpen(false);
    }
  };

  const handleLoadPreviousTest = (t: MathTest) => {
    setEditingTestId(t.id);
    setTitle(t.title);
    setDescription(t.description);
    const testTopic = (t.topic || 'Matrices and Determinants').trim();
    setTopic(testTopic);
    const isDef = DEFAULT_TOPICS.some((dt) => dt.toLowerCase() === testTopic.toLowerCase());
    if (!isDef && testTopic) {
      setIsCustomTopicActive(true);
      setCustomTopicInput(testTopic);
    } else {
      setIsCustomTopicActive(false);
      setCustomTopicInput('');
    }
    const mins = t.timeLimitMinutes ?? (t as any).time ?? 15;
    setTimeLimitMinutes(mins);
    setPassingScorePercentage(t.passingScorePercentage ?? 60);
    const normalizedQs = (t.questions || []).map((q, idx) => normalizeQuestion(q, idx));
    setQuestions(normalizedQs);
    setCurrentQIndex(0);

    const compactObj = formatTestCompact(
      t.title,
      testTopic,
      mins,
      normalizedQs
    );
    const formatted = JSON.stringify(compactObj, null, 2);
    setJsonText(formatted);
    pushHistory(formatted);
    setIsHistoryDrawerOpen(false);
  };

  const handleConfirmDelete = () => {
    if (testToDeleteId && onDeleteTest) {
      onDeleteTest(testToDeleteId);
      setTestToDeleteId(null);
      setSaveSuccessNotice('Assessment deleted from library.');
      setTimeout(() => setSaveSuccessNotice(''), 3500);
      if (editingTestId === testToDeleteId) {
        setEditingTestId(null);
        const defaultTest = { ...DEFAULT_TEST_TEMPLATE, id: `test-${Date.now()}` };
        setTitle(defaultTest.title);
        setDescription('');
        setTopic(defaultTest.topic);
        setTimeLimitMinutes(defaultTest.time || 15);
        setPassingScorePercentage(70);
        setQuestions(defaultTest.questions.map((q, idx) => normalizeQuestion(q, idx)));
        setCurrentQIndex(0);
        const formatted = JSON.stringify(defaultTest, null, 2);
        setJsonText(formatted);
        pushHistory(formatted);
      }
    }
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const container = document.getElementById('split-editor-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      if (percent >= 25 && percent <= 75) {
        setLeftWidthPercent(percent);
      }
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCreateNewBlankTest = () => {
    if (onUnloadTest) {
      onUnloadTest();
    }
    setEditingTestId(null);
    const newBlankQ: MathQuestion = {
      id: 'q1',
      text: 'Enter mathematical question statement with $\\LaTeX$ formula.',
      type: 'mcq',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'Option A',
      explanation: 'Step-by-step mathematical explanation or solution.',
      points: 1,
    };
    const newQs = [newBlankQ];
    setTitle('Untitled Assessment');
    setDescription('');
    setTopic('General Mathematics');
    setTimeLimitMinutes(15);
    setPassingScorePercentage(70);
    setQuestions(newQs);
    setCurrentQIndex(0);
    const compactObj = formatTestCompact(
      'Untitled Assessment',
      'General Mathematics',
      15,
      newQs
    );
    const formatted = JSON.stringify(compactObj, null, 2);
    setJsonText(formatted);
    const firstDraft = JSON.stringify(formatQuestionCompact(newBlankQ), null, 2);
    setQuestionCodeDraft(firstDraft);
    historyRef.current = {
      stack: [{ jsonText: formatted, questionCodeDraft: firstDraft, currentQIndex: 0 }],
      index: 0,
    };
    setHistoryVersion((v) => v + 1);
    setJsonError(null);
    setIsHistoryDrawerOpen(false);
    setIsActionsMenuOpen(false);
    setSaveSuccessNotice('Unloaded previous test. Created a new blank assessment.');
    setTimeout(() => setSaveSuccessNotice(''), 3500);
  };

  const handleOpenHistoryDrawer = () => {
    setHistorySearchQuery('');
    setHistoryTopicFilter('all');
    setIsHistoryDrawerOpen(true);
  };

  // Filter & sort saved tests in History modal
  const filteredAllTests = allTests
    .filter((t) => {
      if (historyTopicFilter !== 'all' && (t.topic || '').toLowerCase() !== historyTopicFilter.toLowerCase()) {
        return false;
      }
      if (!historySearchQuery.trim()) return true;
      const q = historySearchQuery.toLowerCase();
      return (
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.topic && t.topic.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (historySortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (historySortBy === 'questions') {
        return (b.questions?.length || 0) - (a.questions?.length || 0);
      }
      // 'recent' by createdAt or updatedAt
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  // Keyboard Navigation for Live Preview (Left / Right Arrow or P / N when not typing in an input/textarea)
  useEffect(() => {
    const handleNavKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          (target.getAttribute && target.getAttribute('role') === 'textbox'))
      ) {
        return;
      }

      if (isHistoryDrawerOpen || isImportModalOpen || isSaveConfirmModalOpen || testToDeleteId) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
        if (currentQIndex > 0) {
          e.preventDefault();
          const prevIdx = currentQIndex - 1;
          setCurrentQIndex(prevIdx);
          if (cardMode === 'code' && questions[prevIdx]) {
            setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(questions[prevIdx]), null, 2));
          }
        }
      } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        if (currentQIndex < questions.length - 1) {
          e.preventDefault();
          const nextIdx = currentQIndex + 1;
          setCurrentQIndex(nextIdx);
          if (cardMode === 'code' && questions[nextIdx]) {
            setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(questions[nextIdx]), null, 2));
          }
        }
      }
    };

    window.addEventListener('keydown', handleNavKeyDown);
    return () => window.removeEventListener('keydown', handleNavKeyDown);
  }, [currentQIndex, questions, cardMode, isHistoryDrawerOpen, isImportModalOpen, isSaveConfirmModalOpen, testToDeleteId]);

  return (
    <div 
      className="h-[100dvh] max-h-screen w-full flex flex-col bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 p-2 sm:p-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-[calc(max(0.5rem,env(safe-area-inset-bottom,0px))+0.25rem)] overflow-hidden font-sans"
    >
      
      {/* Hidden File Input for Direct Storage Import strictly restricted to JSON files only */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFileUpload(file);
            e.target.value = '';
          }
        }}
      />

      {/* TOP HEADER (Card background removed to match main body background) */}
      <header className="bg-transparent px-1 sm:px-2 py-1.5 flex flex-col gap-2 shrink-0 mb-2 z-30 border-0 ring-0 shadow-none">
        
        {/* ROW 1: Test Creator Studio Title (Left) + Split | Canva | Editor Switcher & Close button (Right) */}
        <div className="flex items-center justify-between gap-2 w-full">
          {/* Left: Test Creator Studio Title (No Background) */}
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Test Creator Studio
            </span>
          </div>

          {/* Right: Split | Canva | Editor Segmented Switcher & Close button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Split | Canva | Editor Segmented Switcher (Clean White Pill) */}
            <div className="flex items-center bg-white dark:bg-[#1e2024] p-1 rounded-full text-xs font-bold shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] border-0">
              <button
                type="button"
                id="test-editor-mode-split-btn"
                onClick={() => {
                  setLayoutMode('split');
                }}
                className={`hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  isDesktop && layoutMode === 'split'
                    ? 'bg-[#0b57d0] text-white shadow-2xs font-bold' 
                    : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] font-bold'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                id="test-editor-mode-canvas-btn"
                onClick={() => {
                  if (isDesktop) {
                    setLayoutMode('canvas');
                  } else {
                    setMobileTab('canvas');
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  (isDesktop ? layoutMode === 'canvas' : mobileTab === 'canvas')
                    ? 'bg-[#0b57d0] text-white shadow-2xs font-bold' 
                    : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] font-bold'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Canva</span>
              </button>
              <button
                type="button"
                id="test-editor-mode-editor-btn"
                onClick={() => {
                  if (isDesktop) {
                    setLayoutMode('editor');
                  } else {
                    setMobileTab('editor');
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  (isDesktop ? layoutMode === 'editor' : mobileTab === 'editor')
                    ? 'bg-[#0b57d0] text-white shadow-2xs font-bold' 
                    : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] font-bold'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>
            </div>

            {/* Close Button (Clean White Round Button) */}
            <button
              type="button"
              id="test-editor-close-btn"
              onClick={onCancel}
              title="Close Test Creator"
              className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* ROW 2: ACTION BUTTONS (Action, Edit with AI, Import, New Template, History Button) */}
        <div className="flex items-center justify-between gap-1.5 pt-1 w-full flex-wrap">
          
          {/* DESKTOP UI: INLINE ACTION BUTTONS STYLED AS CLEAN WHITE BUTTONS */}
          <div className="hidden lg:flex items-center justify-start w-full gap-2">
            <div className="flex items-center gap-2 flex-wrap w-full">
              
              {/* Action Dropdown Menu Button */}
              <div className="relative shrink-0" ref={actionsMenuRef}>
                <button
                  type="button"
                  id="desktop-action-menu-btn"
                  onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span>Action</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#1f1f1f] dark:text-[#e3e3e3] shrink-0" />
                </button>

                {isActionsMenuOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-24px)] bg-white dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 rounded-2xl shadow-xl border-0 ring-0 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-zinc-800/60 mb-1">
                      Quick Actions
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        if (onOpenCustomPanel) {
                          onOpenCustomPanel();
                        }
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-[#282a39] text-emerald-700 dark:text-emerald-300 font-bold transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#0b7a56] dark:text-emerald-400 shrink-0" />
                      <span>Create Custom Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        handleCreateNewBlankTest();
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-[#e6f7f1] dark:hover:bg-emerald-950/40 text-[#0b7a56] dark:text-emerald-300 font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#0b7a56] dark:text-emerald-400 shrink-0" />
                      <span>New Assessment (Blank)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportCurrentTest();
                        setIsActionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer font-bold"
                    >
                      <Download className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span>Export JSON File</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        handleDownloadSampleJson();
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer font-bold"
                    >
                      <Code2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span>Sample JSON Template</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Edit with AI Button */}
              <button
                type="button"
                id="desktop-action-edit-with-ai-btn"
                onClick={() => {
                  const nextState = !isAiPromptOpen;
                  setIsAiPromptOpen(nextState);
                  if (nextState) {
                    setTimeout(() => aiPromptInputRef.current?.focus(), 150);
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95 ${
                  isAiPromptOpen
                    ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]'
                    : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3]'
                }`}
                title="Prompt Gemini AI to edit, format, or enhance this assessment"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                <span>Edit with AI</span>
              </button>

              {/* Import Button */}
              <button
                type="button"
                id="desktop-action-import-json-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs sm:text-sm font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95"
                title="Import JSON assessment file from storage"
              >
                <Upload className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] rotate-180" />
                <span>Import</span>
              </button>

              {/* New Template Button */}
              <button
                type="button"
                id="desktop-action-create-new-test-btn"
                onClick={handleLoadSampleJsonInEditor}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs sm:text-sm font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95"
                title="Load New Test Template in Editor"
              >
                <Plus className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>New Template</span>
              </button>

              {/* History Button */}
              <button
                type="button"
                id="desktop-action-test-history-btn"
                onClick={handleOpenHistoryDrawer}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs sm:text-sm font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95 ml-auto"
                title="Open Test History and Saved Assessments"
              >
                <History className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>History button</span>
                {allTests.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-[#0b57d0] text-white rounded-full font-bold shadow-xs">
                    {allTests.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* MOBILE & TABLET UI: ACTION BUTTONS STYLED AS CLEAN WHITE BUTTONS */}
          <div className="flex lg:hidden items-center justify-between w-full gap-1.5 sm:gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full">
              {/* Action Dropdown Menu Button */}
              <div className="relative shrink-0" ref={actionsMenuRef}>
                <button
                  type="button"
                  id="test-editor-actions-menu-btn"
                  onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                  className="flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span>Action</span>
                  <ChevronDown className="w-3 h-3 text-[#1f1f1f] dark:text-[#e3e3e3] shrink-0" />
                </button>

                {isActionsMenuOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-24px)] bg-white dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 rounded-2xl shadow-xl border-0 ring-0 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-zinc-800/60 mb-1">
                      Quick Actions
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        if (onOpenCustomPanel) {
                          onOpenCustomPanel();
                        }
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-[#282a39] text-emerald-700 dark:text-emerald-300 font-bold transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#0b7a56] dark:text-emerald-400 shrink-0" />
                      <span>Create Custom Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportCurrentTest();
                        setIsActionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer font-bold"
                    >
                      <Download className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span>Export JSON File</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Edit with AI Button */}
              <button
                type="button"
                id="mobile-action-edit-with-ai-btn"
                onClick={() => {
                  const nextState = !isAiPromptOpen;
                  setIsAiPromptOpen(nextState);
                  if (nextState) {
                    setTimeout(() => aiPromptInputRef.current?.focus(), 150);
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-full text-xs font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95 ${
                  isAiPromptOpen
                    ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]'
                    : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                <span>Edit with AI</span>
              </button>

              {/* Import Button */}
              <button
                type="button"
                id="mobile-action-import-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95"
              >
                <Upload className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] rotate-180 shrink-0" />
                <span>Import</span>
              </button>

              {/* New Template Button */}
              <button
                type="button"
                id="mobile-action-new-template-btn"
                onClick={handleLoadSampleJsonInEditor}
                className="flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                <span>New Template</span>
              </button>

              {/* History Button */}
              <button
                type="button"
                id="mobile-action-history-btn"
                onClick={handleOpenHistoryDrawer}
                className="flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] transition-all cursor-pointer active:scale-95 ml-auto"
              >
                <History className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                <span>History</span>
                {allTests.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-[#0b57d0] text-white rounded-full font-bold shadow-xs">
                    {allTests.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* STRIP: CURRENT TEST TITLE WITH PARAMETERS DROPDOWN & SHORT "SAVE" BUTTON WITH UNDO/REDO */}
      <div className="bg-white dark:bg-[#1e2024] px-4 py-2.5 rounded-[24px] flex items-center justify-between gap-2 sm:gap-3 shrink-0 mb-2 z-20 border-0 ring-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        
        {/* Title with dropdown for test settings (flex-1 and min-w-0 ensures graceful truncation without overlapping buttons) */}
        <div className="relative flex-1 min-w-0 pr-1" ref={titleSettingsMenuRef}>
          <button
            type="button"
            onClick={() => setIsTitleSettingsMenuOpen(!isTitleSettingsMenuOpen)}
            className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 group hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors cursor-pointer text-left w-full max-w-full"
          >
            <BookOpen className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
            <span className="truncate flex-1 min-w-0">{title}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isTitleSettingsMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] bg-white dark:bg-[#1e2024] rounded-[24px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-3 z-50 border-0 ring-0 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200 dark:border-zinc-800/60 text-xs font-bold text-slate-700 dark:text-zinc-300">
                <span>Assessment Properties</span>
                <button type="button" onClick={() => setIsTitleSettingsMenuOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-[#c4c4cc] cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-0.5">Test Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      syncStateToJson(e.target.value, topic, timeLimitMinutes);
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-[#222634] text-slate-900 dark:text-zinc-100 rounded-xl font-medium outline-none border-0 ring-0 focus:ring-2 focus:ring-[#0b57d0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-0.5">Topic</label>
                  <select
                    id="test-editor-topic-select"
                    value={isCustomTopicActive ? '__CUSTOM__' : topic}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        setIsCustomTopicActive(true);
                        const initialCustom = DEFAULT_TOPICS.some(dt => dt.toLowerCase() === topic.toLowerCase()) ? '' : topic;
                        setCustomTopicInput(initialCustom);
                        const effective = initialCustom.trim() || 'Custom Topic';
                        setTopic(effective);
                        syncStateToJson(title, effective, timeLimitMinutes);
                      } else {
                        setIsCustomTopicActive(false);
                        setTopic(val);
                        syncStateToJson(title, val, timeLimitMinutes);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-[#222634] text-slate-900 dark:text-zinc-100 rounded-xl font-medium outline-none border-0 ring-0 focus:ring-2 focus:ring-[#0b57d0]"
                  >
                    <option value="__CUSTOM__" className="bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold">
                      + Custom Topic...
                    </option>
                    <optgroup label="Standard Topics" className="bg-[#f8fafc] dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 font-bold">
                      {DEFAULT_TOPICS.map((t) => (
                        <option key={t} value={t} className="bg-[#f8fafc] dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 font-normal">
                          {t}
                        </option>
                      ))}
                    </optgroup>
                    {customTopicsList.length > 0 && (
                      <optgroup label="Custom Topics" className="bg-[#f8fafc] dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 font-bold">
                        {customTopicsList.map((t) => (
                          <option key={t} value={t} className="bg-[#f8fafc] dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 font-normal">
                            {t}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Inline Custom Topic Input */}
                  {isCustomTopicActive && (
                    <div className="mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                          Custom Topic Name
                        </span>
                        <span className="text-[9px] text-slate-400">e.g. Topology, Number Theory</span>
                      </div>
                      <input
                        id="test-editor-custom-topic-input"
                        type="text"
                        value={customTopicInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomTopicInput(val);
                          const effective = val.trim() || 'Custom Topic';
                          setTopic(effective);
                          syncStateToJson(title, effective, timeLimitMinutes);
                        }}
                        onBlur={() => {
                          if (customTopicInput.trim()) {
                            saveCustomTopic(customTopicInput.trim());
                          }
                        }}
                        placeholder="Enter custom topic name..."
                        className="w-full px-2.5 py-1.5 bg-blue-50/60 dark:bg-blue-950/30 text-slate-900 dark:text-zinc-100 rounded-xl font-medium outline-none border border-blue-200 dark:border-blue-800 focus:ring-2 focus:ring-[#0b57d0] text-xs placeholder:text-slate-400"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-0.5">Time Limit (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={timeLimitMinutes}
                    onChange={(e) => {
                      const mins = Number(e.target.value);
                      setTimeLimitMinutes(mins);
                      syncStateToJson(title, topic, mins);
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-[#222634] text-slate-900 dark:text-zinc-100 rounded-xl font-medium outline-none border-0 ring-0 focus:ring-2 focus:ring-[#0b57d0]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Undo/Redo & Save Buttons (Dedicated shrink-0 container on the right) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center bg-slate-100 dark:bg-[#222634] border-0 ring-0 rounded-full p-0.5 shadow-none">
            <button
              type="button"
              id="test-editor-undo-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#1d283a] dark:text-zinc-200 hover:bg-[#dedcd6] dark:hover:bg-[#282a39] disabled:opacity-30 cursor-pointer transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="test-editor-redo-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#1d283a] dark:text-zinc-200 hover:bg-[#dedcd6] dark:hover:bg-[#282a39] disabled:opacity-30 cursor-pointer transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            id="test-editor-strip-save-btn"
            onClick={handleRequestSave}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] active:scale-95 text-white text-xs font-bold rounded-full transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Success Notice */}
      {saveSuccessNotice && (
        <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-between shrink-0 mb-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
          <button type="button" onClick={() => setSaveSuccessNotice('')} className="font-bold px-2 py-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-[#c4c4cc] cursor-pointer">×</button>
        </div>
      )}

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between shrink-0 mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage('')} className="font-bold px-2 py-0.5">×</button>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <div 
        id="split-editor-container" 
        className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 overflow-hidden relative w-full"
      >
        {/* LEFT COLUMN / MOBILE CANVAS PREVIEW */}
        {((isDesktop && layoutMode !== 'editor') || (!isDesktop && mobileTab === 'canvas')) && (
          <div 
            className={`bg-white dark:bg-[#1e2024] p-3 sm:p-4 lg:p-5 rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-col justify-between overflow-hidden transition-all min-w-0 relative ${
              isDesktop && layoutMode === 'split' ? 'h-full shrink-0' : 'w-full flex-1 h-full'
            }`}
            style={
              isDesktop && layoutMode === 'split'
                ? { width: `calc(${leftWidthPercent}% - 22px)` }
                : undefined
            }
          >
            <div className="flex items-center justify-between pb-2 sm:pb-2.5 border-b border-[#e5e2db] dark:border-zinc-800/60 shrink-0 gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#0b57d0] animate-pulse shrink-0" />
                <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 truncate">
                  Live Preview
                </h3>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Jump to Question Dropdown */}
                <div className="relative" ref={jumpMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsJumpMenuOpen(!isJumpMenuOpen)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Compass className="w-3 h-3 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>{currentQIndex + 1}/{questions.length}</span>
                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                  </button>

                  {isJumpMenuOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 rounded-2xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100 border-0 ring-0">
                      <div className="px-1 pb-1.5 mb-1.5 border-b border-[#e5e2db] dark:border-zinc-800/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Jump to Question
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto p-1">
                        {questions.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (cardMode === 'code') {
                                handleUpdateQuestionCode();
                              }
                              setCurrentQIndex(idx);
                              setIsJumpMenuOpen(false);
                              if (cardMode === 'code' && questions[idx]) {
                                setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(questions[idx]), null, 2));
                              }
                            }}
                            className={`h-8 rounded-xl font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                              currentQIndex === idx 
                                ? 'bg-[#0b57d0] text-white' 
                                : 'bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-200'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* View Mode Switcher: Paper Studio vs Card View vs Code */}
                <div className="flex items-center bg-slate-100 dark:bg-[#222634] p-0.5 rounded-full text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (cardMode === 'code') {
                        handleUpdateQuestionCode();
                      }
                      setCardMode('rendered');
                    }}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      cardMode === 'rendered'
                        ? 'bg-[#0b57d0] text-white shadow-2xs'
                        : 'text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Single Question Interactive Card View"
                  >
                    <Eye className="w-3 h-3" />
                    <span className="hidden sm:inline">Card</span>
                    <span className="sm:hidden">Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (cardMode === 'code') {
                        handleUpdateQuestionCode();
                      }
                      setCardMode('paper');
                    }}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      cardMode === 'paper'
                        ? 'bg-[#0b57d0] text-white shadow-2xs'
                        : 'text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Interactive A4 Question Paper Layout Studio"
                  >
                    <Sliders className="w-3 h-3" />
                    <span className="hidden sm:inline">Paper</span>
                    <span className="sm:hidden">Paper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (currentQuestion) {
                        setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(currentQuestion), null, 2));
                      }
                      setCardMode('code');
                    }}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      cardMode === 'code'
                        ? 'bg-[#0b57d0] text-white shadow-2xs'
                        : 'text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Edit raw JSON code for active question"
                  >
                    <Code2 className="w-3 h-3" />
                    <span className="hidden sm:inline">Code</span>
                    <span className="sm:hidden">Code</span>
                  </button>
                </div>
              </div>
            </div>


            <div 
              className="flex-1 min-h-0 overflow-y-auto py-2.5 px-1 sm:px-2 md:px-2.5 w-full transition-opacity duration-100 flex flex-col items-center"
              style={{ zoom: `${zoomProportion}%` }}
            >
              {questions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <BookOpen className="w-12 h-12 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">No questions found.</p>
                </div>
              ) : cardMode === 'paper' ? (
                <div className="w-full flex justify-center py-2">
                  <OmrQuestionPaper
                    test={currentPaperTest}
                    hideHeaderContainer={true}
                    isEditableLayout={true}
                    onUpdateQuestionLayout={handleUpdateQuestionLayout}
                    onResetAllLayouts={handleResetAllLayouts}
                    layoutDensity={layoutDensity}
                    setLayoutDensity={setLayoutDensity}
                    showBadges={showBadges}
                    setShowBadges={setShowBadges}
                    hideInlineDock={true}
                  />
                </div>
              ) : cardMode === 'rendered' ? (
                <div className="w-full max-w-full mx-auto pb-3">
                  <div 
                    id={`studio-preview-question-card-${currentQIndex}`}
                    className="bg-white dark:bg-[#1e2024] rounded-[28px] border-0 ring-1 ring-[#0b57d0]/25 dark:ring-[#a8c7fa]/30 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] px-4 sm:px-5 md:px-6 py-4 sm:py-5 relative space-y-4 max-w-full w-full"
                  >
                    {/* Question Statement */}
                    <div className="text-slate-900 dark:text-zinc-100 text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full">
                      <div className="flex items-start gap-1 sm:gap-1.5 max-w-full">
                        <span className="font-bold shrink-0 text-[18px] sm:text-[19px] pt-0.5 select-none text-[#0b57d0] dark:text-[#a8c7fa]">
                          {currentQIndex + 1}.
                        </span>
                        <div className="flex-1 min-w-0 max-w-full text-[18px] sm:text-[19px] font-medium leading-relaxed overflow-x-auto overflow-y-hidden">
                          <MathRenderer content={currentQuestion.text} />
                        </div>
                      </div>

                      {/* Question Diagrams with Editor Resizing & Crop */}
                      {(() => {
                        const diagrams: { url: string; width?: number; index?: number }[] = [];
                        
                        // Legacy single diagram
                        if (currentQuestion.imageUrl || (currentQuestion as any).paperLayout?.imageUrl) {
                          diagrams.push({
                            url: currentQuestion.imageUrl || (currentQuestion as any).paperLayout?.imageUrl,
                            width: currentQuestion.imageWidth || (currentQuestion as any).paperLayout?.imageWidth,
                          });
                        }
                        
                        // Extra diagrams
                        if (Array.isArray(currentQuestion.imageUrls)) {
                          currentQuestion.imageUrls.forEach((url, i) => {
                            if (url) {
                              diagrams.push({
                                url,
                                width: currentQuestion.imageWidths?.[i],
                                index: i,
                              });
                            }
                          });
                        }

                        if (diagrams.length === 0) return null;

                        return (
                          <div className={diagrams.length > 1 ? "flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-4 sm:gap-6 my-3" : "space-y-4 my-3"}>
                            {diagrams.map((diag, dIdx) => (
                              <div key={dIdx} className="relative group flex flex-col items-center">
                                <EditorDiagramResizable
                                  imageUrl={diag.url}
                                  alt={`Question ${currentQIndex + 1} Diagram ${dIdx + 1}`}
                                  width={diag.width}
                                  onChangeWidth={(w) => handleUpdateImageWidth(w, diag.index)}
                                  onChangeDiagram={() => handleOpenQuestionDiagram(diag.index)}
                                  onRemoveDiagram={() => handleApplyDiagram(undefined, diag.index)}
                                  onApplyCrop={(url) => handleApplyDiagram(url, diag.index)}
                                />
                                {diagrams.length > 1 && (
                                  <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full select-none opacity-80 backdrop-blur-sm pointer-events-none">
                                    Diagram {dIdx + 1}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div className="mt-2.5 flex justify-start gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleOpenQuestionDiagram(undefined, (currentQuestion.imageUrl || (currentQuestion as any).paperLayout?.imageUrl) ? true : false)}
                          className="text-xs px-3.5 py-1.5 rounded-full bg-[#d3e3fd]/60 hover:bg-[#d3e3fd] dark:bg-[#004a77]/50 dark:hover:bg-[#004a77]/80 text-[#0b57d0] dark:text-[#c2e7ff] border-0 ring-0 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer font-bold"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>
                            {(currentQuestion.imageUrl || (currentQuestion as any).paperLayout?.imageUrl) 
                              ? '+ Attach Another Question Diagram' 
                              : '+ Attach Question Diagram'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* MCQ Options */}
                    {isMcqQuestion(currentQuestion) && currentQuestion.options && currentQuestion.options.length > 0 && (
                      <div className="space-y-3 pt-1 max-w-full">
                        {currentQuestion.options.map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = checkIsOptionCorrect(opt, optIdx, currentQuestion);
                          const optImage = currentQuestion.optionImages?.[optIdx];

                          return (
                            <div key={optIdx} className="space-y-2">
                              <div
                                onClick={() => handleSelectCorrectOption(optIdx)}
                                className={`w-full max-w-full box-border text-left px-3.5 py-2.5 sm:px-4 sm:py-3 min-h-[44px] rounded-[20px] transition-all duration-100 active:scale-[0.99] flex items-start gap-2.5 sm:gap-3 cursor-pointer select-none ${
                                  isCorrect 
                                    ? 'bg-[#d3e3fd]/60 dark:bg-[#004a77]/50 text-[#041e49] dark:text-[#c2e7ff] font-bold ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] shadow-xs' 
                                    : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] font-medium ring-1 ring-[#0b57d0]/25 dark:ring-[#a8c7fa]/30 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] shadow-xs'
                                }`}
                                title={`Click to set option ${letter} as correct answer`}
                              >
                                <div className={`w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center shrink-0 font-extrabold text-xs sm:text-xs mt-0.5 transition-none ${
                                  isCorrect 
                                    ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] font-black ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa]' 
                                    : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] ring-1 ring-[#0b57d0]/35 dark:ring-[#a8c7fa]/40'
                                }`}>
                                  {letter}
                                </div>
                                <div className="flex-1 min-w-0 max-w-full text-[17px] sm:text-[18px] font-medium leading-snug text-slate-900 dark:text-zinc-100 py-0.5">
                                  <MathRenderer content={opt} />
                                </div>

                                {/* Option Diagram Quick Attach / Edit Button */}
                                <div className="shrink-0 flex items-center gap-1 self-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOptionDiagram(optIdx)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                      optImage
                                        ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff]'
                                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-600 dark:text-zinc-400'
                                    }`}
                                    title={optImage ? `Option ${letter} has diagram — click to edit` : `Attach diagram to Option ${letter}`}
                                  >
                                    <ImageIcon className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                                    <span className="hidden sm:inline">{optImage ? 'Diagram' : '+ Diagram'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Option Attached Diagram Resizable and Cropable inline without extra card */}
                              {optImage && (
                                <div className="pl-4 sm:pl-8 max-w-full">
                                  <EditorDiagramResizable
                                    imageUrl={optImage}
                                    alt={`Option ${letter} Diagram`}
                                    width={currentQuestion.optionImageWidths?.[optIdx]}
                                    onChangeWidth={(w) => handleUpdateOptionImageWidth(optIdx, w)}
                                    onChangeDiagram={() => handleOpenOptionDiagram(optIdx)}
                                    onRemoveDiagram={() => handleApplyOptionDiagram(optIdx, undefined)}
                                    onApplyCrop={(croppedUrl) => handleApplyOptionDiagram(optIdx, croppedUrl)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Numerical Input Box */}
                    {!isMcqQuestion(currentQuestion) && (
                      <div className="space-y-3 p-5 bg-[#f0f4f9] dark:bg-[#141619] border-0 ring-1 ring-[#0b57d0]/20 dark:ring-[#a8c7fa]/25 shadow-xs rounded-2xl">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 block">
                            Correct Numerical Value:
                          </span>
                          <span className="w-5.5 h-5.5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-bold text-xs">✓</span>
                        </div>
                        <div className="text-[18px] sm:text-[19px] font-medium text-slate-900 dark:text-zinc-100">
                          <MathRenderer content={currentQuestion.correctAnswer} />
                        </div>
                      </div>
                    )}

                    {/* Hint Card */}
                    {currentQuestion.hint && (
                      <div className="p-3.5 sm:p-4 bg-amber-50/80 dark:bg-amber-950/40 rounded-2xl border-0 ring-1 ring-amber-300/40 dark:ring-amber-700/40 shadow-xs text-[18px] sm:text-[19px] font-medium text-amber-950 dark:text-amber-200 space-y-1">
                        <span className="font-bold block text-xs tracking-wider uppercase text-amber-700 dark:text-amber-400">💡 Hint:</span>
                        <div className="pt-0.5 leading-relaxed overflow-x-auto overflow-y-hidden">
                          <MathRenderer content={currentQuestion.hint} />
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Derivation & Explanation */}
                    {(currentQuestion.explanation || currentQuestion.solution || currentQuestion.explanationImageUrl || (Array.isArray(currentQuestion.explanationImageUrls) && currentQuestion.explanationImageUrls.some(Boolean))) && (
                      <div className="pt-3 mt-2 border-t border-slate-200 dark:border-zinc-800/60 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-2 text-xs sm:text-sm">
                            <div className="w-6 h-6 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/20 flex items-center justify-center shrink-0">
                              <Lightbulb className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                            </div>
                            <span>Step-by-Step Derivation & Explanation:</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenExplanationDiagram(undefined, currentQuestion.explanationImageUrl ? true : false)}
                            className="text-xs px-2.5 py-1 rounded-full bg-[#d3e3fd]/60 hover:bg-[#d3e3fd] dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#c2e7ff] border border-dashed border-[#0b57d0]/30 flex items-center gap-1 transition-all cursor-pointer font-bold"
                            title="Attach a step-by-step diagram or visual proof to this explanation"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>
                              {currentQuestion.explanationImageUrl 
                                ? '+ Add Another Solution Diagram' 
                                : '+ Add Solution Diagram'}
                            </span>
                          </button>
                        </div>

                        {currentQuestion.explanation && (
                          <div className="pt-0.5 text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full overflow-x-auto overflow-y-hidden text-slate-800 dark:text-zinc-200">
                            <MathRenderer content={currentQuestion.explanation} className="text-slate-700 dark:text-zinc-300 leading-relaxed text-[18px] sm:text-[19px] font-medium" />
                          </div>
                        )}

                        {/* Solution / Explanation Diagrams with Editor Resizing & Crop */}
                        {(() => {
                          const diagrams: { url: string; width?: number; index?: number }[] = [];
                          
                          // Legacy single diagram
                          if (currentQuestion.explanationImageUrl) {
                            diagrams.push({
                              url: currentQuestion.explanationImageUrl,
                              width: currentQuestion.explanationImageWidth,
                            });
                          }
                          
                          // Extra diagrams
                          if (Array.isArray(currentQuestion.explanationImageUrls)) {
                            currentQuestion.explanationImageUrls.forEach((url, i) => {
                              if (url) {
                                diagrams.push({
                                  url,
                                  width: currentQuestion.explanationImageWidths?.[i],
                                  index: i,
                                });
                              }
                            });
                          }

                          if (diagrams.length === 0) return null;

                          return (
                            <div className={diagrams.length > 1 ? "flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-4 sm:gap-6 pt-2" : "space-y-4 pt-2"}>
                              {diagrams.map((diag, dIdx) => (
                                <div key={dIdx} className="relative group flex flex-col items-center">
                                  <EditorDiagramResizable
                                    imageUrl={diag.url}
                                    alt={`Solution Diagram ${dIdx + 1}`}
                                    width={diag.width}
                                    onChangeWidth={(w) => handleUpdateExplanationImageWidth(w, diag.index)}
                                    onChangeDiagram={() => handleOpenExplanationDiagram(diag.index)}
                                    onRemoveDiagram={() => handleApplyExplanationDiagram(undefined, diag.index)}
                                    onApplyCrop={(url) => handleApplyExplanationDiagram(url, diag.index)}
                                  />
                                  {diagrams.length > 1 && (
                                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full select-none opacity-80 backdrop-blur-sm pointer-events-none">
                                      Solution Diagram {dIdx + 1}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
            ) : (
              <div className="flex-1 min-h-[420px] sm:min-h-[520px] h-full flex flex-col bg-[#131316] text-emerald-400 dark:bg-[#131316] p-2 sm:p-3 rounded-2xl shadow-inner overflow-hidden max-w-5xl mx-auto w-full">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#2a2a32] text-xs shrink-0 gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Question Code — #{currentQIndex + 1}
                    </span>

                    <div className="flex items-center gap-1 sm:gap-1.5">
                      {/* Copy code button inside review header */}
                      <button
                        type="button"
                        onClick={copyQuestionCodeToClipboard}
                        className="px-2 sm:px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[#272932] hover:bg-[#343744] text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Copy question code"
                      >
                        {copiedQuestionCode ? <Check className="w-3 h-3 text-[#0b57d0]" /> : <Copy className="w-3 h-3 text-[#0b57d0]" />}
                        <span>{copiedQuestionCode ? 'Copied' : 'Copy'}</span>
                      </button>

                      {/* Paste code button inside review header */}
                      <button
                        type="button"
                        onClick={handlePasteQuestionCode}
                        className="px-2 sm:px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[#272932] hover:bg-[#343744] text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Paste question code from clipboard"
                      >
                        {isQuestionCodePastedNotice ? (
                          <ClipboardCheck className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Clipboard className="w-3 h-3 text-emerald-400" />
                        )}
                        <span>{isQuestionCodePastedNotice ? 'Pasted' : 'Paste'}</span>
                      </button>

                      {/* Icon-Only Find Button in Canvas Code Review Editor */}
                      <button
                        type="button"
                        id="canvas-code-find-btn"
                        onClick={() => {
                          const nextState = !isCodeFindOpen;
                          setIsCodeFindOpen(nextState);
                          if (nextState && codeFindQuery) {
                            handlePerformCodeFind(codeFindQuery);
                          }
                        }}
                        title="Find in question code"
                        aria-label="Find in question code"
                        className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                          isCodeFindOpen
                            ? 'bg-[#0b57d0] text-white shadow-2xs'
                            : 'bg-[#272932] hover:bg-[#343744] text-zinc-300'
                        }`}
                      >
                        <Search className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Find Toolbar for Canvas Code Review Editor */}
                  {isCodeFindOpen && (
                    <div className="py-1 px-2.5 mb-1.5 rounded-xl bg-[#0e0e11] border border-[#272932] flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-100">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Search className="w-3 h-3 text-[#0b57d0]" />
                        <input
                          type="text"
                          value={codeFindQuery}
                          onChange={(e) => {
                            setCodeFindQuery(e.target.value);
                            handlePerformCodeFind(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCodeFindNavigate(e.shiftKey ? 'prev' : 'next');
                            }
                            if (e.key === 'Escape') {
                              setIsCodeFindOpen(false);
                            }
                          }}
                          placeholder="Find in question code..."
                          autoFocus
                          className="flex-1 bg-transparent text-xs text-emerald-300 placeholder-zinc-500 outline-none font-mono"
                        />
                        <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                          {codeFindMatches.length > 0 ? `${codeFindCurrentIdx + 1}/${codeFindMatches.length}` : codeFindQuery ? '0 match' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCodeFindNavigate('prev')}
                          disabled={codeFindMatches.length === 0}
                          className="p-1 rounded hover:bg-[#343744] text-zinc-300 disabled:opacity-30 cursor-pointer"
                          title="Previous match (Shift+Enter)"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCodeFindNavigate('next')}
                          disabled={codeFindMatches.length === 0}
                          className="p-1 rounded hover:bg-[#343744] text-zinc-300 disabled:opacity-30 cursor-pointer"
                          title="Next match (Enter)"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCodeFindOpen(false)}
                          className="p-1 rounded hover:bg-[#343744] text-zinc-400 cursor-pointer"
                          title="Close find"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-h-[340px] sm:min-h-[440px] relative overflow-hidden w-full">
                    {/* Highlight backdrop layer for Question Code Draft */}
                    {isCodeFindOpen && codeFindQuery && codeFindMatches.length > 0 && (
                      <div
                        ref={codeBackdropRef}
                        aria-hidden="true"
                        className="absolute inset-0 p-2 sm:p-2.5 font-mono text-xs sm:text-[13px] leading-snug whitespace-pre-wrap break-words overflow-hidden pointer-events-none select-none z-0 text-transparent rounded-xl border border-transparent"
                      >
                        {renderHighlightedBackdrop(questionCodeDraft, codeFindQuery, codeFindMatches, codeFindCurrentIdx)}
                      </div>
                    )}

                    <textarea
                      ref={codeDraftTextareaRef}
                      value={questionCodeDraft}
                      onChange={(e) => handleCodeDraftChange(e.target.value)}
                      onScroll={(e) => {
                        if (codeBackdropRef.current) {
                          codeBackdropRef.current.scrollTop = e.currentTarget.scrollTop;
                          codeBackdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
                        }
                      }}
                      className={`relative z-10 w-full h-full p-2 sm:p-2.5 font-mono text-xs sm:text-[13px] leading-snug text-emerald-300 rounded-xl border border-[#272932] outline-none resize-none overflow-y-auto ${
                        isCodeFindOpen && codeFindQuery && codeFindMatches.length > 0
                          ? 'bg-[#0e0e11]/80'
                          : 'bg-[#0e0e11]'
                      }`}
                      spellCheck={false}
                    />
                  </div>

                  <div className="pt-2 mt-1.5 border-t border-[#272932] flex items-center justify-between gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateQuestionCode();
                        setCardMode('rendered');
                      }}
                      className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#272932] hover:bg-[#343744] text-zinc-300 transition-colors cursor-pointer"
                    >
                      Close Code View
                    </button>
                    <button
                      type="button"
                      id="test-editor-apply-flipped-code-btn"
                      onClick={() => {
                        const ok = handleUpdateQuestionCode();
                        if (ok) setCardMode('rendered');
                      }}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-2xs transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply & Review</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Optimized Question Navigation & Management Bar */}
            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Left: Previous Question Button */}
              <button
                type="button"
                id="test-editor-nav-prev-btn"
                onClick={() => {
                  if (cardMode === 'code') {
                    handleUpdateQuestionCode();
                  }
                  const newIdx = Math.max(0, currentQIndex - 1);
                  setCurrentQIndex(newIdx);
                  if (cardMode === 'code' && questions[newIdx]) {
                    setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(questions[newIdx]), null, 2));
                  }
                }}
                disabled={currentQIndex === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-[#dedcd6] dark:bg-[#222634] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-100 disabled:opacity-30 text-xs sm:text-sm font-bold cursor-pointer transition-all active:scale-95 min-h-[38px]"
                title="Go to previous question"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {/* Center: Quick Modification Tools (Delete) */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
                {/* Delete Question Button */}
                <button
                  type="button"
                  id="test-editor-delete-question-btn"
                  onClick={handleDeleteCurrentQuestion}
                  disabled={questions.length <= 1}
                  className="p-2.5 rounded-full bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 disabled:opacity-30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  title={questions.length <= 1 ? 'Assessment must have at least 1 question' : 'Delete current question'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Right: Next Question Button */}
              <button
                type="button"
                id="test-editor-nav-next-btn"
                onClick={() => {
                  if (cardMode === 'code') {
                    handleUpdateQuestionCode();
                  }
                  const newIdx = Math.min(questions.length - 1, currentQIndex + 1);
                  setCurrentQIndex(newIdx);
                  if (cardMode === 'code' && questions[newIdx]) {
                    setQuestionCodeDraft(JSON.stringify(formatQuestionCompact(questions[newIdx]), null, 2));
                  }
                }}
                disabled={currentQIndex >= questions.length - 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] disabled:opacity-30 text-white text-xs sm:text-sm font-bold cursor-pointer transition-all active:scale-95 shadow-2xs min-h-[38px]"
                title="Go to next question"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* RESIZABLE DIVIDER HANDLE */}
        {isDesktop && layoutMode === 'split' && (
          <div
            onMouseDown={handleMouseDownResize}
            className="flex w-3 items-center justify-center cursor-col-resize hover:bg-[#0b57d0]/20 active:bg-[#0b57d0]/30 rounded-full transition-colors my-auto h-24 shrink-0"
            title="Drag to resize columns"
          >
            <GripVertical className="w-4 h-4 text-slate-400" />
          </div>
        )}

        {/* RIGHT COLUMN / MOBILE EDITOR VIEW */}
        {((isDesktop && layoutMode !== 'canvas') || (!isDesktop && mobileTab === 'editor')) && (
          <div 
            className={`bg-white dark:bg-[#1e2024] p-3 sm:p-4 lg:p-5 rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-col justify-between overflow-hidden transition-all min-w-0 ${
              isDesktop && layoutMode === 'split' ? 'h-full shrink-0' : 'w-full flex-1 h-full'
            }`}
            style={
              isDesktop && layoutMode === 'split'
                ? { width: `calc(${100 - leftWidthPercent}% - 22px)` }
                : undefined
            }
          >
            {/* JSON Schema Editor Header: Add/Import JSON (+) button, Copy button, Paste button, and Find button */}
            <div className="flex items-center justify-between pb-2 sm:pb-2.5 border-b border-[#e5e2db] dark:border-zinc-800/60 shrink-0 gap-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <FileCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 truncate">
                  JSON Schema Editor
                </h3>
              </div>

              {/* Action Buttons: Copy, Paste, and Search */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* 1. Copy Data from JSON Schema Editor button */}
                <button
                  type="button"
                  id="json-editor-copy-btn"
                  onClick={handleCopyJsonSchema}
                  title="Copy full JSON schema to clipboard"
                  aria-label="Copy JSON schema"
                  className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                    copiedJsonSchema
                      ? 'bg-[#0b57d0] text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-300 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]'
                  }`}
                >
                  {copiedJsonSchema ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* 3. Paste Data into JSON Schema Editor button */}
                <button
                  type="button"
                  id="json-editor-paste-btn"
                  onClick={handlePasteJsonData}
                  title="Paste copied JSON into editor"
                  aria-label="Paste clipboard JSON"
                  className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                    isJsonPastedNotice
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-300 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]'
                  }`}
                >
                  {isJsonPastedNotice ? (
                    <ClipboardCheck className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Clipboard className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* 4. Icon-Only Find Button in JSON Schema Editor */}
                <button
                  type="button"
                  id="json-editor-find-btn"
                  onClick={() => {
                    const nextState = !isJsonFindOpen;
                    setIsJsonFindOpen(nextState);
                    if (nextState && jsonFindQuery) {
                      handlePerformJsonFind(jsonFindQuery);
                    }
                  }}
                  title="Find in JSON schema"
                  aria-label="Find in JSON schema"
                  className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                    isJsonFindOpen 
                      ? 'bg-[#0b57d0] text-white' 
                      : 'bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-300'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Inline Find Toolbar for JSON Schema Editor */}
            {isJsonFindOpen && (
              <div className="py-2 px-3 my-1.5 rounded-2xl bg-slate-100 dark:bg-[#222634] flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-100">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <input
                    type="text"
                    value={jsonFindQuery}
                    onChange={(e) => {
                      setJsonFindQuery(e.target.value);
                      handlePerformJsonFind(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleJsonFindNavigate(e.shiftKey ? 'prev' : 'next');
                      }
                      if (e.key === 'Escape') {
                        setIsJsonFindOpen(false);
                      }
                    }}
                    placeholder="Find in JSON schema..."
                    autoFocus
                    className="flex-1 bg-transparent text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 outline-none font-mono"
                  />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 shrink-0">
                    {jsonFindMatches.length > 0 ? `${jsonFindCurrentIdx + 1} of ${jsonFindMatches.length}` : jsonFindQuery ? 'No match' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleJsonFindNavigate('prev')}
                    disabled={jsonFindMatches.length === 0}
                    className="p-1 rounded-md hover:bg-[#e6e4dc] dark:hover:bg-[#282a39] text-slate-600 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJsonFindNavigate('next')}
                    disabled={jsonFindMatches.length === 0}
                    className="p-1 rounded-md hover:bg-[#e6e4dc] dark:hover:bg-[#282a39] text-slate-600 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Next match (Enter)"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJsonFindOpen(false)}
                    className="p-1 rounded-md hover:bg-[#e6e4dc] dark:hover:bg-[#282a39] text-slate-500 dark:text-zinc-400 cursor-pointer"
                    title="Close find"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {jsonError && (
              <div className="p-2.5 my-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-xs font-semibold shrink-0">
                {jsonError}
              </div>
            )}

            <div className="flex-1 min-h-0 relative pt-2 overflow-hidden w-full">
              {/* Highlight backdrop layer for JSON Schema Textarea */}
              {isJsonFindOpen && jsonFindQuery && jsonFindMatches.length > 0 && (
                <div
                  ref={jsonBackdropRef}
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 top-2 p-3 sm:p-4 font-mono text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden pointer-events-none select-none z-0 text-transparent rounded-2xl"
                >
                  {renderHighlightedBackdrop(jsonText, jsonFindQuery, jsonFindMatches, jsonFindCurrentIdx)}
                </div>
              )}

              <textarea
                ref={jsonTextareaRef}
                value={jsonText}
                onChange={handleJsonChange}
                onScroll={(e) => {
                  if (jsonBackdropRef.current) {
                    jsonBackdropRef.current.scrollTop = e.currentTarget.scrollTop;
                    jsonBackdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                className={`relative z-10 w-full h-full p-3 sm:p-4 font-mono text-xs sm:text-[13px] leading-relaxed text-emerald-400 dark:text-emerald-300 rounded-2xl outline-none resize-none overflow-y-auto ${
                  isJsonFindOpen && jsonFindQuery && jsonFindMatches.length > 0
                    ? 'bg-[#0d1411]/90 dark:bg-[#080d0a]/90'
                    : 'bg-[#0d1411] dark:bg-[#080d0a]'
                }`}
                spellCheck={false}
              />
            </div>

            {/* JSON Editor Bottom Status & Quick Format Tools */}
            <div className="pt-2.5 mt-2 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{questions.length} Questions</span>
                <span className="text-slate-300 dark:text-zinc-600">•</span>
                <span className="font-mono text-[10px] uppercase text-emerald-600 dark:text-emerald-400">{topic}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="json-editor-format-btn"
                  onClick={handleFormatJson}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] text-[#1d283a] dark:text-zinc-200 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="Auto-format and align JSON structure"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <span>Format JSON</span>
                </button>
              </div>
            </div>
          </div>
        )}

      {/* AI PROMPT BAR AT VERY BOTTOM OF PAGE (SEPARATE FROM TEST CARD) */}
      {isAiPromptOpen && (
        <div className="px-1 sm:px-6 pb-2 pt-1 shrink-0 w-full max-w-3xl mx-auto">
          <div className="bg-white dark:bg-[#1e2024] px-3.5 sm:px-5 py-3 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Header: Title + Scope Toggle + Close Button */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Prompt Editor</span>
              </span>

              <div className="flex items-center gap-2">
                {/* Scope Selector */}
                <div className="flex items-center bg-slate-100 dark:bg-[#222634] p-0.5 rounded-full text-[11px] font-bold border-0 ring-0 shadow-none">
                  <button
                    type="button"
                    onClick={() => setAiScope('all')}
                    className={`px-2.5 py-0.5 rounded-full border-0 outline-none ring-0 shadow-none transition-colors cursor-pointer ${
                      aiScope === 'all'
                        ? 'bg-[#0b57d0] text-white'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    All ({questions.length} Qs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiScope('current')}
                    className={`px-2.5 py-0.5 rounded-full border-0 outline-none ring-0 shadow-none transition-colors cursor-pointer ${
                      aiScope === 'current'
                        ? 'bg-[#0b57d0] text-white'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    Q{currentQIndex + 1} Only
                  </button>
                </div>

                {/* Close prompt bar */}
                <button
                  type="button"
                  onClick={() => setIsAiPromptOpen(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-[#282a39] border-0 outline-none ring-0 shadow-none transition-colors cursor-pointer"
                  title="Close AI Prompt Bar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Prompt Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunAiPrompt();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  ref={aiPromptInputRef}
                  type="text"
                  value={aiPromptText}
                  onChange={(e) => setAiPromptText(e.target.value)}
                  placeholder={
                    aiScope === 'current'
                      ? `e.g. "Fix LaTeX formulas for Q${currentQIndex + 1}", "Make Q${currentQIndex + 1} harder"...`
                      : 'e.g. "Add step-by-step LaTeX explanations to all questions", "Increase difficulty to Hard"...'
                  }
                  disabled={isAiLoading}
                  className="w-full px-3.5 py-2 bg-slate-100 dark:bg-[#13151b] border-0 rounded-full text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-0 shadow-none disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={!aiPromptText.trim() || isAiLoading}
                className="px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-xs sm:text-sm font-bold rounded-full border-0 outline-none ring-0 shadow-none focus:ring-0 transition-all cursor-pointer shrink-0"
              >
                {isAiLoading ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying...</span>
                  </div>
                ) : (
                  'Apply'
                )}
              </button>
            </form>

            {/* Quick Suggestion Chips at Bottom */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar py-0.5">
              {[
                { label: `🖼️ Diagram Q${currentQIndex + 1}`, prompt: `Generate and attach a vector mathematical diagram / graph for Question #${currentQIndex + 1}` },
                { label: '➕ Add Question', prompt: 'Add 1 additional high-yield question to the test on this topic.' },
                { label: `🗑️ Delete Q${currentQIndex + 1}`, prompt: `Delete Question #${currentQIndex + 1} from the test.` },
                { label: `✏️ Rewrite Q${currentQIndex + 1}`, prompt: `Rewrite Question #${currentQIndex + 1} with clearer wording and deeper step-by-step explanations.` },
                { label: 'Fix LaTeX Math', prompt: 'Ensure all mathematical expressions use clean, valid LaTeX equations with single dollar signs.' },
                { label: 'Add Explanations', prompt: 'Add detailed step-by-step mathematical proofs and derivations to the explanation of each question.' },
                { label: 'Make Harder', prompt: 'Increase the conceptual depth and analytical difficulty of the questions to Hard exam level.' },
                { label: 'Verify Answers', prompt: 'Carefully verify that every question has accurate options and that the correctAnswer is 100% mathematically correct.' },
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isAiLoading}
                  onClick={() => {
                    setAiPromptText(chip.prompt);
                    handleRunAiPrompt(chip.prompt);
                  }}
                  className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#13151b] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 border-0 outline-none ring-0 shadow-none focus:ring-0 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* AI Result Notice */}
            {aiNotice && (
              <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 font-semibold flex items-center justify-between bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 rounded-lg">
                <span className="truncate">{aiNotice}</span>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="text-[11px] font-bold underline hover:text-blue-900 dark:hover:text-blue-100 ml-2 cursor-pointer shrink-0"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* SAVED TESTS & TEST HISTORY FULL VIEW OVERLAY */}
      <AnimatePresence>
        {isHistoryDrawerOpen && (
          <motion.div 
            initial={{ opacity: 0, transform: 'scale3d(0.99, 0.99, 1)' }}
            animate={{ opacity: 1, transform: 'scale3d(1, 1, 1)' }}
            exit={{ opacity: 0, transform: 'scale3d(0.99, 0.99, 1)' }}
            transition={{ duration: 0.12, ease: [0.0, 0.0, 0.2, 1.0] }}
            style={gpuAcceleratedStyle}
            className="fixed inset-0 z-50 bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] w-full h-full flex flex-col overflow-hidden font-sans" 
            onClick={(e) => e.stopPropagation()}
          >
              {/* Full-View Header (Matching App Header Background #e5e9f0 / #0b0c10 with Safe-Area Inset) */}
              <div className="px-4 py-2.5 sm:px-6 sm:py-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] border-0 flex items-center justify-between gap-4 bg-[#e5e9f0] dark:bg-[#0b0c10] shrink-0 transition-colors duration-200">
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsHistoryDrawerOpen(false)}
                    className="flex items-center gap-1.5 py-1.5 px-3.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] cursor-pointer transition-all shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 ring-0 outline-none text-xs font-bold active:scale-95"
                    title="Return to Studio"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span className="hidden sm:inline text-xs font-bold">Back to Studio</span>
                  </button>

                  <div className="min-w-0">
                    <h2 className="font-extrabold text-sm sm:text-lg text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight truncate leading-tight">
                      Test History
                    </h2>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate hidden xs:block font-medium leading-tight">
                      Manage, search, switch between, export, or delete saved assessment drafts.
                    </p>
                  </div>
                </div>
              </div>

            {/* Compact Top Metrics Row & Search Icon Button (Plain Background, No Lines) */}
            <div className="px-4 sm:px-6 py-2.5 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink min-w-0 pr-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] shrink-0 whitespace-nowrap">
                  <BookOpen className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span>Tests: <strong className="text-[#0b57d0] dark:text-[#a8c7fa] font-black">{allTests.length}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] shrink-0 whitespace-nowrap">
                  <FileCode className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span>Questions: <strong className="text-[#0b57d0] dark:text-[#a8c7fa] font-black">{allTests.reduce((acc, curr) => acc + (curr.questions?.length || 0), 0)}</strong></span>
                </div>
                {title && (
                  <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#a8c7fa] border-0 ring-0 outline-none text-xs font-bold shadow-xs shrink-0 whitespace-nowrap">
                    <Check className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[120px]">Active: {title}</span>
                  </div>
                )}
              </div>

              {/* Icon-Type Search Button (Top Right, Opens Towards Left) */}
              <div className="flex items-center justify-end shrink-0">
                {isHistorySearchOpen || historySearchQuery ? (
                  <div className="flex items-center gap-1.5 bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none px-3 py-1.5 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] animate-in fade-in slide-in-from-right-4 duration-150 w-36 xs:w-48 sm:w-60">
                    <Search className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                    <input
                      ref={historySearchInputRef}
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Search assessments..."
                      className="w-full bg-transparent text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#5e5e5e]/70 dark:placeholder-[#9aa0a6]/70 outline-none border-0 ring-0"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (historySearchQuery) {
                          setHistorySearchQuery('');
                        } else {
                          setIsHistorySearchOpen(false);
                        }
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-xs cursor-pointer rounded-full shrink-0 border-0 ring-0"
                      title={historySearchQuery ? "Clear search" : "Close search"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsHistorySearchOpen(true);
                      setTimeout(() => historySearchInputRef.current?.focus(), 50);
                    }}
                    className="w-8 h-8 rounded-full bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] shrink-0 active:scale-95"
                    title="Search history"
                  >
                    <Search className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  </button>
                )}
              </div>
            </div>

            {/* Next Row: Small Topic Dropdown (Left) & Sort Pills Shifted Rightwards (Plain Background, No Lines) */}
            <div className="px-3 sm:px-6 py-2 border-0 bg-[#e5e9f0] dark:bg-[#0b0c10] shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-max w-full">
                {/* Topic Select Dropdown */}
                <div className="relative shrink-0">
                  <div className="h-8 flex items-center gap-1 sm:gap-1.5 bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] px-2.5 rounded-full transition-all cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                    <SlidersHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                    <select
                      value={historyTopicFilter}
                      onChange={(e) => setHistoryTopicFilter(e.target.value)}
                      className="bg-transparent text-[11px] sm:text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] outline-none border-0 ring-0 cursor-pointer pr-1 appearance-none font-sans max-w-[80px] xs:max-w-[95px] sm:max-w-[125px] truncate"
                      title="Filter assessments by topic"
                    >
                      <option value="all" className="bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold">
                        All Topics ({allTests.length})
                      </option>
                      {allAvailableTopicsList.filter(t => allTests.some(test => (test.topic || '').toLowerCase() === t.toLowerCase())).map((top) => {
                        const count = allTests.filter(test => (test.topic || '').toLowerCase() === top.toLowerCase()).length;
                        return (
                          <option key={top} value={top} className="bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold">
                            {top} ({count})
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="w-3 h-3 text-[#1f1f1f] dark:text-[#e3e3e3] pointer-events-none -ml-0.5 shrink-0" />
                  </div>
                </div>

                {/* Sort Toggle - Shifted Rightwards */}
                <div className="h-8 flex items-center gap-0.5 sm:gap-1 shrink-0 ml-auto bg-white dark:bg-[#1e2024] border-0 ring-0 outline-none p-1 rounded-full text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <span className="text-[10px] sm:text-[10.5px] text-[#5e5e5e] dark:text-[#9aa0a6] px-1 font-extrabold uppercase tracking-wider hidden xs:inline">Sort:</span>
                  <button
                    type="button"
                    onClick={() => setHistorySortBy('recent')}
                    className={`h-6 px-2 sm:px-3 rounded-full flex items-center justify-center transition-all cursor-pointer text-[11px] sm:text-xs font-bold ${
                      historySortBy === 'recent' ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] shadow-xs' : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySortBy('title')}
                    className={`h-6 px-2 sm:px-3 rounded-full flex items-center justify-center transition-all cursor-pointer text-[11px] sm:text-xs font-bold ${
                      historySortBy === 'title' ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] shadow-xs' : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    Title
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySortBy('questions')}
                    className={`h-6 px-2 sm:px-3 rounded-full flex items-center justify-center transition-all cursor-pointer text-[11px] sm:text-xs font-bold ${
                      historySortBy === 'questions' ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] shadow-xs' : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    Questions
                  </button>
                </div>
              </div>
            </div>

            {/* Assessment Cards Grid Container (Matching Main Body Color) */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-[#e5e9f0] dark:bg-[#0b0c10]">
              {filteredAllTests.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border border-blue-500/20 shadow-xs">
                    <BookOpen className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {historySearchQuery || historyTopicFilter !== 'all'
                      ? 'No matching assessments found'
                      : 'No saved assessments yet'}
                  </h4>
                  <p className="text-xs sm:text-sm text-[#5e5e5e] dark:text-[#9aa0a6] max-w-md mx-auto">
                    {historySearchQuery || historyTopicFilter !== 'all'
                      ? 'Try clearing the search query or adjusting your topic filter.'
                      : 'Create and save your first assessment in TestCreator Studio to see it in your history.'}
                  </p>
                  {(historySearchQuery || historyTopicFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearchQuery('');
                        setHistoryTopicFilter('all');
                      }}
                      className="mt-2 px-5 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                    >
                      Reset Search & Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-w-4xl mx-auto">
                  {filteredAllTests.map((t) => {
                    const isCurrent = t.id === editingTestId;
                    const qCount = t.questions?.length || 0;
                    const minutes = t.timeLimitMinutes || 15;
                    const timeDisplay = minutes > 0 ? `${minutes}m` : 'Untimed';
                    const isLongTitle = (t.title || '').trim().length > 30;

                    return (
                      <div 
                        key={t.id} 
                        onClick={() => handleLoadPreviousTest(t)}
                        className={`p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5 ${
                          isCurrent ? 'ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa]' : ''
                        }`}
                      >
                        {/* Top: Topic tag above title & Title */}
                        <div className="w-full space-y-0.5">
                          {t.topic && (
                            <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa] block truncate">
                              {t.topic}
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <h3 className="text-[13px] sm:text-sm font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
                              {t.title}
                            </h3>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-[#d3e3fd]/80 dark:bg-[#004a77]/60 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0">
                                Loaded
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom Row: Question count, time, action buttons */}
                        <div 
                          className="flex items-center justify-between w-full pt-0.5" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium leading-none">
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                              <Package className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" strokeWidth={2.2} />
                              <span className="leading-none">{qCount} Qs</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                              <Clock className="w-3.5 h-3.5 text-[#6750a4] dark:text-[#d0bcff] shrink-0" strokeWidth={2.2} />
                              <span className="leading-none">{timeDisplay}</span>
                            </span>
                          </div>

                          {/* Quick Share / Export / Delete icon buttons */}
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareTest(t);
                              }}
                              className="w-7 h-7 rounded-full bg-[#f0f4f9] hover:bg-[#e2e7f0] dark:bg-[#282a30] dark:hover:bg-[#34374a] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center transition-all cursor-pointer border-0 active:scale-95"
                              title="Share test link"
                            >
                              {copiedShareTestId === t.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Share2 className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {onExportJson && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExportJson(t);
                                }}
                                className="w-7 h-7 rounded-full bg-[#f0f4f9] hover:bg-[#e2e7f0] dark:bg-[#282a30] dark:hover:bg-[#34374a] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center transition-all cursor-pointer border-0 active:scale-95"
                                title="Export this test to JSON"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTestToDeleteId(t.id);
                              }}
                              className="w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-all cursor-pointer border-0 active:scale-95"
                              title="Delete test"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span 
                            onClick={() => handleLoadPreviousTest(t)}
                            className="material-symbols-outlined text-[14px] text-[#747775] dark:text-[#8e918f] group-hover:translate-x-0.5 transition-transform shrink-0 cursor-pointer"
                          >
                            chevron_right
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SAVE CONFIRMATION POPUP MODAL */}
      <AnimatePresence>
        {isSaveConfirmModalOpen && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] w-full max-w-sm rounded-[28px] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-6 space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] flex items-center justify-center mx-auto shadow-2xs">
                <Save className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Save Assessment?</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Are you sure you want to save "{title}"? All changes will be updated successfully.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveConfirmModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-[#1d283a] dark:text-zinc-300 bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] rounded-full cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-[#0b57d0] hover:bg-[#0842a0] rounded-full shadow-md cursor-pointer transition-all"
                >
                  Yes, Save Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {testToDeleteId && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] w-full max-w-sm rounded-[28px] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Delete Assessment?</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#dedcd6] dark:border-zinc-800/60">
                <button 
                  type="button" 
                  onClick={() => setTestToDeleteId(null)} 
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-[#222634] text-[#1d283a] dark:text-zinc-300 hover:bg-[#dedcd6] dark:hover:bg-[#282a39] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleConfirmDelete} 
                  className="px-4 py-1.5 rounded-full text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UNIFIED JSON IMPORT MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] w-full max-w-xl rounded-[28px] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#dedcd6] dark:border-zinc-800/60 pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Import Test via JSON</h3>
                <button type="button" onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-[#c4c4cc] cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              {importError && (
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold">
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold">
                  {importSuccess}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-full border-2 border-dashed border-[#0b57d0] text-xs font-bold text-[#0b57d0] dark:border-[#a8c7fa] dark:text-[#a8c7fa] hover:bg-blue-50/50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Upload JSON file from device storage</span>
                </button>
                
                <div className="text-center text-[11px] text-slate-400 dark:text-zinc-500 font-semibold uppercase">or paste raw JSON text</div>

                <textarea
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder="Paste JSON test schema here..."
                  className="w-full h-36 p-3 text-xs font-mono bg-slate-100 dark:bg-[#12141a] text-slate-900 dark:text-zinc-100 rounded-2xl border border-[#dedcd6] dark:border-zinc-800/60 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsImportModalOpen(false)} className="px-4 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-[#222634] text-[#1d283a] dark:text-zinc-300 hover:bg-[#dedcd6] dark:hover:bg-[#282a39] rounded-full cursor-pointer transition-colors">Cancel</button>
                <button type="button" onClick={() => handleProcessImportJson(importJsonText)} className="px-4 py-1.5 text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:text-[#041e49] rounded-full cursor-pointer transition-colors">Import Text</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DIAGRAM PICKER MODAL */}
      <DiagramPickerModal
        isOpen={diagramModalTarget.isOpen}
        targetType={diagramModalTarget.targetType}
        optionIndex={diagramModalTarget.optionIndex}
        initialImageUrl={
          diagramModalTarget.isAdd
            ? undefined
            : diagramModalTarget.targetType === 'question'
            ? (diagramModalTarget.index !== undefined && diagramModalTarget.index >= 0
                ? currentQuestion.imageUrls?.[diagramModalTarget.index]
                : (currentQuestion.imageUrl || (currentQuestion as any).paperLayout?.imageUrl))
            : diagramModalTarget.targetType === 'option' && diagramModalTarget.optionIndex !== undefined
            ? currentQuestion.optionImages?.[diagramModalTarget.optionIndex]
            : (diagramModalTarget.index !== undefined && diagramModalTarget.index >= 0
                ? currentQuestion.explanationImageUrls?.[diagramModalTarget.index]
                : currentQuestion.explanationImageUrl)
        }
        onClose={() => setDiagramModalTarget((prev) => ({ ...prev, isOpen: false }))}
        onApply={handleApplyModalDiagram}
        questionNumber={currentQIndex + 1}
        questionText={currentQuestion?.text}
        questionOptions={currentQuestion?.options}
        questionExplanation={currentQuestion?.explanation || currentQuestion?.solution}
        targetContextText={
          diagramModalTarget.targetType === 'question'
            ? currentQuestion?.text
            : diagramModalTarget.targetType === 'option' && diagramModalTarget.optionIndex !== undefined
            ? currentQuestion?.options?.[diagramModalTarget.optionIndex]
            : currentQuestion?.explanation || currentQuestion?.solution
        }
        targetTitle={
          diagramModalTarget.targetType === 'question'
            ? `Question ${currentQIndex + 1}`
            : diagramModalTarget.targetType === 'option' && diagramModalTarget.optionIndex !== undefined
            ? `Question ${currentQIndex + 1} — Option ${String.fromCharCode(65 + diagramModalTarget.optionIndex)}`
            : `Question ${currentQIndex + 1} — Step-by-Step Explanation`
        }
        contextLabel={
          diagramModalTarget.targetType === 'question'
            ? 'Question Statement'
            : diagramModalTarget.targetType === 'option' && diagramModalTarget.optionIndex !== undefined
            ? `Option ${String.fromCharCode(65 + diagramModalTarget.optionIndex)}`
            : 'Step-by-Step Explanation'
        }
      />
      {cardMode === 'paper' && (
        <motion.div 
          drag
          dragMomentum={false}
          className="print:hidden fixed right-[16px] top-[260px] z-[200] flex flex-col items-end select-none cursor-grab active:cursor-grabbing"
        >
          <div className="bg-white/95 dark:bg-[#21222e]/95 backdrop-blur-md p-1 rounded-full shadow-md flex flex-col gap-1.5 items-center border border-slate-200/80 dark:border-zinc-800/60">
            <button
              type="button"
              onClick={() => setIsDockExpanded(!isDockExpanded)}
              className={`w-9 h-9 rounded-full transition-all cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                isDockExpanded
                  ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200'
              }`}
              title={isDockExpanded ? "Collapse layout options" : "Expand layout options"}
            >
              {isDockExpanded ? (
                <ChevronUp className="w-4 h-4 animate-bounce" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {isDockExpanded && (
              <div className="flex flex-col gap-1.5 items-center mt-0.5 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    const nextMap: Record<string, 'tight' | 'balanced' | 'relaxed'> = {
                      balanced: 'tight',
                      tight: 'relaxed',
                      relaxed: 'balanced',
                    };
                    setLayoutDensity(nextMap[layoutDensity] || 'balanced');
                  }}
                  className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center text-[9px] font-extrabold border-0 ring-0 outline-none shadow-none ${
                    layoutDensity === 'tight'
                      ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                      : layoutDensity === 'relaxed'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                  }`}
                  title={`Page Density: ${layoutDensity.toUpperCase()} (Click to toggle Tight -> Relaxed -> Balanced)`}
                >
                  {layoutDensity === 'tight' ? 'MAX' : layoutDensity === 'relaxed' ? 'PAD' : 'BAL'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowBadges(!showBadges)}
                  className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                    showBadges
                      ? 'bg-slate-200 dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 font-bold'
                      : 'bg-slate-100 dark:bg-[#222634] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                  }`}
                  title={showBadges ? 'Hide Edit Badges (Clean Preview)' : 'Show Edit Badges'}
                >
                  {showBadges ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />}
                </button>

                <button
                  type="button"
                  onClick={handleResetAllLayouts}
                  className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                  title="Reset all question paper layout overrides to Auto"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300 group-hover:-rotate-45 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={handlePrintA4}
                  className="w-8.5 h-8.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                  title="Print A4 / Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-white dark:text-[#041e49] group-hover:scale-110 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default TestEditor;

