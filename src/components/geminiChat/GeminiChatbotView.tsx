import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, 
  User as UserIcon, 
  Send, 
  Sparkles, 
  RotateCcw, 
  Copy, 
  Check, 
  Trash2, 
  Sliders, 
  Zap, 
  Brain, 
  GraduationCap, 
  ChevronDown, 
  ChevronUp,
  ChevronRight,
  ArrowDown, 
  ArrowLeft,
  Paperclip, 
  X, 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  File as FileGenericIcon, 
  Plus, 
  Pencil,
  MessageSquare, 
  Clock, 
  Settings2, 
  BookOpen, 
  Search, 
  Lightbulb,
  AlertCircle,
  Terminal,
  Download,
  Maximize2,
  Play,
  Code,
  Code2,
  CheckCheck,
  Square,
  ZoomIn,
  ZoomOut,
  Cloud,
  CloudOff,
  RefreshCw,
  MoreHorizontal,
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  Loader2,
  Layers,
  PlusCircle,
  FileSpreadsheet,
  Sigma,
  LineChart,
  FileCheck2,
  Award,
  Calculator,
  BarChart2,
  Scan,
  Target,
  Bookmark
} from 'lucide-react';
import { saveSingleNoteToIDB } from '../../lib/idbNotes';
import { copyFormattedTextToClipboard, copyImageToClipboard } from '../../lib/tableClipboard';
import { 
  auth, 
  onAuthStateChanged,
  signInWithGoogle,
  saveUserSettingsToFirestore,
  saveChatSessionToFirestore,
  saveChatArchiveToFirestoreDirect,
  deleteChatSessionFromFirestore,
  fetchChatArchiveFromFirestore,
  subscribeUserChatSessionsFromFirestore,
  flushPendingChatSaves
} from '../../lib/firebase';
import { 
  stageChatArchiveForExit, 
  flushChatArchiveOnExit, 
  hydrateAndReconcileChatArchiveOnEntry,
  syncChatArchiveNow
} from '../../lib/geminiChatSyncManager';
import { smartCoordinator } from '../../lib/smartLocalCoordinator';
import { loadScopedChatSessions, saveScopedChatSessions, getCachedAuthUser, getScopedStorageKeys } from '../../lib/storage';
import { getAllChatSessionsFromIndexedDB, requestPersistentStorage } from '../../lib/indexedDbStorage';
import { syncHub } from '../../lib/syncEngine';
import { MathRenderer } from '../MathRenderer';
import { GeminiTestActionCard, ParsedTestAction } from '../GeminiTestActionCard';
import { GeminiAppActionCard } from '../GeminiAppActionCard';
import { GeminiTableCanvasModal } from '../GeminiTableCanvasModal';
import { GeminiTestCanvasModal } from '../GeminiTestCanvasModal';
import { GeminiImageCanvasModal } from '../GeminiImageCanvasModal';
import { SessionTestGeneratorModal } from '../SessionTestGeneratorModal';
import { SessionImageGeneratorModal } from '../SessionImageGeneratorModal';
import { SessionTableGeneratorModal } from '../SessionTableGeneratorModal';
import { useBackHandler } from '../../hooks/useBackNavigation';
import {
  studioTabVariants,
  gpuAcceleratedStyle,
} from '../../lib/animationConfig';
import { APP_STYLES } from '../ui/AppStyles';

import type {
  SessionStagedQuestion,
  SessionDocument
} from './types';

import { MathTest, TestAttempt, UserProfile, DifficultyLevel, normalizeQuestions, ParsedAppAction, GeminiModelTier } from '../../types';
export type { GeminiModelTier };
import { getAllNotesFromIDB } from '../../lib/idbNotes';
import { buildThetaLeanAppContext } from '../../lib/thetaAppContextResolver';
import { 
  speechEngine,
  LiveTalkStatus,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  formatTextForSpeech, 
  getSpeechRecognition,
  removeConsecutiveDuplicateWords,
  applyGeminiFemaleVoice
} from '../../lib/geminiSpeechEngine';
import { GeminiStudioPromptBar } from '../GeminiStudioPromptBar';
import { PythonCodeDrawer } from './components/PythonCodeDrawer';

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  data: string; // base64 data url or raw text
  previewUrl?: string;
}

export interface ExecutableCodePart {
  language: string;
  code: string;
}

export interface CodeExecutionResultPart {
  outcome: string;
  output: string;
}

export interface ChatbotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  roleUsed?: string;
  attachments?: ChatAttachment[];
  executableCode?: ExecutableCodePart[];
  codeExecutionResults?: CodeExecutionResultPart[];
  generatedImages?: string[];
  parts?: any[];
  isError?: boolean;
  errorType?: 'quota_limit' | 'rate_limit' | 'overloaded' | 'timeout' | 'network' | 'firebase' | 'service_busy' | 'general';
  retryPrompt?: string;
  isNotice?: boolean;
  noticeMessage?: string;
  isAiGeneratedImage?: boolean;
  imagePrompt?: string;
  isEditedWithAi?: boolean;
  lastEditPrompt?: string;
  previousVersions?: Array<{
    content: string;
    timestamp: string;
    prompt?: string;
  }>;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatbotMessage[];
  selectedTestId?: string | null;
  modelTier?: GeminiModelTier;
  cloudSyncEnabled?: boolean;
  _syncStatus?: 'synced' | 'pending' | 'failed';
  stagedQuestions?: SessionStagedQuestion[];
  sessionDocuments?: SessionDocument[];
}

export interface GeminiChatbotViewProps {
  isDarkMode: boolean;
  tests?: MathTest[];
  attempts?: TestAttempt[];
  userProfile?: UserProfile | null;
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
  onSaveTest?: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onStartTest?: (test: MathTest, mode?: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  onNavigateTab?: (tab: string) => void;
}

const PRESET_ROLES = [
  {
    id: 'general_tutor',
    name: 'Theta AI Tutor',
    tag: 'Balanced',
    description: 'Step-by-step math derivations, thorough derivations in LaTeX & test review',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: GraduationCap,
    badgeColor: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
  },
  {
    id: 'complex_researcher',
    name: 'Research & Proof Master',
    tag: 'Deep Reasoning',
    description: 'Theoretical proofs, higher mathematics, theorems & complex STEM analysis',
    recommendedModel: 'gemini-3.1-pro-preview' as GeminiModelTier,
    icon: Brain,
    badgeColor: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
  },
  {
    id: 'fast_solver',
    name: 'Fast Solver & Evaluator',
    tag: 'High Speed',
    description: 'Direct computations, instant formulas, quick calculations with zero preamble',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: Zap,
    badgeColor: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
  },
  {
    id: 'socratic_coach',
    name: 'Socratic Coach',
    tag: 'Guided Learning',
    description: 'Probing questions, hints, and guided thought steps to build understanding',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: Lightbulb,
    badgeColor: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
  }
];

const MODEL_OPTIONS: { id: GeminiModelTier; label: string; tag: string; description: string; icon: any; color: string }[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite (Recommended)',
    tag: 'Instant & Reliable',
    description: 'High-speed reliable model for instant mathematical derivations, LaTeX formulas, and tutoring',
    icon: Zap,
    color: 'text-amber-500'
  },
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    tag: 'Balanced & Adaptive',
    description: 'Standard production flash model with broad reasoning and multimodal support',
    icon: Sparkles,
    color: 'text-indigo-500'
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    tag: 'Next-Gen Speed',
    description: 'Next-gen flash model for complex mathematical derivations and multi-turn tutoring',
    icon: Sparkles,
    color: 'text-blue-500'
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tag: 'Advanced Reasoning',
    description: 'Highest capability for complex theoretical proofs & university math',
    icon: Brain,
    color: 'text-purple-500'
  }
];

export function extractTestAction(content: string): { cleanContent: string; testAction: ParsedTestAction | null } {
  if (!content) return { cleanContent: '', testAction: null };

  let matchedStr = '';
  let jsonStr = '';

  // 1. Check for closed ```test-action ... ``` block
  const closedMatch = content.match(/```(?:test-action|json:test-action|test_action|testaction)\s*([\s\S]*?)\s*```/i);
  if (closedMatch) {
    matchedStr = closedMatch[0];
    jsonStr = closedMatch[1].trim();
  } else {
    // 1b. Check for unclosed ```test-action ... (if output was truncated or omitted closing fence)
    const unclosedMatch = content.match(/```(?:test-action|json:test-action|test_action|testaction)\s*([\s\S]+)$/i);
    if (unclosedMatch) {
      matchedStr = unclosedMatch[0];
      jsonStr = unclosedMatch[1].trim();
    }
  }

  // 2. Check for ```json ... ``` block containing test action or questions
  if (!jsonStr) {
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?"(?:action|questions)"[\s\S]*?\})\s*```/i);
    if (jsonMatch) {
      matchedStr = jsonMatch[0];
      jsonStr = jsonMatch[1].trim();
    }
  }

  // 3. Fallback: Search for raw JSON containing "action": "CREATE_TEST" or "UPDATE_TEST" or "DELETE_TEST" or "questions": [
  if (!jsonStr) {
    const rawActionMatch = content.match(/(\{[\s\r\n]*"(?:action|questions)"[\s\S]*\})/i);
    if (rawActionMatch) {
      matchedStr = rawActionMatch[0];
      jsonStr = rawActionMatch[1].trim();
    }
  }

  if (!jsonStr) {
    return { cleanContent: content, testAction: null };
  }

  // Multi-pass JSON cleaner & repairer
  let parsed: any = null;
  const attempts = [
    // Attempt 1: Direct JSON.parse
    () => JSON.parse(jsonStr),
    // Attempt 2: Strip comments and trailing commas
    () => {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(s);
    },
    // Attempt 3: Fix unescaped backslashes (common in LaTeX formulas)
    () => {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      s = s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(s);
    },
    // Attempt 4: Character-by-character string escape scanner
    () => {
      let cleaned = '';
      let inString = false;
      let isEscaped = false;
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (!inString) {
          if (char === '"') {
            inString = true;
            cleaned += char;
          } else {
            cleaned += char;
          }
        } else {
          if (isEscaped) {
            cleaned += char;
            isEscaped = false;
          } else if (char === '\\') {
            const next = jsonStr[i + 1];
            if (next && '\"\\/bfnrtu'.includes(next)) {
              cleaned += char;
              isEscaped = true;
            } else {
              cleaned += '\\\\';
            }
          } else if (char === '"') {
            inString = false;
            cleaned += char;
          } else if (char === '\n') {
            cleaned += '\\n';
          } else if (char === '\r') {
            cleaned += '\\r';
          } else if (char === '\t') {
            cleaned += '\\t';
          } else {
            cleaned += char;
          }
        }
      }
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    }
  ];

  for (const attempt of attempts) {
    try {
      parsed = attempt();
      if (parsed && typeof parsed === 'object') break;
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') {
    return { cleanContent: content, testAction: null };
  }

  // Remove the matched block cleanly from message content
  const cleanContent = matchedStr ? content.replace(matchedStr, '').trim() : content;

  // Handle DELETE_TEST
  if (parsed.action === 'DELETE_TEST') {
    const testObj = parsed.test || { 
      id: parsed.testId || 'test_to_delete', 
      title: parsed.testTitle || 'Test' 
    };
    return {
      cleanContent,
      testAction: {
        action: 'DELETE_TEST',
        summary: parsed.summary || `Delete test "${testObj.title || testObj.id}"`,
        test: testObj
      } as ParsedTestAction
    };
  }

  // Handle standard { action: 'CREATE_TEST' | 'UPDATE_TEST', test: { ... } }
  if (parsed.test && typeof parsed.test === 'object' && Array.isArray(parsed.test.questions)) {
    return { 
      cleanContent, 
      testAction: {
        action: parsed.action || 'CREATE_TEST',
        summary: parsed.summary,
        test: {
          ...parsed.test,
          questions: normalizeQuestions(parsed.test.questions)
        }
      } as ParsedTestAction 
    };
  }
  
  // Handle direct MathTest object { title, topic, questions: [...] }
  if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    return {
      cleanContent,
      testAction: {
        action: parsed.action || 'CREATE_TEST',
        summary: parsed.summary || `Generated ${parsed.questions.length}-question practice test`,
        test: {
          id: parsed.id || `test_${Date.now()}`,
          title: parsed.title || 'Session Practice Test',
          topic: parsed.topic || 'General Mathematics',
          difficulty: parsed.difficulty || 'Medium',
          timeLimitMinutes: parsed.timeLimitMinutes || 15,
          passingScorePercentage: parsed.passingScorePercentage || 70,
          description: parsed.description || 'Generated from session files and conversation context',
          questions: normalizeQuestions(parsed.questions)
        }
      } as ParsedTestAction
    };
  }

  return { cleanContent: content, testAction: null };
}

export function extractAppAction(content: string): { cleanContent: string; appAction: ParsedAppAction | null } {
  if (!content) return { cleanContent: '', appAction: null };

  const appActionBlockRegex = /```(?:app-action|app_action|appaction|json:app-action)\s*([\s\S]*?)```/i;
  const match = content.match(appActionBlockRegex);

  if (!match) {
    return { cleanContent: content, appAction: null };
  }

  const matchedStr = match[0];
  const jsonStr = match[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && parsed.type) {
      const cleanContent = content.replace(matchedStr, '').trim();
      return {
        cleanContent,
        appAction: parsed as ParsedAppAction
      };
    }
  } catch {
    try {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        const cleanContent = content.replace(matchedStr, '').trim();
        return {
          cleanContent,
          appAction: parsed as ParsedAppAction
        };
      }
    } catch {}
  }

  return { cleanContent: content, appAction: null };
}

export function extractQuestionsFromText(text: string): SessionStagedQuestion[] {
  if (!text) return [];
  const questions: SessionStagedQuestion[] = [];
  
  // Find questions structured like "Question 1:", "Q1:", "1. ", etc.
  const regex = /(?:^|\n)(?:#{1,4}\s*)?(?:(?:\*{1,2})?(?:Question|Q\.?)\s*(\d+)[:.]?(?:\*{1,2})?|(\d+)\.\s+)([\s\S]*?)(?=(?:\n(?:#{1,4}\s*)?(?:\*{1,2})?(?:Question|Q\.?)\s*\d+[:.]?(?:\*{1,2})?|\n\d+\.\s+)|$)/gi;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qNum = match[1] || match[2];
    const body = match[3]?.trim();
    if (!body || body.length < 15) continue;

    // Extract options
    const options: string[] = [];
    const optRegex = /(?:\n|^)(?:[A-D]\)|\([A-D]\)|[A-D]\.)\s+([^\n]+)/g;
    let optMatch;
    while ((optMatch = optRegex.exec(body)) !== null) {
      options.push(optMatch[1].trim());
    }

    // Extract correct answer
    let correctAnswer = '';
    const ansMatch = body.match(/(?:Correct\s+)?(?:Answer|Ans|Option)[:\s*]+(?:\(([A-D])\)|([A-D])|([^\n]+))/i);
    if (ansMatch) {
      correctAnswer = (ansMatch[1] || ansMatch[2] || ansMatch[3] || '').trim();
    }

    // Clean text by taking the part before options or answers
    let qText = body;
    const splitIndex = body.search(/(?:\n|^)(?:[A-D]\)|\([A-D]\)|[A-D]\.)\s+/);
    if (splitIndex !== -1) {
      qText = body.substring(0, splitIndex).trim();
    }

    questions.push({
      id: `staged_q_${Date.now()}_${questions.length + 1}`,
      questionNumber: qNum ? parseInt(qNum, 10) : questions.length + 1,
      text: qText || body,
      type: options.length >= 2 ? 'mcq' : 'numerical',
      options: options.length >= 2 ? options : undefined,
      correctAnswer: correctAnswer || (options.length > 0 ? options[0] : 'N/A'),
      explanation: body.includes('Solution') || body.includes('Explanation') 
        ? body.split(/(?:Solution|Explanation)[:\s*]+/i)[1]?.trim() 
        : undefined
    });
  }

  return questions;
}

const LOCAL_STORAGE_CHAT_SESSIONS_KEY = 'gemini_chat_sessions_v3';
const LOCAL_STORAGE_ACTIVE_SESSION_ID_KEY = 'gemini_active_session_id_v3';
const LOCAL_STORAGE_SETTINGS_KEY = 'gemini_user_settings_v1';

interface CodeExecutionResultBoxProps {
  outcome: string;
  output: string;
  isDarkMode: boolean;
}

export const CodeExecutionResultBox: React.FC<CodeExecutionResultBoxProps> = ({ outcome, output }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isSuccess = outcome === 'OUTCOME_OK' || outcome === 'OK';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#3c4043] bg-[#f8fafc] dark:bg-[#18191a] overflow-hidden my-3 shadow-2xs">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2 bg-slate-100/90 dark:bg-[#202124] border-b border-slate-200 dark:border-[#3c4043] cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            Execution Logs & Output
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isSuccess 
              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300' 
              : 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300'
          }`}>
            {outcome}
          </span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
      {isOpen && (
        <pre className="p-3.5 bg-[#0f172a] text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed max-h-60 whitespace-pre-wrap">
          {output || '(Execution completed with no standard console text output)'}
        </pre>
      )}
    </div>
  );
};

/**
 * Contextual suggestion generator that inspects AI-generated content, equations,
 * and Python matplotlib code to produce insightful mathematical and scientific follow-up prompts.
 */
export function getDynamicPlotSuggestions(
  pythonCode?: string, 
  messageText?: string
): { label: string; prompt: string }[] {
  const code = (pythonCode || '').toLowerCase();
  const text = (messageText || '').toLowerCase();
  const combined = `${code} ${text}`;

  // 0. AI Imagen 3 / Creative Image Generation (When no python code or creative prompt)
  if (!pythonCode || text.includes('generate image') || text.includes('imagen') || text.includes('photo') || text.includes('portrait') || text.includes('landscape') || text.includes('cyberpunk') || text.includes('painting')) {
    if (combined.includes('landscape') || combined.includes('mountain') || combined.includes('nature') || combined.includes('forest') || combined.includes('ocean') || combined.includes('sunset')) {
      return [
        {
          label: '✦ Cinematic 16:9 Landscape',
          prompt: 'Re-render this scenery in a widescreen 16:9 panoramic cinematic format with golden hour atmospheric lighting.'
        },
        {
          label: '✦ Aerial Drone Perspective',
          prompt: 'Generate an aerial drone high-altitude perspective of this landscape showing expansive terrain depth.'
        },
        {
          label: '✦ Night Sky & Aurora Borealis',
          prompt: 'Change the time of day to twilight night with glowing stars, nebula reflections, and aurora borealis.'
        },
        {
          label: '✦ Impressionist Oil Painting',
          prompt: 'Transform this landscape into an impressionist oil painting with visible palette knife textures and rich impasto strokes.'
        }
      ];
    }

    if (combined.includes('cyberpunk') || combined.includes('neon') || combined.includes('futuristic') || combined.includes('sci-fi') || combined.includes('robot')) {
      return [
        {
          label: '✦ Neon Rain Reflections',
          prompt: 'Enhance with rainy asphalt reflections, neon holographic signs, and moody cinematic volumetric fog.'
        },
        {
          label: '✦ Blade Runner Night Palette',
          prompt: 'Apply a retro-futuristic dark teal and magenta neon lighting scheme with high dramatic contrast.'
        },
        {
          label: '✦ Isometric 3D Cityscape',
          prompt: 'Re-render this futuristic concept as a high-detail isometric diorama miniature.'
        },
        {
          label: '✦ Anime Cyberpunk Aesthetic',
          prompt: 'Convert into a hand-drawn 90s retro anime art style with crisp line-art and cel shading.'
        }
      ];
    }

    if (combined.includes('portrait') || combined.includes('character') || combined.includes('person') || combined.includes('face')) {
      return [
        {
          label: '✦ Studio Bokeh Lighting',
          prompt: 'Apply high-end 85mm portrait lens depth of field with creamy background bokeh and dual-tone rim lighting.'
        },
        {
          label: '✦ Dramatic Chiaroscuro',
          prompt: 'Re-render with Rembrandt studio shadow lighting highlighting facial contours and intense expression.'
        },
        {
          label: '✦ Renaissance Oil Portrait',
          prompt: 'Render as a classical Renaissance museum oil portrait with rich varnish tones and dramatic drapery.'
        },
        {
          label: '✦ Concept Art Character Sheet',
          prompt: 'Create a full-body character design turnaround sheet with front, side, and action poses.'
        }
      ];
    }

    // General Creative Image Generation Suggestions
    return [
      {
        label: '✦ Enhance Lighting & Shadows',
        prompt: 'Enhance this image with dramatic volumetric lighting, realistic ambient occlusion, and richer shadows.'
      },
      {
        label: '✦ Cinematic Widescreen 16:9',
        prompt: 'Expand this scene into a cinematic 16:9 aspect ratio with widescreen composition and depth.'
      },
      {
        label: '✦ Photorealistic 8K Details',
        prompt: 'Increase fidelity to ultra-sharp 8K photorealistic textures, micro-details, and crisp focus.'
      },
      {
        label: '✦ Watercolor & Ink Art Style',
        prompt: 'Reimagine this visual as a delicate watercolor and ink wash painting on textured cotton paper.'
      }
    ];
  }

  // 1. Habit Dynamics / Psychological / Behavioral Model (e.g. sqrt(xy) surface)
  if (combined.includes('habit') || combined.includes('dynamics') || combined.includes('consistency') || combined.includes('diminishing return')) {
    return [
      {
        label: '✦ 90-Day Decay & Recovery',
        prompt: 'Simulate and plot a 90-day habit trajectory comparing consistent daily execution against a 2-day relapse with exponential recovery curve.'
      },
      {
        label: '✦ Iso-Growth Contours',
        prompt: 'Plot 2D contour iso-curves f(x, y) = c for this habit surface showing equal consistency vs effort trade-offs.'
      },
      {
        label: '✦ Gradient Flow & Momentum',
        prompt: 'Overlay 2D quiver gradient vectors ∇f(x, y) on the habit formation surface to visualize the path of maximum momentum.'
      },
      {
        label: '✦ Marginal Return Thresholds',
        prompt: 'Compute and plot the partial derivatives ∂f/∂x and ∂f/∂y to reveal where diminishing returns set in.'
      }
    ];
  }

  // 2. 3D Surface / Multivariable Calculus / Contour
  if (code.includes('projection=\'3d\'') || code.includes('plot_surface') || combined.includes('surface') || combined.includes('contour') || combined.includes('f(x, y)')) {
    return [
      {
        label: '✦ Rotate & Shaded Lighting',
        prompt: 'Re-render this 3D surface with a high-contrast viridis colormap, lighting source shading, and optimal elevation (35°) and azimuth (125°).'
      },
      {
        label: '✦ Critical Points & Gradient Streamlines',
        prompt: 'Mark all local extrema, saddle points, and roots with prominent 3D markers and draw gradient descent streamlines.'
      },
      {
        label: '✦ 2D Contour Map with Labels',
        prompt: 'Generate an accompanying 2D contour map showing labeled level curves and vector field arrows.'
      },
      {
        label: '✦ Orthogonal Cross-Sections',
        prompt: 'Plot cross-sectional slices through the surface at x=0, y=0, and the primary extremum.'
      }
    ];
  }

  // 3. Calculus / Derivatives / Integration / Differential Equations
  if (combined.includes('derivative') || combined.includes('integral') || combined.includes('calculus') || combined.includes('differential') || combined.includes('ode')) {
    return [
      {
        label: '✦ Tangent & Inflection Points',
        prompt: 'Add tangent lines, inflection point annotations, and root markers with labeled coordinates on this curve.'
      },
      {
        label: '✦ Area Under Curve (Integral)',
        prompt: 'Shade the definite integral area under the curve and display Riemann approximation rectangles.'
      },
      {
        label: '✦ Phase Portrait Dynamics',
        prompt: 'Plot the phase portrait (y vs dy/dt) to show orbital trajectories, fixed points, and stability.'
      },
      {
        label: '✦ First & Second Derivatives',
        prompt: 'Overlay f\'(x) and f\'\'(x) in dashed colored curves on the same plot with a dual y-axis.'
      }
    ];
  }

  // 4. Physics / Harmonic Motion / Waves / Electromagnetism
  if (combined.includes('wave') || combined.includes('oscillation') || combined.includes('harmonic') || combined.includes('physics') || combined.includes('frequency') || combined.includes('resonance')) {
    return [
      {
        label: '✦ Damped Resonance Envelope',
        prompt: 'Add an exponential decay envelope curve and annotate the damping ratio and Q factor on this oscillation plot.'
      },
      {
        label: '✦ FFT Spectrum Analysis',
        prompt: 'Compute and plot the Fast Fourier Transform (FFT) frequency spectrum corresponding to this signal.'
      },
      {
        label: '✦ Phase Angle & Lissajous',
        prompt: 'Plot the parametric Lissajous phase figure showing the relationship between position and velocity.'
      },
      {
        label: '✦ Energy Conservation Curves',
        prompt: 'Plot kinetic, potential, and total energy curves side-by-side to demonstrate conservation of energy.'
      }
    ];
  }

  // 5. Statistics / Probability / Distributions
  if (combined.includes('distribution') || combined.includes('histogram') || combined.includes('scatter') || combined.includes('std') || combined.includes('probability') || combined.includes('gaussian') || combined.includes('normal')) {
    return [
      {
        label: '✦ 95% Confidence & KDE',
        prompt: 'Overlay a smooth Kernel Density Estimate (KDE) curve with 68%, 95%, and 99.7% confidence interval bands.'
      },
      {
        label: '✦ Cumulative Distribution (CDF)',
        prompt: 'Plot the empirical cumulative distribution function (ECDF) alongside the probability density function.'
      },
      {
        label: '✦ Box Plot & Outliers',
        prompt: 'Add an inset box-and-whisker plot highlighting quartiles, median, and IQR outlier boundaries.'
      },
      {
        label: '✦ Monte Carlo Stochastic Runs',
        prompt: 'Run 1,000 Monte Carlo stochastic realizations and plot the 10th-90th percentile envelope.'
      }
    ];
  }

  // 6. Number Theory / Primes / Geometry / Sequences
  if (combined.includes('prime') || combined.includes('sieve') || combined.includes('fibonacci') || combined.includes('spiral') || combined.includes('geometry')) {
    return [
      {
        label: '✦ Polar / Ulam Spiral',
        prompt: 'Transform this sequence into a polar Ulam spiral plot highlighting diagonal residue rays.'
      },
      {
        label: '✦ Modulo Residue Heatmap',
        prompt: 'Create a 2D modular residue grid heatmap showing pattern symmetries.'
      },
      {
        label: '✦ Growth Asymptotic Curve',
        prompt: 'Compare this distribution against theoretical asymptotic bounds (e.g. n / ln(n) or Golden Ratio).'
      },
      {
        label: '✦ High-Density Scatter Grid',
        prompt: 'Render an extended high-density scatter view up to N=1000 with color-coded classification.'
      }
    ];
  }

  // 7. General Dynamic Contextual Extraction based on equations or concepts found in text
  const mathExprMatch = messageText?.match(/f\([^)]+\)\s*=\s*[^,\n.]+|y\s*=\s*[^,\n.]+|\$[^$]+\$/);
  const mathFormula = mathExprMatch ? mathExprMatch[0].replace(/\$/g, '').trim() : '';

  return [
    {
      label: '✦ Add Critical Annotations',
      prompt: mathFormula 
        ? `Highlight key mathematical roots, extrema, and asymptotic behavior for ${mathFormula} with callout arrows.`
        : 'Annotate all critical points, extrema, and intercepts on this figure with crisp callout arrows and numerical values.'
    },
    {
      label: '✦ 3D Surface Elevation',
      prompt: 'Re-render this data/function as an interactive 3D surface plot with elevation and azimuth view controls.'
    },
    {
      label: '✦ Viridis High-Contrast Map',
      prompt: 'Apply a publication-grade Viridis colormap with labeled contour level lines and a distinct colorbar.'
    },
    {
      label: '✦ Comparative Multi-Curve',
      prompt: 'Plot comparative parameter variations (e.g. k=0.5, k=1.0, k=2.0) on the same axes to demonstrate sensitivity.'
    }
  ];
}

interface GeneratedPlotArtifactProps {
  dataUri: string;
  index: number;
  pythonCode?: string;
  messageText?: string;
  isAiGenerated?: boolean;
  imagePrompt?: string;
  messageId?: string;
  onPreview: (uri: string) => void;
  onFollowUp: (prompt: string, targetMessageId?: string) => void;
  onEditWithAi?: (context: { code?: string; title: string; prompt?: string }) => void;
  onOpenCanvas?: () => void;
  onRegenerateVariation?: () => void;
}

export const GeneratedPlotArtifact: React.FC<GeneratedPlotArtifactProps> = ({ 
  dataUri, 
  index, 
  pythonCode,
  messageText,
  isAiGenerated,
  imagePrompt,
  messageId,
  onPreview, 
  onFollowUp,
  onEditWithAi,
  onOpenCanvas,
  onRegenerateVariation
}) => {
  const [showAiEditInput, setShowAiEditInput] = useState(false);
  const [customEditPrompt, setCustomEditPrompt] = useState('');
  const [isSavedToNotes, setIsSavedToNotes] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isImagen = !pythonCode || Boolean(isAiGenerated);

  const handleCopyImageUri = async () => {
    try {
      const imgNoteTitle = isImagen ? 'AI Generated Visual' : `Generated Plot ${index + 1}`;
      const success = await copyImageToClipboard(dataUri, imgNoteTitle, messageText || imagePrompt);
      if (success) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (e) {
      console.warn('Failed to copy image to clipboard:', e);
    }
  };

  const handleSaveImageToNotes = async () => {
    try {
      const imgNoteTitle = isImagen ? 'AI Generated Visual' : `Generated Plot ${index + 1}`;
      const noteContent = imagePrompt
        ? `### ${imgNoteTitle}\n\n**Prompt:** ${imagePrompt}\n\n![${imgNoteTitle}](${dataUri})`
        : `### ${imgNoteTitle}\n\n![${imgNoteTitle}](${dataUri})`;

      await saveSingleNoteToIDB({
        id: `note_img_${Date.now()}`,
        testId: 'notes_repository',
        content: noteContent,
        fileUrl: dataUri,
        fileName: `${imgNoteTitle}.png`,
        fileType: 'image',
        tag: 'formula',
        createdAt: new Date().toISOString()
      });
      setIsSavedToNotes(true);
      setTimeout(() => setIsSavedToNotes(false), 2500);
    } catch (e) {
      console.warn('Failed to save image to notes IDB:', e);
    }
  };

  const handleApplyEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEditPrompt.trim()) return;
    const promptToSend = `Please edit this image: ${customEditPrompt.trim()}. Maintain character and subject visual coherence while applying these modifications.`;
    onFollowUp(promptToSend, messageId);
    setShowAiEditInput(false);
    setCustomEditPrompt('');
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerateVariation) {
      onRegenerateVariation();
    } else {
      const basePrompt = imagePrompt || messageText || 'this image';
      onFollowUp(`Generate an alternative creative variation of ${basePrompt} with fresh visual perspectives and high compositional fidelity.`, messageId);
    }
  };

  return (
    <div className="group relative my-3 max-w-full sm:max-w-xl w-fit text-left">
      {/* Full Body Image only - clean rounded corners */}
      <div 
        onClick={() => {
          if (onOpenCanvas) {
            onOpenCanvas();
          } else {
            onPreview(dataUri);
          }
        }} 
        className="cursor-pointer relative overflow-hidden rounded-[26px] bg-slate-100 dark:bg-zinc-900 shadow-md transition-transform duration-200 hover:scale-[1.008]"
      >
        {dataUri && dataUri.trim() ? (
          <img 
            src={dataUri} 
            alt={isImagen ? 'Gemini AI Generated Visual' : `Generated Plot ${index + 1}`}
            className="w-full max-h-[520px] object-cover rounded-[26px]"
          />
        ) : null}
      </div>

      {/* Action Bar: Minimal buttons: Edit with AI, Save to Notes, Copy, Retry */}
      <div className="flex items-center gap-1 sm:gap-1.5 pt-2 select-none flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar max-w-full">
        {/* Code Button - Only displayed for executable Python plots, removed for image generation */}
        {!isImagen && Boolean(pythonCode) && (
          <button
            type="button"
            onClick={() => {
              if (onOpenCanvas) {
                onOpenCanvas();
              } else {
                onPreview(dataUri);
              }
            }}
            className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="View, edit, and copy code"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code</span>
          </button>
        )}

        {/* Edit with AI Button (Opens dedicated Visual Canvas Studio page) */}
        <button
          type="button"
          onClick={() => {
            if (onOpenCanvas) {
              onOpenCanvas();
            } else {
              setShowAiEditInput(!showAiEditInput);
            }
          }}
          className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          title="Edit this image with AI in dedicated visual canvas"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Edit<span className="hidden xs:inline sm:inline"> with AI</span></span>
        </button>

        {/* Save to Notes Button */}
        <button
          type="button"
          onClick={handleSaveImageToNotes}
          className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          title="Save image & code to Notes Repository"
        >
          {isSavedToNotes ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Bookmark className="w-3.5 h-3.5" />}
          <span>{isSavedToNotes ? 'Saved' : <>Save<span className="hidden xs:inline sm:inline"> to Notes</span></>}</span>
        </button>

        {/* Copy Image / URI Button */}
        <button
          type="button"
          onClick={handleCopyImageUri}
          className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          title="Copy Image Data / URI to Clipboard"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{isCopied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* Retry Button */}
        <button
          type="button"
          onClick={handleRegenerate}
          className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          title="Regenerate image variation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>

      {/* Minimal Inline Edit with AI input */}
      {showAiEditInput && (
        <form onSubmit={handleApplyEdit} className="mt-2.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <input
            type="text"
            value={customEditPrompt}
            onChange={(e) => setCustomEditPrompt(e.target.value)}
            placeholder="Describe edits (e.g. change lighting to sunset, add neon reflections)..."
            className="flex-1 px-3.5 py-2 text-xs rounded-full bg-slate-100 dark:bg-[#1e1f20] text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            autoFocus
          />
          <button
            type="submit"
            disabled={!customEditPrompt.trim()}
            className="px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            <Send className="w-3 h-3" />
            <span>Apply</span>
          </button>
        </form>
      )}
    </div>
  );
};

interface GeminiImageLightboxProps {
  src: string;
  onClose: () => void;
}

export const GeminiImageLightbox: React.FC<GeminiImageLightboxProps> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const imageRef = useRef<HTMLImageElement>(null);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'r' || e.key === 'R') handleReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scale, onClose]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.35, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => {
      const next = Math.max(prev - 0.35, 1);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale <= 1) return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || scale <= 1) return;
    if (e.touches.length === 1) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.15;
    let nextScale = scale;
    if (e.deltaY < 0) {
      nextScale = Math.min(scale + zoomFactor, 5);
    } else {
      nextScale = Math.max(scale - zoomFactor, 1);
    }
    
    if (nextScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
    setScale(nextScale);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center select-none overflow-hidden"
      onClick={onClose}
    >
      {/* Top Left Back Navigation Button */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-[120] px-3.5 py-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white flex items-center gap-2 text-xs font-semibold backdrop-blur-md cursor-pointer border border-zinc-700/60 active:scale-95 transition-all shadow-lg"
        title="Back to Chat (Esc)"
        aria-label="Back to Chat"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden xs:inline">Back to Chat</span>
      </button>

      {/* Immersive Image Display Area */}
      <div 
        className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            transformOrigin: 'center center'
          }}
          className="max-w-[90vw] max-h-[85vh] select-none"
        >
          {src && src.trim() ? (
            <img
              ref={imageRef}
              src={src}
              alt="Fullscreen Zoom View"
              className="w-full h-full object-contain pointer-events-none rounded-xs max-h-[85vh]"
            />
          ) : null}
        </div>
      </div>

      {/* Floating Sleek Controls Panel */}
      <div 
        className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 text-white flex items-center gap-4 shadow-2xl backdrop-blur-md transition-all z-[110]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          disabled={scale <= 1}
          className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-medium text-zinc-400 min-w-[40px] text-center select-none">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          disabled={scale >= 5}
          className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-zinc-800" />

        <button
          onClick={handleReset}
          disabled={scale === 1 && position.x === 0 && position.y === 0}
          className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Reset View (R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-800" />

        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-200 transition-colors cursor-pointer"
          title="Close Lightbox (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Instructions Banner */}
      {scale === 1 && position.x === 0 && position.y === 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none text-[11px] font-medium tracking-wide text-zinc-400 select-none bg-zinc-950/40 px-3 py-1.5 rounded-full backdrop-blur-xs">
          Scroll, pinch, or use buttons to zoom. Drag to pan.
        </div>
      )}
    </div>
  );
};

/**
 * Token-Lean App Context Architect:
 * Organizes application state into lean, categorized slices (~150 tokens base)
 * and performs on-demand targeted lookups ONLY when specifically requested.
 */
function buildTokenLeanAppContext(
  latestUserText: string,
  tests: MathTest[] = [],
  attempts: TestAttempt[] = [],
  userProfile?: UserProfile | null,
  localNotes: any[] = [],
  selectedTestId?: string | null
) {
  return buildThetaLeanAppContext(
    latestUserText,
    tests,
    attempts,
    userProfile,
    localNotes,
    selectedTestId
  );
}

export const GeminiChatbotView: React.FC<GeminiChatbotViewProps> = ({ 
  isDarkMode,
  tests = [],
  attempts = [],
  userProfile,
  initialPrompt,
  onClearInitialPrompt,
  onSaveTest,
  onDeleteTest,
  onStartTest,
  onEditTest,
  onNavigateTab
}) => {
  const [localNotes, setLocalNotes] = useState<any[]>([]);
  useEffect(() => {
    getAllNotesFromIDB().then((res) => {
      if (Array.isArray(res)) setLocalNotes(res);
    }).catch(() => {});
  }, []);
  // Chat Sessions State (Chat History) - Opens to clean Gemini-style Home Screen by default
  const [initialSetup] = useState(() => {
    const initialUid = auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
    let loaded: ChatSession[] = [];
    try {
      loaded = loadScopedChatSessions(initialUid) || [];
    } catch {}

    // Only real conversations with user messages are preserved in history
    const realSessions = (Array.isArray(loaded) ? loaded : []).filter(
      (s) => s && Array.isArray(s.messages) && s.messages.some((m) => m.role === 'user')
    );

    return {
      initialSessions: realSessions,
      initialActiveId: null as string | null
    };
  });

  const [sessions, setSessions] = useState<ChatSession[]>(initialSetup.initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSetup.initialActiveId);
  const [homeCloudSyncEnabled, setHomeCloudSyncEnabled] = useState<boolean>(false);

  const [activeStarterCategory, setActiveStarterCategory] = useState<string>('all');

  // Sidebar Visibility (Closed by default on all devices including desktop)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  // Active Session Lookup (null when on Home / New Chat screen)
  const activeSession = activeSessionId ? (sessions.find((s) => s.id === activeSessionId) || null) : null;
  const messages = activeSession ? activeSession.messages : [];

  // Model & Role Controls
  const [selectedModel, setSelectedModel] = useState<GeminiModelTier>(() => {
    const tier = activeSession?.modelTier;
    if (tier === 'gemini-3.8-flash' || tier === 'gemini-flash-latest' || tier === 'gemini-3.1-flash-lite' || tier === 'gemini-3.1-pro-preview') {
      return tier;
    }
    return 'gemini-3.1-flash-lite';
  });
  const [selectedRole, setSelectedRole] = useState<string>('general_tutor');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [showRoleConfig, setShowRoleConfig] = useState<boolean>(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  
  // Persistent Temperature across reloads and devices (Default: 0.7)
  const [temperature, setTemperature] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.temperature === 'number' && !isNaN(parsed.temperature)) {
          return parsed.temperature;
        }
      }
    } catch {}
    return 0.7;
  });

  // Chat inputs & states
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [savedToNotesMessageId, setSavedToNotesMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const [enableSearchGrounding, setEnableSearchGrounding] = useState<boolean>(false);
  const [enableCodeExecution, setEnableCodeExecution] = useState<boolean>(false);

  // File Upload State (Up to 10 files)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [selectedPreviewAttachment, setSelectedPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Message Editing States
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  const [currentUserUid, setCurrentUserUid] = useState<string | null>(() => {
    return auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
  });

  // Track Firebase Auth State for active cloud synchronization
  useEffect(() => {
    return onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUserUid(user ? user.uid : null);
      },
      (error) => {
        console.warn('Chatbot auth state error:', error);
      }
    );
  }, []);

  // Synchronize settings and chat sessions from the centralized syncHub (zero duplicate onSnapshot listeners)
  useEffect(() => {
    const unsubPref = syncHub.subscribe('preferences', (profile: any) => {
      if (!profile) return;
      if (profile.settings) {
        if (typeof profile.settings.temperature === 'number' && !isNaN(profile.settings.temperature)) {
          setTemperature(profile.settings.temperature);
        }
        if (profile.settings.aiModel) {
          const tier = profile.settings.aiModel;
          if (tier === 'gemini-3.8-flash' || tier === 'gemini-3.1-flash-lite' || tier === 'gemini-3.5-flash' || tier === 'gemini-3.7-flash' || tier === 'gemini-3.1-pro-preview') {
            setSelectedModel(tier as GeminiModelTier);
          }
        }
      }
    });

    return () => {
      unsubPref();
    };
  }, [currentUserUid]);

  // Save temperature and preferences to local storage immediately and debounced to Firestore
  useEffect(() => {
    try {
      const existing = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      const parsed = existing ? JSON.parse(existing) : {};
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify({
        ...parsed,
        temperature,
        selectedModel
      }));
    } catch {}

    if (currentUserUid && currentUserUid !== 'anonymous') {
      const timer = setTimeout(() => {
        saveUserSettingsToFirestore(currentUserUid, {
          temperature,
          aiModel: selectedModel
        }).catch(() => {});
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [temperature, selectedModel, currentUserUid]);

  // Custom visual confirm modal state to bypass sandboxed iframe restrictions
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const requestConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  const [loadingPrompt, setLoadingPrompt] = useState<string>('');
  const [loadingStartTime, setLoadingStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  interface EditingContext {
    type: 'table' | 'code' | 'test' | 'message' | 'image';
    content: string;
    language?: string;
    title?: string;
    targetMessageId?: string;
    prompt?: string;
  }
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null);
  const [editingTargetMessageId, setEditingTargetMessageId] = useState<string | null>(null);
  const [inlineEditingMessageId, setInlineEditingMessageId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState<string>('');
  const [viewingOriginalMessageId, setViewingOriginalMessageId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);

  // Gemini Live Table Canvas interactive modal state
  const [canvasTableMarkdown, setCanvasTableMarkdown] = useState<string | null>(null);
  const [canvasTableMessageId, setCanvasTableMessageId] = useState<string | null>(null);

  // Gemini Dedicated Test Canvas modal state
  const [canvasTestData, setCanvasTestData] = useState<{
    test: MathTest;
    actionData?: ParsedTestAction;
    messageId?: string;
  } | null>(null);

  // Gemini Dedicated Visual Image & Plot Canvas modal state
  const [canvasImageData, setCanvasImageData] = useState<{
    imageUrl: string;
    index?: number;
    pythonCode?: string;
    messageText?: string;
    imagePrompt?: string;
    messageId?: string;
  } | null>(null);

  const [isTestGeneratorModalOpen, setIsTestGeneratorModalOpen] = useState<boolean>(false);
  const [isImageGeneratorModalOpen, setIsImageGeneratorModalOpen] = useState<boolean>(false);
  const [isTableGeneratorModalOpen, setIsTableGeneratorModalOpen] = useState<boolean>(false);
  const [expandedPromptMessageIds, setExpandedPromptMessageIds] = useState<Set<string>>(new Set());

  const toggleExpandPrompt = (id: string) => {
    setExpandedPromptMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Centralized Back Navigation Stack for all Gemini Chatbot Actions ---
  // 1. Confirm dialog (highest priority overlay)
  useBackHandler({
    isOpen: Boolean(confirmModal && confirmModal.isOpen),
    onBack: () => setConfirmModal(null),
    priority: 50,
    id: 'gemini_confirm_modal'
  });

  // 2. Lightbox Zoom Preview
  useBackHandler({
    isOpen: Boolean(previewImageUrl),
    onBack: () => setPreviewImageUrl(null),
    priority: 45,
    id: 'gemini_image_lightbox'
  });

  // 3. Document / File Attachment Preview
  useBackHandler({
    isOpen: Boolean(selectedPreviewAttachment),
    onBack: () => setSelectedPreviewAttachment(null),
    priority: 40,
    id: 'gemini_attachment_preview'
  });

  // 4. Live Table Canvas Studio
  useBackHandler({
    isOpen: Boolean(canvasTableMarkdown),
    onBack: () => {
      setCanvasTableMarkdown(null);
      setCanvasTableMessageId(null);
    },
    priority: 30,
    id: 'gemini_canvas_table'
  });

  // 5. Dedicated Test Canvas Studio
  useBackHandler({
    isOpen: Boolean(canvasTestData),
    onBack: () => setCanvasTestData(null),
    priority: 30,
    id: 'gemini_canvas_test'
  });

  // 6. Visual Image & Plot Canvas Studio
  useBackHandler({
    isOpen: Boolean(canvasImageData),
    onBack: () => setCanvasImageData(null),
    priority: 30,
    id: 'gemini_canvas_image'
  });

  // 7. Session Test Generator Modal
  useBackHandler({
    isOpen: isTestGeneratorModalOpen,
    onBack: () => setIsTestGeneratorModalOpen(false),
    priority: 25,
    id: 'gemini_session_test_gen'
  });

  // 8. Session Image Generator Modal
  useBackHandler({
    isOpen: isImageGeneratorModalOpen,
    onBack: () => setIsImageGeneratorModalOpen(false),
    priority: 25,
    id: 'gemini_session_image_gen'
  });

  // 9. Session Table Generator Modal
  useBackHandler({
    isOpen: isTableGeneratorModalOpen,
    onBack: () => setIsTableGeneratorModalOpen(false),
    priority: 25,
    id: 'gemini_session_table_gen'
  });

  // 10. Role / Persona Settings Drawer
  useBackHandler({
    isOpen: showRoleConfig,
    onBack: () => setShowRoleConfig(false),
    priority: 20,
    id: 'gemini_role_config'
  });

  // 11. Model Selection Dropdown
  useBackHandler({
    isOpen: showModelDropdown,
    onBack: () => setShowModelDropdown(false),
    priority: 18,
    id: 'gemini_model_dropdown'
  });

  // 12. Message / Context Editing Mode
  useBackHandler({
    isOpen: Boolean(editingMessageId || inlineEditingMessageId || editingContext),
    onBack: () => {
      setEditingMessageId(null);
      setInlineEditingMessageId(null);
      setEditingContext(null);
    },
    priority: 15,
    id: 'gemini_message_editing'
  });

  // 13. History Sidebar Drawer (Mobile, Tablet, Desktop)
  useBackHandler({
    isOpen: isSidebarOpen,
    onBack: () => setIsSidebarOpen(false),
    priority: 12,
    id: 'gemini_sidebar_drawer'
  });

  // 14. Top-level Chatbot Tab Base Back Navigation (Returns to Tests Dashboard)
  useBackHandler({
    isOpen: Boolean(onNavigateTab),
    onBack: () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (onNavigateTab) {
        onNavigateTab('tests');
      }
    },
    priority: 1,
    id: 'gemini_chatbot_base'
  });

  // Cumulative Session Files Registry across all turns & staged files
  const sessionFiles = useMemo(() => {
    const filesMap = new Map<string, ChatAttachment>();
    if (activeSession?.sessionDocuments) {
      for (const doc of activeSession.sessionDocuments) {
        if (doc && doc.name && !filesMap.has(doc.id || doc.name)) {
          filesMap.set(doc.id || doc.name, {
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.size,
            data: doc.data,
            previewUrl: doc.mimeType?.startsWith('image/') ? doc.data : undefined
          });
        }
      }
    }
    if (activeSession?.messages) {
      for (const m of activeSession.messages) {
        if (m.attachments) {
          for (const a of m.attachments) {
            if (a && a.name && !filesMap.has(a.id || a.name)) {
              filesMap.set(a.id || a.name, a);
            }
          }
        }
      }
    }
    for (const a of attachments) {
      if (a && a.name && !filesMap.has(a.id || a.name)) {
        filesMap.set(a.id || a.name, a);
      }
    }
    return Array.from(filesMap.values());
  }, [activeSession?.sessionDocuments, activeSession?.messages, attachments]);

  const handleGenerateTestFromSession = (config: {
    title: string;
    topic: string;
    questionCount: number;
    difficulty: DifficultyLevel;
    questionType: 'all' | 'mcq' | 'numerical';
    selectedFileNames: string[];
    additionalNotes?: string;
  }) => {
    const fileListStr = config.selectedFileNames.length > 0 
      ? `from the uploaded document(s) [${config.selectedFileNames.join(', ')}] and our cumulative session context` 
      : `from our cumulative session context and problem discussions`;

    const typeDesc = config.questionType === 'mcq' 
      ? 'all multiple-choice questions (4 distinct options with LaTeX math)' 
      : config.questionType === 'numerical' 
      ? 'numerical calculation questions requiring exact steps and final numeric values' 
      : 'a balanced mix of multiple-choice and numerical practice questions';

    const promptText = `Please act as a top-tier academic professor and create a complete, rigorous ${config.questionCount}-question practice test on "${config.topic}" titled "${config.title}" ${fileListStr}.

Test Specifications:
- Difficulty Level: ${config.difficulty}
- Target Questions Count: Exactly ${config.questionCount}
- Question Format: ${typeDesc}
${config.additionalNotes ? `- Custom Directives & Focus Areas: ${config.additionalNotes}\n` : ''}
CRITICAL OUTPUT & STRUCTURAL REQUIREMENTS:
1. Formulate all ${config.questionCount} questions completely with non-repetitive problem statements covering core theorems, practical applications, edge cases, and derivations.
2. Render every mathematical formula, equation, variable, and expression using precise, standard LaTeX ($...$ for inline or $$...$$ for display equations).
3. For every Multiple Choice Question (MCQ):
   - Provide 4 distinct options (A, B, C, D).
   - Clearly designate the verified "correctAnswer" index/letter.
4. For every Numerical Question:
   - Provide clear units, steps, and target numerical accuracy.
5. Provide a step-by-step, comprehensive mathematical proof or solution derivation for every question.
6. Enclose the complete test structure in the \`\`\`test-action block format so it automatically renders inside the interactive test canvas.`;

    setEditingContext(null);
    setEditingTargetMessageId(null);
    handleSendMessage(promptText, undefined, undefined, undefined);
  };

  const handleGenerateImageFromModal = (config: {
    prompt: string;
    style: string;
    aspectRatio: string;
    includeContext: boolean;
    usePythonPlot: boolean;
  }) => {
    const contextStr = config.includeContext && sessionFiles.length > 0 
      ? ` referencing mathematical concepts and data from uploaded files [${sessionFiles.map(f => f.name).join(', ')}]` 
      : '';

    const promptText = `Generate and execute high-resolution Python code (using Matplotlib, NumPy, SciPy, or Seaborn) to plot and render a publication-quality figure for "${config.prompt}"${contextStr}.

Visual Plot Specifications:
- Style Theme: ${config.style}
- Canvas Aspect Ratio: ${config.aspectRatio}
- Rendering Standard: Ultra-crisp vector/raster graphic with high DPI, anti-aliased curves, clear grid lines, and optimal color contrast.
- Labels & Annotations: Use standard LaTeX formatting ($...$) for all title texts, legend labels, and axis markers (e.g. $f(x) = \int \sin(x) dx$).
- Projections: If 3D surface or parametric, use 3D projection axes (\`projection='3d'\`) with colorbars and light sources.

REQUIREMENTS:
1. Return both the rendered high-resolution plot figure image and the complete, fully executable Python plot script inside a \`\`\`python code block.
2. Ensure the code handles vectorization smoothly without runtime syntax or dimension errors.`;
    
    setEditingContext(null);
    setEditingTargetMessageId(null);
    handleSendMessage(promptText, undefined, undefined, undefined);
  };

  const handleGenerateTableFromModal = (config: {
    title: string;
    topic: string;
    tableType: string;
    rowCount: number;
    customColumns?: string;
    includeContext: boolean;
    additionalNotes?: string;
  }) => {
    const contextStr = config.includeContext && sessionFiles.length > 0 
      ? ` synthesized directly from session documents [${sessionFiles.map(f => f.name).join(', ')}] and chat context` 
      : '';
    const columnsStr = config.customColumns ? `\n- Column Layout: ${config.customColumns}` : '';
    const notesStr = config.additionalNotes ? `\n- Additional Directives: ${config.additionalNotes}` : '';

    const promptText = `Generate an exhaustive, highly structured Markdown comparison table titled "${config.title}" on the topic of "${config.topic}"${contextStr}.

Table Specifications:
- Category & Preset Structure: ${config.tableType}
- Target Rows: Exactly ${config.rowCount} rows of rich, high-density academic and technical data${columnsStr}${notesStr}

Formatting & Quality Requirements:
1. Render all formulas, variables, metrics, theorems, and identities using precise LaTeX notation ($...$).
2. Follow strict Markdown table format with proper column alignment and header delimiters (|---|).
3. Ensure every row provides unique, non-trivial, high-value insights, properties, parameters, and practical usage notes.
4. Follow the table with a concise "Key Conceptual Takeaways" summary emphasizing critical patterns and insights.`;

    setEditingContext(null);
    setEditingTargetMessageId(null);
    handleSendMessage(promptText, undefined, undefined, undefined);
  };

  // Gemini Live Talk mode & Speech Dictation managed via bulletproof Singleton speechEngine
  const [isLiveTalkActive, setIsLiveTalkActive] = useState(false);
  const [liveTalkStatus, setLiveTalkStatus] = useState<LiveTalkStatus>('listening');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVoiceResponseEnabled, setIsVoiceResponseEnabled] = useState(true);
  const [liveTalkTranscript, setLiveTalkTranscript] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [speechNotification, setSpeechNotification] = useState<{
    message: string;
    type: 'info' | 'warning' | 'error';
  } | null>(null);

  useEffect(() => {
    const handleSpeechNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: 'info' | 'warning' | 'error' }>;
      if (customEvent.detail?.message) {
        setSpeechNotification({
          message: customEvent.detail.message,
          type: customEvent.detail.type || 'info',
        });
      }
    };
    window.addEventListener('gemini-speech-notification', handleSpeechNotification);
    return () => {
      window.removeEventListener('gemini-speech-notification', handleSpeechNotification);
    };
  }, []);

  useEffect(() => {
    if (!speechNotification) return;
    const timer = setTimeout(() => {
      setSpeechNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [speechNotification]);

  const isLiveTalkActiveRef = useRef<boolean>(false);
  const isVoiceResponseEnabledRef = useRef<boolean>(true);
  const lastSentPromptRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const isSendingRef = useRef<boolean>(false);
  const handleSendMessageRef = useRef<any>(null);

  useEffect(() => {
    isLiveTalkActiveRef.current = isLiveTalkActive;
    isVoiceResponseEnabledRef.current = isVoiceResponseEnabled;
  }, [isLiveTalkActive, isVoiceResponseEnabled]);

  // Clean up speech engine on unmount
  useEffect(() => {
    return () => {
      speechEngine.stopAll();
    };
  }, []);

  // Send spoken prompt to Gemini with anti-duplicate locks and audio orchestration
  const sendLiveTalkPrompt = useCallback(async (promptText: string) => {
    const textToSend = promptText.trim();
    if (!textToSend) return;

    setLiveTalkStatus('sending');
    setLiveTalkTranscript('');

    try {
      const reply = await handleSendMessageRef.current?.(textToSend);
      if (isLiveTalkActiveRef.current) {
        if (typeof reply === 'string' && reply.trim()) {
          speechEngine.handleAssistantReply(reply, isVoiceResponseEnabledRef.current);
        } else {
          speechEngine.cancelCurrentTurn();
          setLiveTalkStatus('listening');
        }
      }
    } catch {
      if (isLiveTalkActiveRef.current) {
        speechEngine.cancelCurrentTurn();
        setLiveTalkStatus('listening');
      }
    }
  }, []);

  // Toggle Microphone Mute/Unmute in Live Talk mode
  const toggleLiveTalkMic = useCallback(() => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    speechEngine.setMuted(nextMuted);
  }, [isMicMuted]);

  // Toggle Gemini Voice Response or Stop current speech
  const toggleVoiceResponse = useCallback(() => {
    if (liveTalkStatus === 'speaking') {
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      setLiveTalkStatus('listening');
    } else {
      setIsVoiceResponseEnabled((prev) => !prev);
    }
  }, [liveTalkStatus]);

  // Stop & clean up Live Talk completely
  const stopLiveTalk = useCallback(() => {
    speechEngine.stopAll();
    setIsLiveTalkActive(false);
    isLiveTalkActiveRef.current = false;
    setIsMicMuted(false);
    setLiveTalkStatus('paused');
    setLiveTalkTranscript('');
  }, []);

  const toggleLiveTalkMode = () => {
    if (isLiveTalkActive) {
      stopLiveTalk();
    } else {
      if (isDictating) {
        speechEngine.stopAll();
        setIsDictating(false);
      }
      setIsLiveTalkActive(true);
      isLiveTalkActiveRef.current = true;
      setIsMicMuted(false);
      setLiveTalkStatus('listening');
      setLiveTalkTranscript('');

      speechEngine.startLiveTalk(
        (text) => setLiveTalkTranscript(text),
        (text) => sendLiveTalkPrompt(text),
        (status) => setLiveTalkStatus(status)
      );
    }
  };

  // Toggle Speech-to-Text Voice Dictation into textarea with single-instance clean stream
  const toggleSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    if (!isSpeechRecognitionSupported()) {
      setSpeechNotification({
        message: 'Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.',
        type: 'warning',
      });
      return;
    }

    if (isDictating) {
      speechEngine.stopAll();
      setIsDictating(false);
      return;
    }

    if (isLiveTalkActive) {
      stopLiveTalk();
    }

    const baseText = inputMessage.trim();
    setIsDictating(true);

    speechEngine.startDictation(
      baseText,
      (text) => setInputMessage(text),
      () => setIsDictating(false)
    );
  };

  // Listen for canvas modal open events dispatched by interactive tables, tests, and images
  useEffect(() => {
    const handleExpandTable = (e: Event) => {
      const customEvent = e as CustomEvent<{ markdown: string; title?: string; targetMessageId?: string }>;
      if (customEvent.detail?.markdown) {
        setCanvasTableMarkdown(customEvent.detail.markdown);
        setCanvasTableMessageId(customEvent.detail.targetMessageId || null);
      }
    };

    const handleOpenTestCanvas = (e: Event) => {
      const customEvent = e as CustomEvent<{ test: MathTest; actionData?: ParsedTestAction; messageId?: string }>;
      if (customEvent.detail?.test) {
        if (onEditTest) {
          onEditTest(customEvent.detail.test, { openAiPrompt: true });
        } else {
          setCanvasTestData(customEvent.detail);
        }
      }
    };

    const handleOpenImageCanvas = (e: Event) => {
      const customEvent = e as CustomEvent<{
        imageUrl: string;
        index?: number;
        pythonCode?: string;
        messageText?: string;
        imagePrompt?: string;
        messageId?: string;
      }>;
      if (customEvent.detail?.imageUrl) {
        setCanvasImageData(customEvent.detail);
      }
    };

    const handleSaveTableNote = async (e: Event) => {
      const customEvent = e as CustomEvent<{ markdown: string; title?: string }>;
      if (customEvent.detail?.markdown) {
        const text = customEvent.detail.markdown;
        const firstLine = text.split('\n')[0]?.replace(/\|/g, ' ').trim() || 'Table Note';
        const cleanFileName = (customEvent.detail.title || firstLine)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 30);
        
        try {
          await saveSingleNoteToIDB({
            id: `note_tbl_${Date.now()}`,
            testId: 'notes_repository',
            content: text,
            tag: 'concept',
            fileName: `${cleanFileName || 'table'}.md`,
            createdAt: new Date().toISOString()
          });
        } catch (err) {
          console.warn('Failed to save table note to IDB:', err);
        }
      }
    };

    const handleRetryTable = (e: Event) => {
      const customEvent = e as CustomEvent<{ markdown?: string; targetMessageId?: string }>;
      const targetId = customEvent.detail?.targetMessageId;
      if (targetId && activeSession?.messages) {
        const msgIdx = activeSession.messages.findIndex(m => m.id === targetId);
        if (msgIdx !== -1) {
          handleRetryMessage(msgIdx);
          return;
        }
      }
      handleRegenerateLast();
    };

    window.addEventListener('gemini-expand-table', handleExpandTable);
    window.addEventListener('gemini-open-table-canvas', handleExpandTable);
    window.addEventListener('gemini-open-test-canvas', handleOpenTestCanvas);
    window.addEventListener('gemini-open-image-canvas', handleOpenImageCanvas);
    window.addEventListener('gemini-save-table-note', handleSaveTableNote);
    window.addEventListener('gemini-retry-table', handleRetryTable);

    return () => {
      window.removeEventListener('gemini-expand-table', handleExpandTable);
      window.removeEventListener('gemini-open-table-canvas', handleExpandTable);
      window.removeEventListener('gemini-open-test-canvas', handleOpenTestCanvas);
      window.removeEventListener('gemini-open-image-canvas', handleOpenImageCanvas);
      window.removeEventListener('gemini-save-table-note', handleSaveTableNote);
      window.removeEventListener('gemini-retry-table', handleRetryTable);
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-resize textarea to expand up to three lines and handle scrolling
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      // 1 line is ~32px, 3 lines is ~72px (including py-1.5 padding)
      const maxHeight = 72;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [inputMessage]);

  // Live timer for loading state to show Gemini-style thought duration (throttled to 500ms for UI smoothness)
  useEffect(() => {
    let interval: any = null;
    if (isLoading && loadingStartTime > 0) {
      interval = setInterval(() => {
        setElapsedTime(Number(((Date.now() - loadingStartTime) / 1000).toFixed(1)));
      }, 500);
    } else {
      setElapsedTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, loadingStartTime]);

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    isSendingRef.current = false;
    if (isLiveTalkActiveRef.current) {
      speechEngine.cancelCurrentTurn();
      setLiveTalkStatus('listening');
      setLiveTalkTranscript('');
    }
  };

  // Register edit-element listener on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleEditElement = (e: Event) => {
        const customEvent = e as CustomEvent<EditingContext>;
        if (customEvent && customEvent.detail) {
          const detail = customEvent.detail;
          setEditingContext(detail);

          // If prompt was submitted directly (e.g. from inline edit on test card)
          if (detail.prompt && detail.prompt.trim()) {
            if (handleSendMessageRef.current) {
              handleSendMessageRef.current(
                detail.prompt.trim(),
                undefined,
                detail.targetMessageId,
                detail
              );
            }
          } else {
            // Scroll target message into view if specified
            if (detail.targetMessageId) {
              const el = document.getElementById(`msg-bubble-${detail.targetMessageId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }
            // Auto focus the input textarea
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }
        }
      };

      window.addEventListener('gemini-edit-element', handleEditElement as EventListener);
      return () => {
        window.removeEventListener('gemini-edit-element', handleEditElement as EventListener);
      };
    }
  }, []);

  const pushSessionToCloud = useCallback((sessionToPush: ChatSession, _isForce?: boolean) => {
    if (!sessionToPush) return;
    smartCoordinator.recordChatSession(sessionToPush, currentUserUid);
    saveScopedChatSessions(currentUserUid, sessions.map((s) => s.id === sessionToPush.id ? sessionToPush : s));
  }, [currentUserUid, sessions]);

  // Request PWA persistent storage on chatbot view mount
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
  }, []);

  const lastLoadedUidRef = useRef<string | null | undefined>(auth.currentUser?.uid || getCachedAuthUser()?.uid || null);
  const sessionsRef = useRef<ChatSession[]>(sessions);

  // Sync sessionsRef and stage chat archives for exit flush whenever sessions state updates
  useEffect(() => {
    sessionsRef.current = sessions;
    const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
    stageChatArchiveForExit(effectiveUid, sessions);
  }, [sessions, currentUserUid]);

  // Entry Hydration (Single-pass read on opening Theta - zero continuous read/write overhead while chatting)
  useEffect(() => {
    let isCancelled = false;
    const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
    const isSignedIn = Boolean(effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous');

    // 1-pass hydration from local IndexedDB and single Firestore getDoc read
    getAllChatSessionsFromIndexedDB(effectiveUid).then(async (idbSessions) => {
      if (isCancelled) return;

      const localList = Array.isArray(idbSessions) ? idbSessions : [];
      let finalSessions = localList;

      if (isSignedIn && effectiveUid) {
        try {
          finalSessions = await hydrateAndReconcileChatArchiveOnEntry(effectiveUid, localList);
        } catch (err) {
          console.warn('Failed to hydrate chat archive on entry:', err);
        }
      }

      if (isCancelled) return;

      if (finalSessions.length > 0) {
        const processed = finalSessions.map((s: any) => ({
          ...s,
          cloudSyncEnabled: Boolean(s.cloudSyncEnabled)
        }));

        const merged = smartCoordinator.reconcileChatSessions(effectiveUid, processed);
        saveScopedChatSessions(effectiveUid, merged);
        stageChatArchiveForExit(effectiveUid, merged);
        setSessions(merged);
      }
    }).catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [currentUserUid]);

  // Hook for tab close / page hide / exit / unmount to flush staged chat archive to Firestore in 1 single batch write
  useEffect(() => {
    const handleExit = () => {
      const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
      if (effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
        flushChatArchiveOnExit(effectiveUid, sessionsRef.current).catch(() => {});
        smartCoordinator.flushWriteQueue().catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleExit();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      handleExit();
      window.removeEventListener('beforeunload', handleExit);
      window.removeEventListener('pagehide', handleExit);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUserUid]);

  // Clean, isolated reload of scoped sessions when user authentication switches
  useEffect(() => {
    if (lastLoadedUidRef.current !== currentUserUid) {
      lastLoadedUidRef.current = currentUserUid;
      const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
      const scoped = loadScopedChatSessions(effectiveUid) || [];

      setSessions(scoped);

      const { activeChatSessionIdKey } = getScopedStorageKeys(effectiveUid);
      const savedActiveId = localStorage.getItem(activeChatSessionIdKey);
      if (savedActiveId && scoped.some((s) => s.id === savedActiveId)) {
        setActiveSessionId(savedActiveId);
      } else {
        setActiveSessionId(null);
      }
    }
  }, [currentUserUid]);

  // Keep local scoped storage & IndexedDB in sync with current sessions state
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
        saveScopedChatSessions(effectiveUid, sessions);
        const { activeChatSessionIdKey } = getScopedStorageKeys(effectiveUid);
        if (activeSessionId) {
          localStorage.setItem(activeChatSessionIdKey, activeSessionId);
        }
      } catch {}
    }
  }, [sessions, activeSessionId, currentUserUid]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cross-update listener for real-time local storage sync
  useEffect(() => {
    let isSyncing = false;
    const handleStorageOrCustomSync = () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        const effectiveUid = currentUserUid || auth.currentUser?.uid || getCachedAuthUser()?.uid || null;
        const loaded = loadScopedChatSessions(effectiveUid);
        if (!Array.isArray(loaded) || loaded.length === 0) return;

        setSessions((prev) => {
          const prevFingerprint = prev.map((s) => `${s.id}_${s.messages?.length || 0}_${s.updatedAt}`).join('|');
          const loadedFingerprint = loaded.map((s) => `${s.id}_${s.messages?.length || 0}_${s.updatedAt}`).join('|');

          if (prevFingerprint === loadedFingerprint) {
            return prev;
          }

          const mergedMap = new Map<string, any>();
          loaded.forEach((s) => {
            if (s && s.id) mergedMap.set(s.id, s);
          });
          prev.forEach((s) => {
            if (s && s.id && !mergedMap.has(s.id)) {
              mergedMap.set(s.id, s);
            }
          });

          const mergedList = Array.from(mergedMap.values());
          if (activeSessionId && !mergedList.some((s) => s.id === activeSessionId)) {
            if (mergedList.length > 0) {
              setActiveSessionId(mergedList[0].id);
            }
          }
          return mergedList;
        });
      } catch (err) {
        console.warn('Storage sync error:', err);
      } finally {
        setTimeout(() => {
          isSyncing = false;
        }, 150);
      }
    };

    window.addEventListener('storage', handleStorageOrCustomSync);
    window.addEventListener('gemini-chats-updated', handleStorageOrCustomSync);
    window.addEventListener('gemini-chats-cleared', handleStorageOrCustomSync);

    return () => {
      window.removeEventListener('storage', handleStorageOrCustomSync);
      window.removeEventListener('gemini-chats-updated', handleStorageOrCustomSync);
      window.removeEventListener('gemini-chats-cleared', handleStorageOrCustomSync);
    };
  }, [currentUserUid, activeSessionId]);

  // Helper to deduplicate messages by ID to prevent message duplicating UI glitches
  const sanitizeMessages = (msgs: ChatbotMessage[]): ChatbotMessage[] => {
    if (!Array.isArray(msgs)) return [];
    const seen = new Set<string>();
    const result: ChatbotMessage[] = [];
    for (const m of msgs) {
      if (!m || !m.id) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      result.push(m);
    }
    return result;
  };

  // Update session-level settings when changed with deterministic target session targeting
  const updateActiveSession = (
    updater: (prevSession: ChatSession) => ChatSession,
    targetSessionId?: string
  ) => {
    const targetId = targetSessionId || activeSessionId;
    let updatedSessionToSync: ChatSession | null = null;
    let updatedListToPersist: ChatSession[] = [];

    setSessions((prev) => {
      let found = false;
      const updatedList = prev.map((s) => {
        if (s.id === targetId) {
          found = true;
          const updated = updater(s);
          updated.messages = sanitizeMessages(updated.messages);
          updatedSessionToSync = updated;
          return updated;
        }
        return s;
      });

      if (!found) {
        if (!targetSessionId && prev.length > 0) {
          const updated = updater(prev[0]);
          updated.messages = sanitizeMessages(updated.messages);
          updatedSessionToSync = updated;
          updatedList[0] = updated;
          setActiveSessionId(updated.id);
        } else {
          const fallbackBase: ChatSession = {
            id: targetId,
            title: 'New Conversation',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            modelTier: selectedModel || 'gemini-3.8-flash',
            selectedTestId: null,
            cloudSyncEnabled: false,
            messages: []
          };
          const updated = updater(fallbackBase);
          updated.messages = sanitizeMessages(updated.messages);
          updatedSessionToSync = updated;
          updatedList.unshift(updated);
        }
      }

      updatedListToPersist = updatedList;
      return updatedList;
    });

    if (updatedListToPersist.length > 0) {
      saveScopedChatSessions(currentUserUid, updatedListToPersist);
      stageChatArchiveForExit(currentUserUid, updatedListToPersist);
    }
    if (updatedSessionToSync) {
      const effectiveUid = currentUserUid || auth.currentUser?.uid || null;
      smartCoordinator.recordChatSession(updatedSessionToSync, effectiveUid, false);
    }
  };

  // Scroll detection
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isFarFromBottom);
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const scrollToLastResponseStart = (messageId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`msg-bubble-${messageId}`);
      if (el) {
        // block: 'start' aligns the top of the message bubble with the top of the viewport/container.
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        scrollToBottom(true);
      }
    }, 100);
  };

  useEffect(() => {
    const isNewOrEmpty = !activeSession?.messages || activeSession.messages.length === 0 || !activeSession.messages.some(m => m.role === 'user');
    if (isNewOrEmpty) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    } else {
      scrollToBottom(false);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [activeSessionId, activeSession?.messages?.length]);

  // Navigate to Gemini-style New Chat Home Screen
  const handleNewChat = () => {
    setActiveSessionId(null);
    setHomeCloudSyncEnabled(false);
    setAttachments([]);
    setInputMessage('');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    }
  };

  // Toggle Cloud Sync for active session or Home Screen
  const handleToggleCloudSync = () => {
    if (!activeSession) {
      setHomeCloudSyncEnabled((prev) => !prev);
      return;
    }
    const nextState = !activeSession.cloudSyncEnabled;
    const effectiveUid = currentUserUid || auth.currentUser?.uid || null;
    const isSignedIn = Boolean(effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous');

    let updatedSessionToPush: ChatSession | null = null;
    let nextList: ChatSession[] = [];

    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id === activeSession.id) {
          const updatedSession: ChatSession = {
            ...s,
            cloudSyncEnabled: nextState,
            _syncStatus: nextState && isSignedIn ? 'synced' : 'synced',
            updatedAt: Date.now(),
          };
          updatedSessionToPush = updatedSession;
          return updatedSession;
        }
        return s;
      });
      nextList = updated;
      saveScopedChatSessions(effectiveUid, updated);
      stageChatArchiveForExit(effectiveUid, updated);
      return updated;
    });

    if (updatedSessionToPush && effectiveUid && isSignedIn) {
      smartCoordinator.recordChatSession(updatedSessionToPush, effectiveUid, true);
      syncChatArchiveNow(effectiveUid, nextList).catch(() => {});
    }
  };

  // Toggle Cloud Sync for any specific session (e.g. from chat history)
  const handleToggleSessionCloudSync = (sessionId: string) => {
    const effectiveUid = currentUserUid || auth.currentUser?.uid || null;
    const isSignedIn = Boolean(effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous');

    let updatedSessionToPush: ChatSession | null = null;
    let nextList: ChatSession[] = [];

    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id === sessionId) {
          const nextState = !s.cloudSyncEnabled;
          const updatedSession: ChatSession = {
            ...s,
            cloudSyncEnabled: nextState,
            _syncStatus: nextState && isSignedIn ? 'synced' : 'synced',
            updatedAt: Date.now(),
          };
          updatedSessionToPush = updatedSession;
          return updatedSession;
        }
        return s;
      });
      nextList = updated;
      saveScopedChatSessions(effectiveUid, updated);
      stageChatArchiveForExit(effectiveUid, updated);
      return updated;
    });

    if (updatedSessionToPush && effectiveUid && isSignedIn) {
      smartCoordinator.recordChatSession(updatedSessionToPush, effectiveUid, true);
      syncChatArchiveNow(effectiveUid, nextList).catch(() => {});
    }
  };

  // Delete chat session
  const handleDeleteSession = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    requestConfirmation(
      'Delete Conversation',
      'Are you sure you want to delete this chat conversation? All messages within it will be permanently removed.',
      () => {
        smartCoordinator.deleteChatSession(id, currentUserUid);

        if (sessions.length <= 1) {
          const resetMsg: ChatbotMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: `👋 What would you like to explore or solve today?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelUsed: selectedModel,
            roleUsed: PRESET_ROLES.find((r) => r.id === selectedRole)?.name || 'Gemini'
          };
          updateActiveSession((s) => ({
            ...s,
            title: 'New Conversation',
            messages: [resetMsg],
            updatedAt: Date.now()
          }));
          return;
        }
        const filtered = sessions.filter((s) => s.id !== id);
        setSessions(filtered);
        saveScopedChatSessions(currentUserUid, filtered);
        if (activeSessionId === id) {
          setActiveSessionId(filtered[0].id);
        }
      }
    );
  };

  // Delete all chat history
  const handleDeleteAllSessions = () => {
    requestConfirmation(
      'Clear All Chat History',
      'Are you sure you want to delete ALL conversations in your chat history? This action is permanent and cannot be undone.',
      () => {
        // Delete all sessions via smart coordinator
        sessions.forEach((s) => {
          smartCoordinator.deleteChatSession(s.id, currentUserUid);
        });

        const freshSession: ChatSession = {
          id: `session_${Date.now()}`,
          title: 'New Conversation',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          modelTier: selectedModel,
          messages: [
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: `👋 **Chat history cleared.** What would you like to explore or solve today?`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              modelUsed: selectedModel,
              roleUsed: PRESET_ROLES.find((r) => r.id === selectedRole)?.name || 'Gemini'
            }
          ]
        };
        saveScopedChatSessions(currentUserUid, [freshSession]);
        setSessions([freshSession]);
        setActiveSessionId(freshSession.id);
      }
    );
  };

  // Delete entire current chat session or clear
  const handleDeleteCurrentChat = () => {
    requestConfirmation(
      'Delete Entire Conversation',
      'Are you sure you want to delete this entire chat conversation?',
      () => {
        if (sessions.length > 1) {
          const idToDelete = activeSessionId;
          const filtered = sessions.filter((s) => s.id !== idToDelete);
          setSessions(filtered);
          setActiveSessionId(filtered[0].id);

          // Delete through smart coordinator
          smartCoordinator.deleteChatSession(idToDelete, currentUserUid);
        } else {
          const resetMsg: ChatbotMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: `👋 **Chat conversation deleted.** What would you like to explore next?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelUsed: selectedModel,
            roleUsed: PRESET_ROLES.find((r) => r.id === selectedRole)?.name || 'Tutor'
          };
          updateActiveSession((s) => ({
            ...s,
            title: 'New Conversation',
            messages: [resetMsg],
            updatedAt: Date.now()
          }));
        }
      }
    );
  };

  // Delete an individual message
  const handleDeleteMessage = (msgId: string) => {
    requestConfirmation(
      'Delete Message',
      'Are you sure you want to delete this message from the conversation thread?',
      () => {
        updateActiveSession((s) => {
          const remaining = s.messages.filter((m) => m.id !== msgId);
          if (remaining.length === 0) {
            remaining.push({
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: `👋 What would you like to explore or solve today?`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              modelUsed: selectedModel,
              roleUsed: PRESET_ROLES.find((r) => r.id === selectedRole)?.name || 'Gemini'
            });
          }
          const updatedSession = {
            ...s,
            messages: remaining,
            updatedAt: Date.now()
          };
          if (s.cloudSyncEnabled) {
            pushSessionToCloud(updatedSession, true);
          }
          return updatedSession;
        });
      }
    );
  };

  // Clear messages in current session
  const handleClearCurrentChat = () => {
    requestConfirmation(
      'Clear All Messages',
      'Are you sure you want to clear all messages in this conversation?',
      () => {
        const resetMsg: ChatbotMessage = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: `👋 **Chat history cleared.** What would you like to explore next?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: selectedModel,
          roleUsed: PRESET_ROLES.find((r) => r.id === selectedRole)?.name || 'Tutor'
        };
        const updated = {
          ...activeSession,
          messages: [resetMsg],
          updatedAt: Date.now()
        };
        updateActiveSession(() => updated);
        if (activeSession.cloudSyncEnabled) {
          pushSessionToCloud(updated, true);
        }
      }
    );
  };

  // File Upload Handlers (Up to 10 files)
  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (attachments.length + files.length > 10) {
      alert(`You can attach up to 10 files in total. You currently have ${attachments.length} attached and selected ${files.length}.`);
    }

    const availableSlots = 10 - attachments.length;
    const filesToProcess = files.slice(0, availableSlots);

    filesToProcess.forEach((file) => {
      if (file.size > 15 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 15MB size limit.`);
        return;
      }

      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';

      reader.onload = () => {
        const result = reader.result as string;
        const newAttachment: ChatAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'text/plain',
          data: result,
          previewUrl: isImage ? result : undefined
        };

        setAttachments((prev) => {
          if (prev.length >= 10) return prev;
          return [...prev, newAttachment];
        });
      };

      if (isImage || isPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Send Message Handler
  const handleSendMessage = async (
    customPrompt?: string,
    options?: {
      isRetry?: boolean;
      overrideModel?: GeminiModelTier;
      overrideMessages?: ChatbotMessage[];
    },
    explicitTargetMessageId?: string,
    explicitEditingContext?: EditingContext
  ) => {
    const textToSend = (customPrompt !== undefined ? customPrompt : inputMessage).trim();
    if ((!textToSend && attachments.length === 0) || isLoading) return;

    // Safety recovery: if not loading, ensure sending lock is cleared
    if (!isLoading && isSendingRef.current) {
      isSendingRef.current = false;
    }

    if (isSendingRef.current) return;

    // Guard against duplicate rapid repetitive message dispatch
    const now = Date.now();
    if (
      !options?.isRetry &&
      textToSend &&
      attachments.length === 0 &&
      lastSentPromptRef.current.text.trim().toLowerCase() === textToSend.trim().toLowerCase() &&
      now - lastSentPromptRef.current.time < 800
    ) {
      console.warn('Prevented duplicate repetitive message dispatch:', textToSend);
      return;
    }
    isSendingRef.current = true;
    lastSentPromptRef.current = { text: textToSend, time: now };

    setInputMessage('');

    const activeEditingContext = explicitEditingContext || editingContext;
    setEditingContext(null);
    const targetMessageId = explicitTargetMessageId || activeEditingContext?.targetMessageId;
    if (targetMessageId) {
      setEditingTargetMessageId(targetMessageId);
    }

    let sendingSessionId = activeSessionId;
    let targetSessionObj = activeSession;

    // If on Home Screen (activeSessionId is null), instantiate a new conversation session now
    if (!sendingSessionId || !targetSessionObj) {
      const newId = `session_${Date.now()}`;
      const effectiveUid = currentUserUid || auth.currentUser?.uid || null;
      const isSignedIn = Boolean(effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous');
      const autoTitle = textToSend ? textToSend.slice(0, 36) + (textToSend.length > 36 ? '...' : '') : 'New Conversation';

      const freshSession: ChatSession = {
        id: newId,
        title: autoTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelTier: selectedModel || 'gemini-3.8-flash',
        selectedTestId: null,
        cloudSyncEnabled: homeCloudSyncEnabled && isSignedIn,
        messages: [],
        sessionDocuments: []
      };

      sendingSessionId = newId;
      targetSessionObj = freshSession;

      setSessions((prev) => [freshSession, ...prev]);
      setActiveSessionId(newId);
    }

    let updatedMessages: ChatbotMessage[];
    if (options?.overrideMessages) {
      updatedMessages = options.overrideMessages;
    } else if (options?.isRetry) {
      updatedMessages = (targetSessionObj.messages || []).filter((m) => !m.isError);
    } else if (targetMessageId) {
      // In targeted edit mode, do not append a detached user message at the bottom
      updatedMessages = [...(targetSessionObj.messages || [])];
    } else {
      const userMessageId = `msg_${Date.now()}`;
      const newUserMessage: ChatbotMessage = {
        id: userMessageId,
        role: 'user',
        content: textToSend || (attachments.length > 0 ? `[Attached ${attachments.length} file(s)]` : ''),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachments: attachments.length > 0 ? [...attachments] : undefined
      };
      updatedMessages = [...(targetSessionObj.messages || []), newUserMessage];
    }

    // Accumulate documents into sessionDocuments
    const currentDocs = targetSessionObj.sessionDocuments || [];
    const newDocs: SessionDocument[] = attachments.map((att) => ({
      id: att.id,
      name: att.name,
      mimeType: att.mimeType,
      size: att.size,
      data: att.data,
      uploadedAt: Date.now()
    })).filter((nd) => !currentDocs.some((cd) => cd.name === nd.name && cd.size === nd.size));

    const updatedSessionDocs = [...currentDocs, ...newDocs].slice(-20);

    // Generate auto-title for new conversation if first user message or if title is short/generic greeting
    let updatedTitle = targetSessionObj.title;
    const isGenericTitle = !targetSessionObj.title || targetSessionObj.title === 'New Conversation' || targetSessionObj.title.length <= 4;
    if ((targetSessionObj.messages.length <= 1 || isGenericTitle) && textToSend && !targetMessageId) {
      updatedTitle = textToSend.slice(0, 36) + (textToSend.length > 36 ? '...' : '');
    }

    updateActiveSession((s) => ({
      ...s,
      title: updatedTitle,
      messages: updatedMessages,
      sessionDocuments: updatedSessionDocs,
      updatedAt: Date.now()
    }), sendingSessionId);

    setInputMessage('');
    const sentAttachments = [...attachments];
    setAttachments([]);
    setLoadingPrompt(textToSend);
    setLoadingStartTime(Date.now());
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let wasTimedOut = false;
    const safetyTimeoutId = setTimeout(() => {
      wasTimedOut = true;
      try {
        controller.abort();
      } catch {}
    }, 120000);

    if (targetMessageId) {
      setTimeout(() => {
        const el = document.getElementById(`msg-bubble-${targetMessageId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } else {
      setTimeout(() => scrollToBottom(true), 50);
    }

    let hasScrolledToResponse = false;
    const effectiveModel = options?.overrideModel || selectedModel;
    if (options?.overrideModel && options.overrideModel !== selectedModel) {
      setSelectedModel(options.overrideModel);
    }

    try {
      // Support stateful context with clean history across the session (excluding error cards)
      const validMessages = updatedMessages.filter((m) => !m.isError && m.roleUsed !== 'System Status');
      const recentMessages = validMessages.slice(-30);
      const historyPayload = recentMessages.map((m) => {
        return {
          role: m.role,
          content: m.content,
          attachments: m.attachments?.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            data: a.data
          }))
        };
      });

      if (activeEditingContext || targetMessageId) {
        let originalContent = activeEditingContext?.content;
        let itemType = activeEditingContext?.type || 'content';

        if (!originalContent && targetMessageId) {
          const targetMsg = (targetSessionObj?.messages || []).find((m) => m.id === targetMessageId);
          if (targetMsg) {
            originalContent = targetMsg.content;
            if ((targetMsg.generatedImages && targetMsg.generatedImages.length > 0) || targetMsg.isAiGeneratedImage) {
              itemType = 'image';
            } else if (targetMsg.content.includes('```test-action')) {
              itemType = 'test';
            } else if (targetMsg.content.includes('|---') || targetMsg.content.includes('| -')) {
              itemType = 'table';
            } else if (targetMsg.executableCode && targetMsg.executableCode.length > 0) {
              itemType = 'code';
            } else {
              itemType = 'response';
            }
          }
        }

        const isImage = itemType === 'image' || itemType === 'visual image' || itemType === 'visual_image';
        const targetedPrompt = isImage
          ? `[TARGETED IMAGE EDIT MODE]
You are asked to EDIT and generate an updated visual image.
Original image description/context: "${activeEditingContext?.title || originalContent || 'AI generated artwork'}"
User's editing instructions: "${textToSend}"

MANDATORY INSTRUCTIONS:
1. Generate an updated visual image incorporating the user's editing instructions.
2. DO NOT output Python code or Matplotlib scripts. The image will be rendered visually.`
          : `[TARGETED EDIT MODE]
You are asked to EDIT a specific previously generated ${itemType}.
${originalContent ? `Here is the original ${itemType} content:\n\`\`\`\n${originalContent}\n\`\`\`\n` : ''}
User's prompt instructing how to edit or modify this ${itemType}:
"${textToSend}"

MANDATORY INSTRUCTIONS:
1. Focus your attention entirely on editing this specific ${itemType}. Do NOT regenerate unrelated blocks.
2. Modify the structure, math, layout or content strictly in response to the user's prompt.
3. If it is a table, output a single beautifully revised markdown table.
4. If it is a code snippet or visual plot, output the single revised code block.
5. If it is a test (or contains a \`\`\`test-action block), return the updated test in the standard \`\`\`test-action block format with action "UPDATE_TEST" preserving the original test ID so it remains fully interactive and properly updates in the library. Include all questions with detailed step-by-step LaTeX explanations.
6. Give a concise explanation of what was changed and output the revised element cleanly.`;

        historyPayload.push({
          role: 'user',
          content: targetedPrompt,
          attachments: sentAttachments.length > 0 ? sentAttachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) : undefined
        });
      }

      const activeRoleObj = PRESET_ROLES.find((r) => r.id === selectedRole) || PRESET_ROLES[0];

      // Use lower temperature for test/exam generation to ensure exact mathematical validity and option letters
      const isTestGeneration = textToSend.toLowerCase().includes('test') || 
                               textToSend.toLowerCase().includes('quiz') || 
                               textToSend.includes('test-action');
      const effectiveTemperature = isTestGeneration ? 0.35 : temperature;

      // Build token-lean categorized app context with on-demand targeted lookup
      const appContext = buildTokenLeanAppContext(
        textToSend,
        tests,
        attempts,
        userProfile,
        localNotes,
        targetSessionObj?.selectedTestId || null
      );

      const response = await fetch('/api/gemini/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: historyPayload,
          model: effectiveModel,
          modelTier: effectiveModel,
          selectedModel: effectiveModel,
          role: selectedRole,
          rolePreset: selectedRole,
          customInstruction: customInstruction.trim() || undefined,
          customSystemInstruction: customInstruction.trim() || undefined,
          temperature: effectiveTemperature,
          selectedTestId: targetSessionObj?.selectedTestId || null,
          appContext,
          testLibrary: Array.isArray(tests)
            ? tests.slice(0, 10).map((t) => ({
                id: t.id,
                title: t.title,
                topic: t.topic || 'Math',
                difficulty: t.difficulty || 'Medium',
                totalQuestions: t.questions?.length || 0,
                questions: (targetSessionObj?.selectedTestId === t.id || tests.length <= 2)
                  ? (t.questions || []).slice(0, 10).map((q: any) => ({
                      id: q.id,
                      text: q.text,
                      type: q.type,
                      options: q.options,
                      correctAnswer: q.correctAnswer,
                      explanation: q.explanation || q.solution
                    }))
                  : undefined
              }))
            : [],
          testAttempts: Array.isArray(attempts)
            ? attempts.slice(0, 10).map((a) => {
                const incorrectQuestions: any[] = [];
                if (a.answers && typeof a.answers === 'object') {
                  Object.entries(a.answers).forEach(([qId, ans]: [string, any]) => {
                    if (!ans.isCorrect) {
                      // Find question text if available
                      const parentTest = tests?.find((t) => t.id === a.testId);
                      const matchedQ = parentTest?.questions?.find((q) => q.id === qId);
                      incorrectQuestions.push({
                        id: qId,
                        text: matchedQ?.text || `Question ${qId}`,
                        correctAnswer: matchedQ?.correctAnswer || 'N/A',
                        selectedAnswer: ans.selectedOption || 'Skipped'
                      });
                    }
                  });
                }
                return {
                  testId: a.testId,
                  testTitle: a.testTitle,
                  testTopic: a.testTopic || 'Math',
                  score: a.score,
                  totalPoints: a.totalPoints || a.score,
                  totalQuestions: a.totalPoints || a.score,
                  percentage: a.percentage,
                  passed: a.passed,
                  timeSpentSeconds: a.timeSpentSeconds || 0,
                  incorrectQuestions: incorrectQuestions.slice(0, 5)
                };
              })
            : [],
          sessionDocuments: updatedSessionDocs,
          stagedQuestions: (targetSessionObj?.stagedQuestions || []).slice(0, 25)
        })
      });

      clearTimeout(safetyTimeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        const msg = errData.error || errData.message || `Server error (Status ${status})`;
        const customErr: any = new Error(msg);
        customErr.status = status;
        customErr.data = errData;
        throw customErr;
      }

      const data = await response.json();
      const assistantText = data.reply || data.text || data.content || 'No response text received from Gemini.';

      const newAssistantId = `msg_${Date.now()}`;
      const newAssistantMessage: ChatbotMessage = {
        id: newAssistantId,
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || effectiveModel,
        roleUsed: activeRoleObj.name,
        executableCode: data.executableCode || [],
        codeExecutionResults: data.codeExecutionResults || [],
        generatedImages: data.generatedImages || [],
        parts: data.parts || [],
        isAiGeneratedImage: data.isAiGeneratedImage,
        imagePrompt: data.imagePrompt,
        isNotice: data.isNotice,
        noticeMessage: data.noticeMessage
      };

      // Stateful test question extraction and cumulative staging
      const { testAction } = extractTestAction(assistantText);
      let updatedStaged = [...(targetSessionObj?.stagedQuestions || [])];

      if (testAction?.test?.questions && Array.isArray(testAction.test.questions)) {
        testAction.test.questions.forEach((q, qIdx) => {
          const matchIdx = updatedStaged.findIndex((sq) => sq.text.trim().toLowerCase() === q.text.trim().toLowerCase());
          const stagedItem: SessionStagedQuestion = {
            id: q.id || `staged_${Date.now()}_${qIdx}`,
            questionNumber: matchIdx >= 0 ? updatedStaged[matchIdx].questionNumber : updatedStaged.length + 1,
            text: q.text,
            type: q.type || 'mcq',
            options: q.options || [],
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || q.solution || ''
          };
          if (matchIdx >= 0) {
            updatedStaged[matchIdx] = stagedItem;
          } else {
            updatedStaged.push(stagedItem);
          }
        });
      } else {
        const extracted = extractQuestionsFromText(assistantText);
        if (extracted.length > 0) {
          extracted.forEach((eq) => {
            const exists = updatedStaged.some((sq) => sq.text.trim().toLowerCase() === eq.text.trim().toLowerCase());
            if (!exists) {
              updatedStaged.push({
                ...eq,
                questionNumber: updatedStaged.length + 1
              });
            }
          });
        }
      }

      // Live update open canvas modals if active
      if (testAction?.test) {
        setCanvasTestData((prev) => {
          if (!prev) return null;
          let finalTest = testAction.test;
          if ((testAction.action === 'UPDATE_TEST' || prev.test) && prev.test) {
            const existingQs = prev.test.questions || [];
            const proposedQs = testAction.test.questions || [];
            if (proposedQs.length >= existingQs.length && existingQs.length > 0) {
              finalTest = { ...prev.test, ...testAction.test };
            } else if (existingQs.length > 0) {
              const merged = [...existingQs];
              for (const pq of proposedQs) {
                const matchIdx = merged.findIndex(
                  (eq) => eq.id === pq.id || (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
                );
                if (matchIdx >= 0) merged[matchIdx] = { ...merged[matchIdx], ...pq };
                else merged.push(pq);
              }
              finalTest = { ...prev.test, ...testAction.test, questions: merged };
            }
          }
          return {
            ...prev,
            test: finalTest,
            actionData: testAction
          };
        });
      }
      if (data.generatedImages && data.generatedImages.length > 0) {
        setCanvasImageData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            imageUrl: data.generatedImages[0],
            imagePrompt: data.imagePrompt || prev.imagePrompt,
            pythonCode: data.executableCode?.[0]?.code || prev.pythonCode
          };
        });
      }
      const tableMatch = assistantText.match(/(?:^|\n)\s*(\|[^\n]+\|\r?\n\|[-:\s|+]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/);
      if (tableMatch) {
        setCanvasTableMarkdown((prev) => (prev ? (tableMatch[1] || tableMatch[0]).trim() : prev));
      }

      if (targetMessageId && targetSessionObj?.messages) {
        const targetIdx = targetSessionObj.messages.findIndex((m) => m.id === targetMessageId);
        if (targetIdx !== -1) {
          const origMsg = targetSessionObj.messages[targetIdx];
          const updatedTargetMessage: ChatbotMessage = {
            ...origMsg,
            content: assistantText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelUsed: data.modelUsed || effectiveModel,
            roleUsed: activeRoleObj.name,
            executableCode: data.executableCode || origMsg.executableCode || [],
            codeExecutionResults: data.codeExecutionResults || origMsg.codeExecutionResults || [],
            generatedImages: data.generatedImages || origMsg.generatedImages || [],
            parts: data.parts || origMsg.parts || [],
            isAiGeneratedImage: data.isAiGeneratedImage !== undefined ? data.isAiGeneratedImage : origMsg.isAiGeneratedImage,
            imagePrompt: data.imagePrompt || origMsg.imagePrompt,
            isNotice: data.isNotice,
            noticeMessage: data.noticeMessage,
            isEditedWithAi: true,
            lastEditPrompt: textToSend,
            previousVersions: [
              ...(origMsg.previousVersions || []),
              {
                content: origMsg.content,
                timestamp: origMsg.timestamp,
                prompt: textToSend
              }
            ]
          };

          const nextMessages = [...targetSessionObj.messages];
          nextMessages[targetIdx] = updatedTargetMessage;

          const completedSession: ChatSession = {
            ...targetSessionObj,
            title: updatedTitle,
            messages: nextMessages,
            sessionDocuments: updatedSessionDocs,
            stagedQuestions: updatedStaged,
            updatedAt: Date.now()
          };

          updateActiveSession(() => completedSession, sendingSessionId);
          setEditingTargetMessageId(null);
          setInlineEditingMessageId(null);
          hasScrolledToResponse = true;

          setTimeout(() => {
            const bubbleEl = document.getElementById(`msg-bubble-${targetMessageId}`);
            if (bubbleEl) {
              bubbleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              bubbleEl.classList.add('ring-2', 'ring-blue-500/60', 'rounded-2xl', 'transition-all');
              setTimeout(() => {
                bubbleEl.classList.remove('ring-2', 'ring-blue-500/60');
              }, 2500);
            }
          }, 80);

          return assistantText;
        }
      }

      const finalCompletedMessages = (targetMessageId && !updatedMessages.some(m => m.content === textToSend))
        ? [
            ...updatedMessages,
            {
              id: `msg_user_${Date.now()}`,
              role: 'user' as const,
              content: textToSend,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            },
            newAssistantMessage
          ]
        : [...updatedMessages, newAssistantMessage];

      updateActiveSession((prev) => {
        const completedSession: ChatSession = {
          ...prev,
          title: updatedTitle,
          messages: finalCompletedMessages,
          sessionDocuments: updatedSessionDocs,
          stagedQuestions: updatedStaged,
          updatedAt: Date.now()
        };
        return completedSession;
      }, sendingSessionId);

      hasScrolledToResponse = true;
      scrollToLastResponseStart(newAssistantId);
      return assistantText;
    } catch (err: any) {
      clearTimeout(safetyTimeoutId);

      if (!wasTimedOut && (err?.name === 'AbortError' || err?.message?.includes('aborted') || controller.signal.aborted)) {
        console.log('Gemini request was cancelled by user.');
        return;
      }

      const errStatus = Number(err?.status || err?.code || 0);
      const errMsg = String(err?.message || '').toLowerCase();

      const isQuotaLimit = 
        errStatus === 429 ||
        errMsg.includes('quota') ||
        errMsg.includes('limit') ||
        errMsg.includes('exhausted') ||
        errMsg.includes('429') ||
        errMsg.includes('rate');

      const isOverload = 
        errStatus === 503 ||
        errStatus === 500 ||
        errMsg.includes('503') ||
        errMsg.includes('overloaded') ||
        errMsg.includes('unavailable') ||
        errMsg.includes('busy');

      const isNetwork = 
        errMsg.includes('failed to fetch') ||
        errMsg.includes('network') ||
        errMsg.includes('offline');

      // Avoid noisy console.error to keep logs clean
      console.warn('Chatbot handled status event:', err?.message || err);

      let userFriendlyContent = '';
      let errorCategory: ChatbotMessage['errorType'] = 'general';

      if (wasTimedOut) {
        errorCategory = 'timeout';
        userFriendlyContent = `⏱️ **Request Timed Out (120s)**\n\nThe Google Gemini model took longer than usual to respond due to high computational workload or network traffic. Your prompt is preserved and ready to retry.`;
      } else if (isQuotaLimit) {
        errorCategory = 'quota_limit';
        userFriendlyContent = `⚠️ **Gemini API Free-Tier Quota Limit (Google AI Policy)**\n\nThe Google Gemini AI free-tier quota for this model has been temporarily reached. Per Google's API service policies, requests are rate-limited to ensure fair usage across apps.\n\n- **Replenishment**: Free-tier rate limits automatically replenish in about 30–60 seconds.\n- **Alternative**: You can immediately switch to **Gemini 3.5 Flash** or **Gemini Flash Lite** using the model selector above.`;
      } else if (isOverload) {
        errorCategory = 'overloaded';
        userFriendlyContent = `⚠️ **Google AI Service High Demand**\n\nThe Google Gemini inference servers are currently handling heavy global traffic. The service usually stabilizes within a few seconds.`;
      } else if (isNetwork) {
        errorCategory = 'network';
        userFriendlyContent = `📶 **Network Connectivity Issue**\n\nUnable to reach the Gemini AI service. Please check your internet connection and try sending your request again.`;
      } else {
        errorCategory = 'general';
        userFriendlyContent = `⚠️ **Gemini AI Service Notice**\n\n${err.message || 'The Gemini model encountered a temporary issue.'}\n\nPlease try resending your request or switching to another model.`;
      }

      const errorMessage: ChatbotMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: userFriendlyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: effectiveModel,
        roleUsed: 'System Status',
        isError: true,
        errorType: errorCategory,
        retryPrompt: textToSend
      };

      updateActiveSession((s) => ({
        ...s,
        messages: [...updatedMessages, errorMessage],
        updatedAt: Date.now()
      }), sendingSessionId);
    } finally {
      clearTimeout(safetyTimeoutId);
      abortControllerRef.current = null;
      setIsLoading(false);
      isSendingRef.current = false;
      setEditingTargetMessageId(null);
      if (!hasScrolledToResponse) {
        setTimeout(() => scrollToBottom(true), 100);
      }
    }
  };
  handleSendMessageRef.current = handleSendMessage;

  // Handle incoming initial prompt from Actionable Improvements or other tabs to trigger a fresh Theta study conversation
  useEffect(() => {
    let pendingPrompt = initialPrompt;
    if (!pendingPrompt) {
      try {
        const stored = localStorage.getItem('theta_initial_prompt_pending');
        if (stored) {
          pendingPrompt = stored;
          localStorage.removeItem('theta_initial_prompt_pending');
        }
      } catch {}
    }

    if (pendingPrompt && pendingPrompt.trim()) {
      setActiveSessionId(null);
      setHomeCloudSyncEnabled(false);
      setAttachments([]);
      setInputMessage('');
      const promptToDispatch = pendingPrompt;
      const timer = setTimeout(() => {
        handleSendMessageRef.current?.(promptToDispatch);
        onClearInitialPrompt?.();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialPrompt, onClearInitialPrompt]);

  // Copy message text & images to clipboard with formatted table HTML and embedded visual diagrams
  const handleCopyMessage = async (id: string, messageOrText: ChatbotMessage | string) => {
    if (typeof messageOrText === 'string') {
      await copyFormattedTextToClipboard(messageOrText);
    } else {
      const generatedImages = messageOrText.generatedImages;
      const cleanText = generatedImages && generatedImages.length > 0
        ? messageOrText.content.replace(/```python[\s\S]*?```/g, '').trim()
        : messageOrText.content;
      await copyFormattedTextToClipboard(cleanText || messageOrText.content, {
        generatedImages,
        title: messageOrText.roleUsed ? `${messageOrText.roleUsed} Response` : 'Assistant Response'
      });
    }
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Save full assistant response directly to local Notes Repository (NotebookLM style)
  const handleSaveMessageToNotes = async (
    id: string,
    text: string,
    roleUsed?: string,
    generatedImages?: string[],
    attachments?: ChatAttachment[],
    isAiGeneratedImage?: boolean
  ) => {
    try {
      const titleMatch = text.match(/^#+\s*(.+)$/m);
      const inferredTitle = titleMatch ? titleMatch[1].trim() : `${roleUsed || 'AI'} Response`;
      const cleanFileName = inferredTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);

      // Assemble full rich content including any embedded images and plots
      let fullContent = text || '';
      let primaryFileUrl: string | undefined = undefined;
      let primaryFileType: 'image' | 'pdf' | 'file' | undefined = undefined;

      const hasVisualImage = (generatedImages && generatedImages.length > 0) || (attachments && attachments.some(a => a.mimeType?.startsWith('image/')));

      // Clean raw Python image plotting code blocks from the text if an image was generated/present
      if (hasVisualImage || fullContent.includes('![') || /```(?:python)?[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/i.test(fullContent)) {
        const withoutPython = fullContent
          .replace(/```(?:python)?\s*[\s\S]*?```/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (withoutPython.length > 0) {
          fullContent = withoutPython;
        }
      }

      // 1. If generated images exist (e.g. matplotlib plot or Imagen), embed into content and set fileUrl
      if (generatedImages && generatedImages.length > 0) {
        primaryFileUrl = generatedImages[0];
        primaryFileType = 'image';

        // Embed markdown image if not already present in text
        const imageMarkdownSnippets = generatedImages
          .map((img, idx) => `\n\n![Generated Visual ${idx + 1}](${img})\n\n`)
          .join('');

        if (!fullContent.includes('![') && !fullContent.includes(generatedImages[0].slice(0, 40))) {
          fullContent = `# ${inferredTitle}\n\n${imageMarkdownSnippets}\n\n${fullContent}`.trim();
        } else {
          fullContent = `${fullContent}\n\n${imageMarkdownSnippets}`.trim();
        }
      }

      // 2. If attachments exist, check for images or PDFs
      if (attachments && attachments.length > 0) {
        attachments.forEach((att) => {
          if (att.previewUrl && !primaryFileUrl) {
            primaryFileUrl = att.previewUrl;
            const isImg = att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || '');
            const isPdf = att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.name || '');
            primaryFileType = isImg ? 'image' : isPdf ? 'pdf' : 'file';
          }
        });
      }

      // 3. Determine tag: if table present -> 'table', if image present -> 'image', if math formula -> 'formula', else 'concept'
      const isTable = fullContent.includes('|') && fullContent.split('\n').some((l) => l.trim().startsWith('|') && l.includes('|', 1));
      const hasMath = /\\(?:frac|sum|int|lim|sqrt|[a-zA-Z]+)|\$|\^|_/.test(fullContent);
      const hasVisual = primaryFileType === 'image' || fullContent.includes('![') || (generatedImages && generatedImages.length > 0);
      const noteTag = isTable ? 'table' : (hasVisual ? 'image' : (hasMath ? 'formula' : (roleUsed === 'fast_solver' ? 'trick' : 'concept')));

      // Save as 'file' (rich document note) if text exists alongside the image so that GoogleDocsNoteViewer renders both text and visual image
      const textOnly = fullContent.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/#+\s*.*/g, '').trim();
      const finalNoteFileType = textOnly.length > 0 ? 'file' : (primaryFileType || 'file');

      await saveSingleNoteToIDB({
        id: `note_msg_${Date.now()}`,
        testId: 'notes_repository',
        content: fullContent,
        tag: noteTag,
        fileName: `${cleanFileName || 'ai_response'}.md`,
        fileUrl: primaryFileUrl,
        fileType: finalNoteFileType,
        createdAt: new Date().toISOString()
      });
      setSavedToNotesMessageId(id);
      setTimeout(() => setSavedToNotesMessageId(null), 2500);
    } catch (err) {
      console.warn('Failed to save message note to IDB:', err);
    }
  };

  // Speak or Stop speaking specific message text
  const handleToggleSpeakMessage = useCallback((id: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // If already speaking this message, stop speaking
    if (speakingMessageId === id) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      setSpeakingMessageId(null);
      return;
    }

    // Cancel any current speech synthesis
    try {
      window.speechSynthesis.cancel();
    } catch {}

    const formattedText = formatTextForSpeech(text);
    if (!formattedText || !formattedText.trim()) return;

    try {
      const utterance = new SpeechSynthesisUtterance(formattedText);
      applyGeminiFemaleVoice(utterance);

      utterance.onstart = () => {
        setSpeakingMessageId(id);
      };

      utterance.onend = () => {
        setSpeakingMessageId((current) => (current === id ? null : current));
      };

      utterance.onerror = () => {
        setSpeakingMessageId((current) => (current === id ? null : current));
      };

      setSpeakingMessageId(id);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Speech synthesis error:', err);
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId]);

  // Retry specific assistant message
  const handleRetryMessage = (msgIndex: number) => {
    if (isLoading) return;
    // Find the preceding user message before this index
    const precedingUserMsg = [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === 'user');
    if (!precedingUserMsg) return;

    // Slice history up to the preceding user message
    const targetIdx = messages.findIndex((m) => m.id === precedingUserMsg.id);
    if (targetIdx === -1) return;

    const sliced = messages.slice(0, targetIdx + 1);
    updateActiveSession((s) => ({
      ...s,
      messages: sliced
    }));

    handleSendMessage(precedingUserMsg.content, {
      isRetry: true,
      overrideMessages: sliced
    });
  };

  // Regenerate last assistant message
  const handleRegenerateLast = () => {
    if (isLoading || messages.length < 2) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const realIdx = messages.length - 1 - lastUserMsgIdx;
    const lastUserMessage = messages[realIdx];
    const sliced = messages.slice(0, realIdx);

    updateActiveSession((s) => ({
      ...s,
      messages: sliced
    }));

    setInputMessage(lastUserMessage.content);
    if (lastUserMessage.attachments) {
      setAttachments(lastUserMessage.attachments);
    }
  };

  // Edit & Resubmit specific User message
  const handleEditAndResubmitMessage = (msgId: string, editedContent: string) => {
    if (isLoading) return;
    const msgIdx = messages.findIndex((m) => m.id === msgId);
    if (msgIdx === -1) return;

    const originalMsg = messages[msgIdx];
    const originalAttachments = originalMsg.attachments || [];

    // Slice messages up to the edited message (excluding it)
    const sliced = messages.slice(0, msgIdx);

    // Update activeSession messages to sliced, and temporarily set attachments so handleSendMessage can read them
    if (originalAttachments.length > 0) {
      setAttachments(originalAttachments);
    }

    updateActiveSession((s) => ({
      ...s,
      messages: sliced
    }));

    // Trigger handleSendMessage with newly edited text
    handleSendMessage(editedContent);
    setEditingMessageId(null);
    setEditingText('');
  };

  // File Icon Helper
  const getFileIcon = (fileName: string, mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-purple-500" />;
    if (mimeType === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />;
    if (fileName.endsWith('.json') || fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.py')) {
      return <FileCode className="w-4 h-4 text-blue-500" />;
    }
    return <FileGenericIcon className="w-4 h-4 text-slate-400" />;
  };

  // Filtered Sessions for Search (Only display conversations with user messages)
  const filteredSessions = sessions.filter((s) => {
    const hasUserMsg = Array.isArray(s.messages) && s.messages.some((m) => m && m.role === 'user');
    if (!hasUserMsg) return false;
    if (!historySearchQuery.trim()) return true;
    const query = historySearchQuery.toLowerCase();
    return (
      (s.title && s.title.toLowerCase().includes(query)) ||
      s.messages.some((m) => m && m.content && m.content.toLowerCase().includes(query))
    );
  });

  const currentModelConfig = MODEL_OPTIONS.find((m) => m.id === selectedModel) || MODEL_OPTIONS[0];
  const activeRoleObj = PRESET_ROLES.find((r) => r.id === selectedRole) || PRESET_ROLES[0];

  return (
    <div 
      className={`w-full h-full flex overflow-hidden ${APP_STYLES.page} relative`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-blue-600/10 dark:bg-blue-500/10 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center p-6 text-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center mb-3 shadow-lg animate-bounce">
            <Paperclip className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400">Drop files to attach to conversation</h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 max-w-sm">
            Attach up to 10 exam questions, diagrams, PDFs, and code files for Gemini analysis.
          </p>
        </div>
      )}

      {/* Mobile & Tablet Backdrop for Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
          />
        )}
      </AnimatePresence>

      {/* LEFT: Conversation History Sidebar (Slide-over on mobile & tablet, collapsible on desktop) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto h-full w-72 lg:w-80 bg-[#f0f4f9] dark:bg-[#1e1f20] border-r border-slate-200/80 dark:border-[#282a2d] flex flex-col shrink-0 transition-transform duration-200 ease-out drawer-panel ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Sidebar Header & New Chat Button */}
        <div className="pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] px-3.5 pb-3.5 space-y-3 border-b border-slate-200/80 dark:border-[#282a2d] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm tracking-tight text-slate-800 dark:text-zinc-100">
                Chat History
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-[#282a2d] cursor-pointer transition-colors"
              title="Back to conversation (Esc)"
              aria-label="Back to conversation"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-white dark:bg-[#21222e] text-slate-800 dark:text-zinc-100 hover:bg-blue-50 dark:hover:bg-[#20222e] border border-slate-300 dark:border-zinc-700 text-xs font-bold transition-all shadow-none cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>New Chat</span>
          </button>

          {/* Search conversations */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search chats..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-[#21222e] border border-slate-300 dark:border-zinc-700 shadow-none rounded-full pl-8.5 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            {activeSession && activeSession.messages.length > 1 && (
              <button
                onClick={handleClearCurrentChat}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shrink-0 cursor-pointer shadow-none border border-slate-300 dark:border-zinc-700"
                title="Clear messages in current chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {sessions.length > 0 && (
              <button
                onClick={handleDeleteAllSessions}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer shadow-none border border-slate-300 dark:border-zinc-700"
                title="Delete all chat history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No conversations found.
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    if (session.modelTier) {
                      setSelectedModel(session.modelTier);
                    }
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                      if (document.documentElement) document.documentElement.scrollTop = 0;
                      if (document.body) document.body.scrollTop = 0;
                      if (window.innerWidth < 1024) {
                        setIsSidebarOpen(false);
                      }
                    }
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                    isActive
                      ? 'bg-[#d3e3fd] dark:bg-[#282a2d] text-blue-900 dark:text-blue-300 font-bold shadow-2xs'
                      : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-[#282a2d]/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                    <span className="truncate">{session.title || 'New Conversation'}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {/* Cloud Control Button on each chat item */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSessionCloudSync(session.id);
                      }}
                      className={`w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        session.cloudSyncEnabled
                          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100/70 dark:hover:bg-blue-900/40'
                          : 'opacity-50 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-[#3c4043]'
                      }`}
                      title={
                        session.cloudSyncEnabled
                          ? 'Cloud Sync: Enabled (Click to disable)'
                          : 'Cloud Sync: Disabled (Click to enable)'
                      }
                      aria-label="Toggle cloud sync for this chat"
                    >
                      {session.cloudSyncEnabled ? (
                        <Cloud className="w-3.5 h-3.5" />
                      ) : (
                        <CloudOff className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Delete chat button */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="w-6.5 h-6.5 rounded-full flex items-center justify-center opacity-60 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-[#3c4043] transition-all cursor-pointer"
                      title="Delete chat"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT: Main Clean Gemini Chat Panel */}
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314] text-[#1f1f1f] dark:text-[#e3e3e3] min-w-0 overflow-hidden">
        {/* Top Minimal Header & Controls - Transparent & Compact Header Buttons */}
        <header className="relative z-30 flex items-center justify-between gap-1 sm:gap-2 px-3 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-white dark:bg-[#131314] shrink-0 border-0 shadow-none">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0">
            {/* Back to Home / Tests Dashboard Button */}
            {onNavigateTab && (
              <button
                onClick={() => {
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  onNavigateTab('tests');
                }}
                className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#1f1f1f] dark:text-[#e3e3e3] bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] border-0 shadow-none transition-all cursor-pointer active:scale-95 shrink-0"
                title="Back to Tests Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            {/* Chatbot Powered by AI Title */}
            <div className="flex flex-col justify-center ml-0.5 shrink-0 leading-tight">
              <span className="font-bold text-sm sm:text-base tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent leading-none">
                Theta
              </span>
              <span className="text-[9.5px] sm:text-[10.5px] font-medium text-slate-500 dark:text-zinc-400 mt-0.5 leading-none whitespace-nowrap">
                powered by <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent font-semibold">Gemini</span>
              </span>
            </div>
          </div>

          {/* Right: Model Selection, Cloud Sync, and Action Buttons (Compact Transparent Row) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Model Selector Pill Dropdown */}
            <div className="relative shrink-0" ref={modelDropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border-0 shadow-none transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <div className="p-0.5 rounded-full text-emerald-600 dark:text-emerald-400 shrink-0">
                  <GraduationCap className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:inline text-xs">Gemini 3.5</span>
                <span className="sm:hidden text-xs">{currentModelConfig.label.split(' ')[1] || '3.5'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <AnimatePresence>
                {showModelDropdown && (
                  <>
                    {/* Backdrop to easily dismiss on mobile/narrow viewports */}
                    <div 
                      className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
                      onClick={() => setShowModelDropdown(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] sm:absolute sm:right-0 sm:left-auto sm:translate-x-0 sm:top-full sm:mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-80 max-h-[75vh] overflow-y-auto bg-white dark:bg-[#1e2024] rounded-[28px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-slate-200 dark:border-zinc-700 p-3 z-50 space-y-1 modal-content-smooth"
                    >
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        Select Gemini Model
                      </div>
                      {MODEL_OPTIONS.map((m) => {
                        const Icon = m.icon;
                        const isSelected = selectedModel === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              setSelectedModel(m.id);
                              setShowModelDropdown(false);
                              updateActiveSession((s) => ({ ...s, modelTier: m.id }));
                            }}
                            className={`p-2.5 rounded-[20px] cursor-pointer transition-all flex items-start gap-2.5 border ${
                              isSelected
                                ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-semibold border-blue-400/50'
                                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-slate-200 dark:border-zinc-700'
                            }`}
                          >
                            <div className="p-1.5 rounded-full bg-white dark:bg-[#141619] shrink-0 mt-0.5 shadow-xs">
                              <Icon className={`w-4 h-4 ${m.color}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs flex items-center justify-between gap-1.5">
                                <span className="truncate">{m.label}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-tight">{m.description}</div>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Cloud Sync Toggle Button */}
            <button
              type="button"
              onClick={handleToggleCloudSync}
              className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 border-0 shadow-none shrink-0 ${
                activeSession?.cloudSyncEnabled
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/70 font-bold'
                  : 'text-[#5e5e5e] dark:text-[#9aa0a6] bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30]'
              }`}
              title={
                activeSession?.cloudSyncEnabled
                  ? 'Cloud Sync: On (Click to turn off)'
                  : 'Cloud Sync: Off (Click to turn on)'
              }
              aria-label={
                activeSession?.cloudSyncEnabled
                  ? 'Cloud Sync Enabled (Click to disable)'
                  : 'Cloud Sync Disabled (Click to enable)'
              }
            >
              {activeSession?.cloudSyncEnabled ? (
                <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              ) : (
                <CloudOff className="w-4 h-4 shrink-0" />
              )}
            </button>

            {/* Persona Settings */}
            <button
              onClick={() => setShowRoleConfig(!showRoleConfig)}
              className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 border-0 shadow-none ${
                showRoleConfig
                  ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]'
                  : 'bg-transparent text-[#5e5e5e] dark:text-[#9aa0a6] hover:bg-slate-100 dark:hover:bg-[#282a30]'
              }`}
              title="Persona Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Toggle History Sidebar Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-transparent text-[#5e5e5e] dark:text-[#9aa0a6] hover:bg-slate-100 dark:hover:bg-[#282a30] transition-all cursor-pointer shrink-0 active:scale-95 border-0 shadow-none"
              title={isSidebarOpen ? 'Close Chat History' : 'Open Chat History'}
            >
              <Clock className="w-4 h-4" />
            </button>

            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-transparent text-[#5e5e5e] dark:text-[#9aa0a6] hover:bg-slate-100 dark:hover:bg-[#282a30] transition-all cursor-pointer shrink-0 active:scale-95 border-0 shadow-none"
              title="Start a New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Role & Persona Settings Drawer with Web Speech Accessibility Options */}
        <AnimatePresence>
          {showRoleConfig && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[#f0f4f9] dark:bg-[#21222e] border border-slate-200/80 dark:border-zinc-800/80 p-3.5 sm:p-5 overflow-y-auto max-h-[75vh] shrink-0 mx-2.5 sm:mx-6 my-2 rounded-3xl shadow-none gpu-accelerated modal-content-smooth"
            >
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Persona Settings
                  </span>
                  <button
                    onClick={() => setShowRoleConfig(false)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer transition-colors shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Persona Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PRESET_ROLES.map((role) => {
                    const Icon = role.icon;
                    const isSelected = selectedRole === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => {
                          setSelectedRole(role.id);
                          if (role.recommendedModel) {
                            setSelectedModel(role.recommendedModel);
                            updateActiveSession((s) => ({ ...s, modelTier: role.recommendedModel }));
                          }
                        }}
                        className={`p-3.5 rounded-2xl cursor-pointer transition-colors duration-150 flex flex-col justify-between border shadow-none ${
                          isSelected
                            ? 'bg-white dark:bg-[#20222e] text-blue-600 dark:text-blue-400 border-[#0b57d0] dark:border-[#a8c7fa] ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] font-semibold'
                            : 'bg-white/90 dark:bg-[#21222e]/90 hover:bg-white dark:hover:bg-[#20222e] text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                          <div className="font-bold text-xs text-slate-900 dark:text-zinc-100">{role.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1 leading-tight line-clamp-2">{role.description}</div>
                        </div>
                        <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 mt-2">
                          {role.tag}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Settings Controls */}
                <div className="pt-2 space-y-2">
                  {/* Temperature Slider Sub-container Strip */}
                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-white dark:bg-[#21222e] border border-slate-300 dark:border-zinc-700 shadow-none flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <span>Creativity (Temperature)</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full font-bold">
                            {temperature}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                          Lower values (0.2–0.4) are more factual & precise; higher values (0.7–1.0) are more creative.
                        </div>
                      </div>
                    </div>
                    <div className="w-full sm:w-44 shrink-0 flex items-center">
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable Conversation Stream */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-10 lg:px-12 py-4 sm:py-6 space-y-6 min-h-0"
        >
          {(!messages || messages.length === 0 || !messages.some((m) => m.role === 'user')) ? (
            // Gemini-Style Clean Minimal Ultra-Compact Welcome & Starter Screen
            <div className="max-w-2xl mx-auto py-3 sm:py-6 flex flex-col items-center text-center space-y-4 sm:space-y-5 animate-in fade-in duration-200">
              {/* Clean Large Heading with Subtitle */}
              <div className="space-y-2 max-w-xl px-2">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight">
                  <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-500 bg-clip-text text-transparent">
                    {auth.currentUser?.displayName ? `Hello, ${auth.currentUser.displayName.split(' ')[0]}` : 'Hello'}
                  </span>
                </h1>
                <h2 className="text-lg sm:text-xl md:text-2xl font-medium tracking-tight text-slate-800 dark:text-zinc-100">
                  How can I help you today?
                </h2>
                <p className="text-sm sm:text-base text-slate-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
                  Generate mock tests, launch custom builder, analyze past performance, or plot math.
                </p>
              </div>

              {/* Category Filter Buttons Wrapping Wisely Across Rows */}
              <div className="w-full max-w-2xl px-1">
                <div className="flex flex-wrap items-center justify-center gap-2 pb-1">
                  {[
                    { id: 'all', label: 'All Ideas', icon: Sparkles },
                    { id: 'actions', label: 'App Tools', icon: Target },
                    { id: 'tests', label: 'Practice Tests', icon: FileCheck2 },
                    { id: 'analytics', label: 'Score Analytics', icon: BarChart2 },
                    { id: 'plots', label: 'Plot Diagrams', icon: LineChart },
                  ].map((cat) => {
                    const IconComp = cat.icon;
                    const isActive = activeStarterCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveStarterCategory(cat.id)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-[13px] font-bold transition-all duration-150 cursor-pointer select-none whitespace-nowrap outline-none border active:scale-95 ${
                          isActive
                            ? 'bg-[#0b57d0] text-white border-[#0b57d0] dark:bg-[#a8c7fa] dark:text-[#041e49] dark:border-[#a8c7fa] shadow-xs'
                            : 'bg-white hover:bg-[#f8fafd] dark:bg-[#1e2024] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-slate-300 dark:border-zinc-700 shadow-xs'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Suggestion Cards Grid (App Feature Elements - rounded-[24px] & static home card styling with round icon buttons) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl text-left px-1">
                {[
                  // Core 5 Cards for All Ideas (forAll: true)
                  {
                    id: 'universal-mock-test',
                    category: 'tests',
                    forAll: true,
                    icon: GraduationCap,
                    iconColor: 'text-[#0b57d0] dark:text-[#a8c7fa] bg-[#d3e3fd]/60 dark:bg-[#004a77]/60',
                    title: 'Generate Custom Test',
                    badge: 'Test',
                    badgeColor: 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]',
                    description: 'MCQ, numerical & LaTeX test with...',
                    modal: 'test' as const,
                  },
                  {
                    id: 'universal-table-gen',
                    category: 'actions',
                    forAll: true,
                    icon: FileSpreadsheet,
                    iconColor: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60',
                    title: 'Generate Data Table',
                    badge: 'Table',
                    badgeColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200',
                    description: 'Comparison matrix, formula sheet...',
                    modal: 'table' as const,
                  },
                  {
                    id: 'universal-image-gen',
                    category: 'actions',
                    forAll: true,
                    icon: ImageIcon,
                    iconColor: 'text-purple-700 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-950/60',
                    title: 'Generate Visual Image',
                    badge: 'Image',
                    badgeColor: 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200',
                    description: 'Diagrams, 3D math plots & visual...',
                    modal: 'image' as const,
                  },
                  {
                    id: 'math-plot-flexible',
                    category: 'plots',
                    forAll: true,
                    icon: LineChart,
                    iconColor: 'text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-950/60',
                    title: 'Plot 2D/3D Diagrams',
                    badge: 'Python',
                    badgeColor: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200',
                    description: 'Visualize mathematical curves, 3D...',
                    prefill: 'Generate an interactive Python plot using NumPy and Matplotlib to visualize [Function / Curve / Diagram, e.g. sin(x)*exp(-x)].',
                  },
                  {
                    id: 'diagnose-performance',
                    category: 'analytics',
                    forAll: true,
                    icon: BarChart2,
                    iconColor: 'text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60',
                    title: 'Diagnose Past Test Weaknesses',
                    badge: 'Analytics',
                    badgeColor: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
                    description: 'Analyze score history, find weakest...',
                    prompt: 'Diagnose my past test attempts, identify my lowest accuracy topics, and provide actionable tips with an interactive action shortcut.',
                  },

                  // Additional Category-Specific Cards (forAll: false)
                  {
                    id: 'test-analysis',
                    category: 'tests',
                    forAll: false,
                    icon: FileCheck2,
                    iconColor: 'text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-950/60',
                    title: 'Analyze Test Library',
                    description: 'Review saved tests and recommend revision questions across all subjects',
                    prompt: 'Analyze my connected test library and recommend high-yield topics and practice questions.',
                  },
                  {
                    id: 'accuracy-breakdown',
                    category: 'analytics',
                    forAll: false,
                    icon: LineChart,
                    iconColor: 'text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60',
                    title: 'Accuracy & Time Breakdown',
                    description: 'Examine response speeds, pacing and topic mastery across tests',
                    prompt: 'Show my overall score trends, pacing analytics, and accuracy breakdown across topics.',
                  },
                  {
                    id: 'scientific-plot-flexible',
                    category: 'plots',
                    forAll: false,
                    icon: LineChart,
                    iconColor: 'text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-950/60',
                    title: 'Scientific & Plot Diagrams',
                    badge: 'Python',
                    badgeColor: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200',
                    description: 'Plot statistical distributions, regressions, physics models & scientific diagrams',
                    prefill: 'Generate a Python Matplotlib script to plot scientific data, probability distributions, or physics diagrams for [Topic].',
                  },
                ]
                  .filter((p) => activeStarterCategory === 'all' ? p.forAll : p.category === activeStarterCategory)
                  .map((card) => {
                    const CardIcon = card.icon;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => {
                          const c = card as any;
                          if (c.modal === 'test') {
                            setEditingContext(null);
                            setEditingTargetMessageId(null);
                            setIsTestGeneratorModalOpen(true);
                          } else if (c.modal === 'table') {
                            setEditingContext(null);
                            setEditingTargetMessageId(null);
                            setIsTableGeneratorModalOpen(true);
                          } else if (c.modal === 'image') {
                            setEditingContext(null);
                            setEditingTargetMessageId(null);
                            setIsImageGeneratorModalOpen(true);
                          } else if (c.prefill) {
                            setInputMessage(c.prefill);
                            setTimeout(() => {
                              const el = document.querySelector('textarea#gemini-prompt-textarea') || document.querySelector('textarea');
                              if (el) {
                                (el as HTMLTextAreaElement).focus();
                                const topicStart = c.prefill.indexOf('[');
                                const topicEnd = c.prefill.indexOf(']');
                                if (topicStart !== -1 && topicEnd !== -1) {
                                  (el as HTMLTextAreaElement).setSelectionRange(topicStart, topicEnd + 1);
                                }
                              }
                            }, 50);
                          } else if (c.prompt) {
                            handleSendMessage(c.prompt);
                          }
                        }}
                        className="group flex items-center gap-3.5 p-4 rounded-[24px] bg-white hover:bg-[#f8fafd] dark:bg-[#1e2024] dark:hover:bg-[#282a30] border border-slate-300 dark:border-zinc-700 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] text-left w-full min-h-[64px]"
                      >
                        <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${card.iconColor}`}>
                          <CardIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors flex items-center justify-between gap-1.5 truncate">
                            <span className="truncate">{card.title}</span>
                            {card.badge && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${card.badgeColor}`}>
                                {card.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#5e5e5e] dark:text-[#c4c7c5] leading-normal line-clamp-1 mt-0.5 font-medium">
                            {card.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#5e5e5e] dark:text-[#c4c7c5] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] group-hover:translate-x-0.5 transition-all shrink-0 ml-auto" />
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  id={`msg-bubble-${msg.id}`}
                  data-message-id={msg.id}
                  className={`flex w-full max-w-3xl mx-auto ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`w-full ${isUser ? 'max-w-[92%] sm:max-w-[85%] items-end' : 'max-w-full items-start'} flex flex-col`}>
                    {/* Attached user files */}
                    {isUser && msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2 justify-end">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 p-1.5 pr-2 bg-[#f0f4f9] dark:bg-[#282a2d] border border-slate-200 dark:border-[#3c4043] rounded-2xl shadow-xs hover:border-blue-500 transition-all text-xs"
                          >
                            <div 
                              onClick={() => setSelectedPreviewAttachment(att)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              {att.previewUrl && att.previewUrl.trim() ? (
                                <img src={att.previewUrl} alt={att.name} className="w-7 h-7 object-cover rounded-xl" />
                              ) : (
                                getFileIcon(att.name, att.mimeType)
                              )}
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200 max-w-[120px] truncate">{att.name}</span>
                                <span className="text-[9px] text-slate-400">{(att.size / 1024).toFixed(1)} KB</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsTestGeneratorModalOpen(true);
                              }}
                              className="ml-1 p-1 rounded-lg bg-blue-100/80 hover:bg-blue-200 dark:bg-blue-950/80 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
                              title={`Create test from ${att.name}`}
                            >
                              <Sparkles className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message Card Bubble */}
                    {isUser ? (
                      editingMessageId === msg.id ? (
                        <div className="w-full min-w-[280px] sm:min-w-[420px] bg-slate-50 dark:bg-[#1e1f20] border border-slate-200 dark:border-[#3c4043] rounded-[22px] p-3 flex flex-col gap-2 shadow-sm">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full bg-white dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-[#3c4043] rounded-xl px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 resize-y min-h-[70px] leading-relaxed"
                            placeholder="Edit message..."
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleEditAndResubmitMessage(msg.id, editingText);
                              }
                            }}
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditingText('');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#282a2d] rounded-xl cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editingText.trim() || isLoading}
                              onClick={() => handleEditAndResubmitMessage(msg.id, editingText)}
                              className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group relative flex flex-col items-end gap-1">
                          <div className="bg-[#f0f4f9] dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 rounded-[22px] px-4.5 py-3 text-[17px] leading-relaxed whitespace-pre-wrap font-medium w-full">
                            {(() => {
                              const text = msg.content;
                              const isExpanded = expandedPromptMessageIds.has(msg.id);
                              const onToggle = () => toggleExpandPrompt(msg.id);
                              const isLatestMessageLoading = isLoading && idx === messages.length - 1;

                              // 1. Remedial Masterclass Course Request
                              if (text.includes('Master Remedial Crash Course') || text.includes('Structured Remedial Study Course') || text.includes('Remedial Study Course')) {
                                const titleMatch = text.match(/# (?:📚 )?(?:Master Remedial Crash Course & Actionable Study Guide|Structured Remedial Study Course):\s*["']?([^"'\n]+)["']?/i);
                                const title = titleMatch ? titleMatch[1] : 'Remedial Masterclass Course';
                                const scoreMatch = text.match(/Diagnostic Score:\s*([^\n•]+)/i);
                                const customMatch = text.match(/User Request:\s*["']?([^"'\n]+)["']?/i) || text.match(/Specific User Requirements & Extra Add-ons:\s*\n["']?([^"'\n]+)["']?/i);

                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-200/60 dark:border-blue-800/40">
                                        <BookOpen className="w-3 h-3" />
                                        <span>Remedial Masterclass Request</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                                      {title}
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-zinc-400">
                                      <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">6 Modules</span>
                                      {scoreMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{scoreMatch[1].trim()}</span>}
                                      {customMatch && (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium truncate max-w-[200px]">
                                          Custom: {customMatch[1].trim()}
                                        </span>
                                      )}
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Synthesizing theoretical proofs, formula tables &amp; visual masterclass...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 2. Custom Practice Test Generator
                              if ((text.includes('Please act as a top-tier academic professor') || text.includes('practice test')) && (text.includes('Test Specifications:') || text.includes('Target Questions Count:'))) {
                                const titleMatch = text.match(/titled ["']?([^"'\n]+)["']?/i);
                                const topicMatch = text.match(/on ["']?([^"'\n]+)["']?/i);
                                const countMatch = text.match(/Target Questions Count:\s*([^\n]+)/i);
                                const diffMatch = text.match(/Difficulty Level:\s*([^\n]+)/i);
                                const customMatch = text.match(/Custom Directives & Focus Areas:\s*([^\n]+)/i);

                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-200/60 dark:border-indigo-800/40">
                                        <GraduationCap className="w-3 h-3" />
                                        <span>Practice Test Generator</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                                      {titleMatch ? titleMatch[1] : topicMatch ? `Test on ${topicMatch[1]}` : 'Custom Practice Test'}
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-zinc-400">
                                      {countMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{countMatch[1].trim()} Qs</span>}
                                      {diffMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium capitalize">{diffMatch[1].trim()}</span>}
                                      {customMatch && (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium truncate max-w-[200px]">
                                          Notes: {customMatch[1].trim()}
                                        </span>
                                      )}
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Formulating questions, LaTeX options &amp; mathematical proofs...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 3. Data Table Generator
                              if (text.includes('structured Markdown comparison table') || (text.includes('Table Specifications:') && text.includes('Markdown table'))) {
                                const titleMatch = text.match(/titled ["']?([^"'\n]+)["']?/i);
                                const topicMatch = text.match(/on the topic of ["']?([^"'\n]+)["']?/i);
                                const rowsMatch = text.match(/Target Rows:\s*([^\n]+)/i);
                                const typeMatch = text.match(/Category & Preset Structure:\s*([^\n]+)/i);

                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200/60 dark:border-emerald-800/40">
                                        <FileSpreadsheet className="w-3 h-3" />
                                        <span>Data Table Model</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                                      {titleMatch ? titleMatch[1] : topicMatch ? `Table on ${topicMatch[1]}` : 'Data Comparison Table'}
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-zinc-400">
                                      {rowsMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{rowsMatch[1].trim()}</span>}
                                      {typeMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{typeMatch[1].trim()}</span>}
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Synthesizing structured data rows &amp; mathematical columns...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 4. Visual 2D/3D Diagram & Python Plot
                              if (text.startsWith('/image') || (text.includes('Python code') && (text.includes('Matplotlib') || text.includes('Visual Plot Specifications:')))) {
                                const promptMatch = text.startsWith('/image') 
                                  ? text.replace(/^\/image\s*/, '').trim()
                                  : (text.match(/figure for ["']?([^"'\n]+)["']?/i)?.[1] || 'Visual Plot Diagram');
                                const styleMatch = text.match(/Style Theme:\s*([^\n]+)/i);
                                const aspectMatch = text.match(/Canvas Aspect Ratio:\s*([^\n]+)/i);

                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 text-[11px] font-bold border border-purple-200/60 dark:border-purple-800/40">
                                        <LineChart className="w-3 h-3" />
                                        <span>2D/3D Diagram &amp; Plot</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 line-clamp-2">
                                      {promptMatch}
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-zinc-400">
                                      {styleMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{styleMatch[1].trim()}</span>}
                                      {aspectMatch && <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 font-medium">{aspectMatch[1].trim()}</span>}
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-purple-600 dark:text-purple-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Executing Python plotting engine &amp; rendering figure...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 5. Diagnostic Past Weaknesses
                              if (text.includes('Diagnose my past test attempts') || text.includes('diagnose past test weaknesses')) {
                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 text-[11px] font-bold border border-amber-200/60 dark:border-amber-800/40">
                                        <BarChart2 className="w-3 h-3" />
                                        <span>Diagnostic Performance Analysis</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                                      Comprehensive Past Weakness &amp; Accuracy Diagnostic
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Analyzing test attempts, topic precision &amp; recovery strategies...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 6. Generic Long Structured Prompt (> 250 chars or multi-heading)
                              if (text.length > 250 && (text.includes('##') || text.includes('\n- ') || text.includes('###'))) {
                                const firstLine = text.split('\n')[0].replace(/^[#\s]+/, '');
                                return (
                                  <div className="space-y-2 w-full text-left">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-[11px] font-bold">
                                        <Zap className="w-3 h-3 text-[#0084ff]" />
                                        <span>Structured Request</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={onToggle}
                                        className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 line-clamp-2">
                                      {firstLine || text.slice(0, 100)}
                                    </div>

                                    {isLatestMessageLoading && (
                                      <div className="flex items-center gap-1.5 pt-1 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        <span>Processing structured prompt with Theta AI...</span>
                                      </div>
                                    )}

                                    {isExpanded && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2.5 rounded-xl max-h-[350px] overflow-y-auto">
                                        {text}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // Default Standard Message
                              return text;
                            })()}
                          </div>
                          {/* Action Bar for User Message: Copy, Speak, Edit, Delete */}
                          <div className="flex items-center gap-1 pt-0.5 text-slate-400 dark:text-zinc-500 select-none">
                            {/* Edit User Message */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingText(msg.content);
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                              title="Edit message"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Copy User Message */}
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                              title="Copy message"
                            >
                              {copiedMessageId === msg.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>

                            {/* Speak User Message */}
                            <button
                              type="button"
                              onClick={() => handleToggleSpeakMessage(msg.id, msg.content)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                speakingMessageId === msg.id
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/60'
                                  : 'hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100'
                              }`}
                              title={speakingMessageId === msg.id ? 'Stop speaking' : 'Read message aloud'}
                            >
                              {speakingMessageId === msg.id ? <VolumeX className="w-4 h-4 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                            </button>

                            {/* Delete User Message */}
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="w-full text-[17px] leading-[1.7] text-slate-800 dark:text-zinc-100 space-y-3.5">
                        {/* Direct In-Place Updating Indicator for this specific message */}
                        {editingTargetMessageId === msg.id && isLoading && (
                          <div className="p-3 rounded-2xl bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2.5 animate-pulse shadow-xs">
                            <Sparkles className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                            <div className="min-w-0">
                              <span className="font-bold">Updating this response directly with AI...</span>
                              {loadingPrompt && (
                                <span className="opacity-85 ml-1.5 italic truncate block sm:inline">
                                  "{loadingPrompt}"
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Direct AI Edit Audit Badge & Version Toggle */}
                        {msg.isEditedWithAi && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-3 py-1.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-blue-700 dark:text-blue-300">
                            <span className="flex items-center gap-1.5 font-medium truncate">
                              <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="font-bold">Updated with AI:</span>
                              <span className="italic truncate font-normal">"{msg.lastEditPrompt || 'Direct revision'}"</span>
                            </span>
                            {msg.previousVersions && msg.previousVersions.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setViewingOriginalMessageId(viewingOriginalMessageId === msg.id ? null : msg.id)}
                                className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-auto"
                              >
                                {viewingOriginalMessageId === msg.id ? 'Show Updated' : 'Show Original'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* If user toggled to view original version */}
                        {viewingOriginalMessageId === msg.id && msg.previousVersions && msg.previousVersions.length > 0 ? (
                          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1f2023] border border-slate-200 dark:border-[#303236] space-y-2">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <span>Original Version Before AI Edit</span>
                            </div>
                            <div className="math-markdown-content text-slate-700 dark:text-zinc-300 font-medium text-[17px] leading-relaxed">
                              <MathRenderer content={msg.previousVersions[0].content} />
                            </div>
                          </div>
                        ) : null}

                        {/* Generated Visual Plots & Graphs Output */}
                        {msg.generatedImages && msg.generatedImages.length > 0 && (
                          <div className="space-y-4">
                            {msg.generatedImages.map((imgUri, idx) => (
                              <GeneratedPlotArtifact
                                key={idx}
                                dataUri={imgUri}
                                index={idx}
                                pythonCode={msg.executableCode?.[idx]?.code || msg.executableCode?.[0]?.code}
                                messageText={msg.content}
                                isAiGenerated={!msg.executableCode || msg.executableCode.length === 0 || !!(msg.content && /(image|illustration|photograph|generate|draw|picture|render|painting|artwork|visualize|portrait|landscape)/i.test(msg.content))}
                                imagePrompt={msg.content}
                                messageId={msg.id}
                                onPreview={(uri) => setPreviewImageUrl(uri)}
                                onFollowUp={(prompt, targetMsgId) => handleSendMessage(prompt, undefined, targetMsgId || msg.id)}
                                onOpenCanvas={() => {
                                  setCanvasImageData({
                                    imageUrl: imgUri,
                                    index: idx,
                                    pythonCode: msg.executableCode?.[idx]?.code || msg.executableCode?.[0]?.code,
                                    messageText: msg.content,
                                    imagePrompt: msg.content,
                                    messageId: msg.id
                                  });
                                }}
                                onRegenerateVariation={() => {
                                  const basePrompt = msg.content || 'this scene';
                                  handleSendMessage(
                                    `Generate a creative alternative visual variation of ${basePrompt} with fresh visual angles, richer atmospheric lighting, and high compositional fidelity.`,
                                    undefined,
                                    msg.id
                                  );
                                }}
                                onEditWithAi={(ctx) => {
                                  setEditingContext({
                                    type: 'code',
                                    content: ctx.code || `[Figure ${idx + 1} Visualization Plot]`,
                                    language: 'python',
                                    title: ctx.title || `Figure ${idx + 1}`
                                  });
                                  if (textareaRef.current) {
                                    textareaRef.current.focus();
                                  }
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Notice Banner if resilient fallback was used */}
                        {msg.noticeMessage && !msg.isError && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-700 dark:text-blue-300">
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{msg.noticeMessage}</span>
                          </div>
                        )}

                        {/* Dedicated Error and Action Card if an error occurred */}
                        {msg.isError ? (
                          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3.5 text-slate-800 dark:text-zinc-200 shadow-2xs">
                            <div className="flex items-center gap-2.5 pb-2 border-b border-amber-200/60 dark:border-amber-900/40">
                              <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                                <AlertCircle className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                                  {msg.errorType === 'quota_limit' 
                                    ? 'Google Gemini API Quota Limit'
                                    : msg.errorType === 'timeout'
                                    ? 'Request Timed Out'
                                    : msg.errorType === 'overloaded'
                                    ? 'Google AI Service High Traffic'
                                    : msg.errorType === 'network'
                                    ? 'Network Connection Notice'
                                    : 'Gemini Assistant System Notice'}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                                  Complies with Google AI fair-use and service limits
                                </div>
                              </div>
                            </div>

                            <div className="text-xs leading-relaxed text-slate-700 dark:text-zinc-300 space-y-2">
                              <MathRenderer content={msg.content} />
                            </div>

                            {/* Action & Retry Quick Buttons */}
                            {msg.retryPrompt && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cleanMsgs = messages.filter((m) => m.id !== msg.id);
                                    updateActiveSession((s) => ({ ...s, messages: cleanMsgs }));
                                    handleSendMessage(msg.retryPrompt, {
                                      isRetry: true,
                                      overrideMessages: cleanMsgs
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Retry Prompt</span>
                                </button>

                                {selectedModel !== 'gemini-3.1-flash-lite' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedModel('gemini-3.1-flash-lite');
                                      const cleanMsgs = messages.filter((m) => m.id !== msg.id);
                                      updateActiveSession((s) => ({ ...s, messages: cleanMsgs }));
                                      handleSendMessage(msg.retryPrompt, {
                                        isRetry: true,
                                        overrideModel: 'gemini-3.1-flash-lite',
                                        overrideMessages: cleanMsgs
                                      });
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#282a2d] hover:bg-slate-100 dark:hover:bg-[#3c4043] border border-slate-200 dark:border-[#3c4043] text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Try with Flash Lite</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setInputMessage(msg.retryPrompt || '');
                                    navigator.clipboard.writeText(msg.retryPrompt || '');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#282a2d] hover:bg-slate-100 dark:hover:bg-[#3c4043] border border-slate-200 dark:border-[#3c4043] text-slate-600 dark:text-zinc-300 text-xs font-medium transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                  title="Copy prompt back to message box"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Load Prompt</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          (() => {
                            const { cleanContent: testCleanContent, testAction } = extractTestAction(msg.content);
                            const { cleanContent: rawCleanContent, appAction } = extractAppAction(testCleanContent);
                            let cleanContent = rawCleanContent;
                            // Only strip raw Python/Markdown code blocks when an image/plot artifact is actually rendered AND alternative text exists
                            if (
                              (msg.generatedImages && msg.generatedImages.length > 0) || 
                              msg.isAiGeneratedImage
                            ) {
                              const textWithoutCode = cleanContent.replace(/```[\s\S]*?```/g, '').trim();
                              if (textWithoutCode.length > 0) {
                                cleanContent = textWithoutCode;
                              }
                            }
                            
                            // If cleanContent is empty, fallback to raw message content
                            const displayContent = cleanContent || msg.content || '';

                            return (
                              <div className="math-markdown-content space-y-3 font-medium text-[17px] leading-relaxed text-slate-900 dark:text-zinc-100">
                                {displayContent ? <MathRenderer content={displayContent} /> : (
                                  (!msg.generatedImages || msg.generatedImages.length === 0) && (
                                    <span className="text-sm italic text-slate-400 dark:text-zinc-500">
                                      {msg.executableCode && msg.executableCode.length > 0 ? 'Computation executed in Python sandbox.' : 'No text content.'}
                                    </span>
                                  )
                                )}
                                {testAction && (
                                  <GeminiTestActionCard
                                    actionData={testAction}
                                    existingTests={tests}
                                    messageId={msg.id}
                                    onSaveTest={onSaveTest}
                                    onDeleteTest={onDeleteTest}
                                    onStartTest={onStartTest}
                                    onEditTest={onEditTest}
                                    isDarkMode={isDarkMode}
                                  />
                                )}
                                {appAction && !testAction && (
                                  <GeminiAppActionCard
                                    actionData={appAction}
                                    existingTests={tests}
                                    onNavigateTab={onNavigateTab as any}
                                    onStartTest={onStartTest}
                                    onEditTest={onEditTest}
                                    isDarkMode={isDarkMode}
                                  />
                                )}
                              </div>
                            );
                          })()
                        )}

                        {/* Collapsible Python Execution terminal panel - hidden for generated images/plots */}
                        {(!msg.generatedImages || msg.generatedImages.length === 0) && (!msg.isAiGeneratedImage) && ((msg.executableCode && msg.executableCode.length > 0) || (msg.codeExecutionResults && msg.codeExecutionResults.length > 0)) && (
                          <div className="mt-3 rounded-2xl border border-slate-200 dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#1a1b1c] overflow-hidden text-xs font-mono shadow-2xs">
                            <details className="group">
                              <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d]">
                                <div className="flex items-center gap-2">
                                  <Terminal className="w-4 h-4 text-blue-500" />
                                  <span>Python Sandbox Execution Logs</span>
                                </div>
                                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="p-4 border-t border-slate-200 dark:border-[#3c4043] space-y-3 max-h-80 overflow-y-auto bg-slate-950 text-slate-100">
                                {msg.executableCode?.map((item, idx) => (
                                  <div key={idx} className="space-y-1.5">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Executed Python Script:</div>
                                    <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">{item.code}</pre>
                                  </div>
                                ))}
                                {msg.codeExecutionResults?.map((item, idx) => (
                                  <div key={idx} className="space-y-1.5 pt-2 border-t border-slate-800">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${item.outcome === 'OUTCOME_OK' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                      <span>Console Output ({item.outcome === 'OUTCOME_OK' ? 'Success' : 'Execution Error'}):</span>
                                    </div>
                                    <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">{item.output || '(No console output returned)'}</pre>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}

                        {/* Action Bar for Assistant Message: Edit with AI, Retry, Copy, Speak, Delete (Plain Transparent Icon Buttons) */}
                        <div className="flex items-center gap-1 pt-1 text-slate-500 dark:text-zinc-400 select-none flex-wrap">
                          {/* Direct Edit with AI Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (inlineEditingMessageId === msg.id) {
                                setInlineEditingMessageId(null);
                              } else {
                                setInlineEditingMessageId(msg.id);
                                setInlineEditText('');
                              }
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 shadow-none ${
                              inlineEditingMessageId === msg.id
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/60'
                                : 'bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100'
                            }`}
                            title="Edit this response directly with AI"
                          >
                            <Sparkles className="w-4 h-4 text-blue-500" />
                          </button>

                          {/* Retry / Regenerate this specific message */}
                          <button
                            type="button"
                            onClick={() => handleRetryMessage(idx)}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 border-0 shadow-none transition-colors cursor-pointer"
                            title="Regenerate response"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          {/* Copy Message Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg)}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 border-0 shadow-none transition-colors cursor-pointer"
                            title="Copy response with images and formatting"
                          >
                            {copiedMessageId === msg.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>

                          {/* Save to Notes Button */}
                          <button
                            type="button"
                            onClick={() =>
                              handleSaveMessageToNotes(
                                msg.id,
                                msg.content,
                                msg.roleUsed,
                                msg.generatedImages,
                                msg.attachments,
                                msg.isAiGeneratedImage
                              )
                            }
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 shadow-none ${
                              savedToNotesMessageId === msg.id
                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60'
                                : 'bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100'
                            }`}
                            title={savedToNotesMessageId === msg.id ? 'Saved to Notes!' : 'Save response to Notes'}
                          >
                            {savedToNotesMessageId === msg.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Bookmark className="w-4 h-4" />}
                          </button>

                          {/* Speak / Read Aloud Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleSpeakMessage(msg.id, msg.content)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 shadow-none ${
                              speakingMessageId === msg.id
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/60'
                                : 'bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100'
                            }`}
                            title={speakingMessageId === msg.id ? 'Stop speaking' : 'Read response aloud'}
                          >
                            {speakingMessageId === msg.id ? <VolumeX className="w-4 h-4 animate-pulse text-blue-500" /> : <Volume2 className="w-4 h-4" />}
                          </button>

                          {/* Delete Assistant Message Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 border-0 shadow-none transition-colors cursor-pointer"
                            title="Delete this response"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Inline Prompt Input for this specific message */}
                        {inlineEditingMessageId === msg.id && (
                          <div className="mt-2.5 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300">
                              <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                                <span>Edit this response directly with AI</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setInlineEditingMessageId(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-xs cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={inlineEditText}
                                onChange={(e) => setInlineEditText(e.target.value)}
                                placeholder="Describe changes (e.g. explain in more detail, simplify, format as table, add 5 more questions)..."
                                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#18191c] border border-blue-200 dark:border-blue-850 text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey && inlineEditText.trim()) {
                                    e.preventDefault();
                                    const promptToSend = inlineEditText.trim();
                                    const contextObj: EditingContext = {
                                      type: 'message',
                                      content: msg.content,
                                      title: 'Assistant Response',
                                      targetMessageId: msg.id,
                                      prompt: promptToSend
                                    };
                                    setEditingContext(contextObj);
                                    handleSendMessage(promptToSend, undefined, msg.id, contextObj);
                                    setInlineEditingMessageId(null);
                                    setInlineEditText('');
                                  }
                                }}
                                autoFocus
                              />
                              <button
                                type="button"
                                disabled={!inlineEditText.trim() || isLoading}
                                onClick={() => {
                                  const promptToSend = inlineEditText.trim();
                                  if (!promptToSend) return;
                                  const contextObj: EditingContext = {
                                    type: 'message',
                                    content: msg.content,
                                    title: 'Assistant Response',
                                    targetMessageId: msg.id,
                                    prompt: promptToSend
                                  };
                                  setEditingContext(contextObj);
                                  handleSendMessage(promptToSend, undefined, msg.id, contextObj);
                                  setInlineEditingMessageId(null);
                                  setInlineEditText('');
                                }}
                                className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer disabled:opacity-50 active:scale-95 transition-all shrink-0"
                              >
                                Apply Edit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Gemini Thought & Reasoning Live Progress Card */}
          {isLoading && !editingTargetMessageId && (() => {
            const promptLower = (loadingPrompt || '').toLowerCase();
            const isTest = /\b(test|quiz|question|exam|library|score|attempt|mock|recalling|feynman|syllabus)\b/i.test(promptLower);
            const isPlot = /\b(matplotlib|numpy\s*plot|plot\s+the|plot\s+a|draw\s+a\s+(graph|chart|plot)|graph\s+of|curve\s+of|scatter\s*plot|vector\s*field|contour\s*plot|3d\s*(surface|mesh)|polar\s*plot|phase\s*portrait|run\s*python|execute\s*python)\b/i.test(promptLower);
            const isCalc = /\b(calculate|integral|derivative|equation|matrix|solve|proof|derive|formula)\b/i.test(promptLower);

            let phaseTitle = "Thinking";
            let phaseSub = "Formulating response...";

            if (isTest) {
              phaseTitle = "Searching Test Library";
              if (elapsedTime < 1.5) {
                phaseSub = "Scanning test repository & matching questions...";
              } else if (elapsedTime < 3.0) {
                phaseSub = "Verifying formulas & step-by-step LaTeX derivation...";
              } else {
                phaseSub = "Structuring interactive test review card...";
              }
            } else if (isPlot) {
              phaseTitle = "Generating Visual Plot";
              if (elapsedTime < 1.5) {
                phaseSub = "Analyzing function parameters & domain coordinates...";
              } else if (elapsedTime < 3.5) {
                phaseSub = "Executing Python sandbox & computing Matplotlib curves...";
              } else {
                phaseSub = "Rendering high-resolution plot & LaTeX annotations...";
              }
            } else if (isCalc) {
              phaseTitle = "Deriving Mathematical Solution";
              if (elapsedTime < 1.5) {
                phaseSub = "Breaking down formulas & boundary conditions...";
              } else if (elapsedTime < 3.0) {
                phaseSub = "Computing step-by-step algebraic steps in LaTeX...";
              } else {
                phaseSub = "Verifying numerical results & key takeaways...";
              }
            } else {
              phaseTitle = "Thinking";
              if (elapsedTime < 1.2) {
                phaseSub = "Analyzing query...";
              } else if (elapsedTime < 2.5) {
                phaseSub = "Synthesizing step-by-step response in LaTeX...";
              } else {
                phaseSub = "Finalizing answer...";
              }
            }

            return (
              <div className="flex w-full max-w-3xl mx-auto justify-start animate-fade-in">
                <div className="w-full max-w-xl">
                  <div className="p-3.5 rounded-2xl bg-[#f0f4f9] dark:bg-[#1e1f20] border-0 outline-none ring-0 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm bg-[#0b57d0] dark:bg-[#a8c7fa] animate-pulse" />
                        <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                          {phaseTitle}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                        {elapsedTime.toFixed(1)}s
                      </span>
                    </div>
                    {/* Sharp Progress Bar Track & Indicator */}
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-sm overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#0b57d0] via-indigo-600 to-[#a8c7fa] transition-all duration-300 rounded-sm animate-pulse" style={{ width: `${Math.min(98, Math.max(12, (elapsedTime / 3.5) * 100))}%` }} />
                    </div>
                    <div className="text-xs text-slate-600 dark:text-zinc-400 flex items-center gap-1.5 transition-all duration-300 font-medium">
                      <span>{phaseSub}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div ref={messagesEndRef} />
        </div>

        {/* Jump to Bottom Floating Button */}
        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 sm:bottom-24 right-6 sm:right-10 w-10 h-10 rounded-full bg-[#1a73e8] text-white shadow-lg flex items-center justify-center hover:bg-[#1557b0] transition-all cursor-pointer z-20 active:scale-95"
            title="Jump to latest message"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}

        {/* Floating Speech / Mic Notice Banner */}
        {speechNotification && (
          <div
            id="speech-notification-toast"
            className="px-4 py-2 mx-4 mb-2 rounded-xl bg-slate-900/90 dark:bg-zinc-800/95 text-white backdrop-blur-md shadow-lg border border-slate-700/60 dark:border-zinc-700/80 flex items-center justify-between gap-3 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 z-30"
          >
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                speechNotification.type === 'error'
                  ? 'bg-red-400'
                  : speechNotification.type === 'warning'
                  ? 'bg-amber-400'
                  : 'bg-blue-400'
              }`} />
              <span className="text-slate-200 dark:text-zinc-200 leading-snug">
                {speechNotification.message}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSpeechNotification(null)}
              className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Google AI Studio Prompt Bar Architecture */}
        <div className="pt-1.5 sm:pt-2 pb-[calc(max(0.85rem,env(safe-area-inset-bottom,0px))+0.25rem)] px-2 sm:px-4 bg-white dark:bg-[#131314] shrink-0 border-0 shadow-none">
          <GeminiStudioPromptBar
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onCancelRequest={handleCancelRequest}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
            onFileSelect={handleFileInputChange}
            onPreviewAttachment={(att) => setSelectedPreviewAttachment(att)}
            enableSearchGrounding={enableSearchGrounding}
            onToggleSearchGrounding={() => setEnableSearchGrounding(!enableSearchGrounding)}
            enableCodeExecution={enableCodeExecution}
            onToggleCodeExecution={() => setEnableCodeExecution(!enableCodeExecution)}
            isDictating={isDictating}
            onToggleDictation={toggleSpeechRecognition}
            isLiveTalkActive={isLiveTalkActive}
            liveTalkStatus={liveTalkStatus}
            liveTalkTranscript={liveTalkTranscript}
            isMicMuted={isMicMuted}
            isVoiceResponseEnabled={isVoiceResponseEnabled}
            onToggleLiveTalk={toggleLiveTalkMode}
            onToggleLiveTalkMic={toggleLiveTalkMic}
            onToggleVoiceResponse={toggleVoiceResponse}
            onSendLiveTalkPrompt={sendLiveTalkPrompt}
            onStopLiveTalk={stopLiveTalk}
            editingContext={editingContext}
            onCancelEditMode={() => setEditingContext(null)}
            currentModel={selectedModel}
            sessionFiles={sessionFiles}
            onOpenSessionFilesTestGenerator={() => {
              setEditingContext(null);
              setEditingTargetMessageId(null);
              setIsTestGeneratorModalOpen(true);
            }}
            onOpenImageGenerator={() => {
              setEditingContext(null);
              setEditingTargetMessageId(null);
              setIsImageGeneratorModalOpen(true);
            }}
            onOpenTableGenerator={() => {
              setEditingContext(null);
              setEditingTargetMessageId(null);
              setIsTableGeneratorModalOpen(true);
            }}
          />
        </div>
      </div>

      {/* Fullscreen Generated Plot Preview Modal */}
      {previewImageUrl && (
        <GeminiImageLightbox 
          src={previewImageUrl} 
          onClose={() => setPreviewImageUrl(null)} 
        />
      )}

      {/* Attachment Preview Modal */}
      {selectedPreviewAttachment && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedPreviewAttachment(null)}
        >
          <div 
            className="bg-white dark:bg-[#1e1f20] rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-xl animate-in zoom-in-98 duration-150 modal-content-smooth"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedPreviewAttachment(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-500 dark:text-zinc-300 cursor-pointer transition-all shrink-0 -ml-1"
                  title="Back to Chat (Esc)"
                  aria-label="Back to Chat"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 shrink-0">
                  {getFileIcon(selectedPreviewAttachment.name, selectedPreviewAttachment.mimeType)}
                </div>
                <span className="font-bold text-sm text-slate-900 dark:text-zinc-100 truncate">{selectedPreviewAttachment.name}</span>
              </div>
              <button
                onClick={() => setSelectedPreviewAttachment(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#282a2d] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer transition-all"
                title="Close preview (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedPreviewAttachment.previewUrl && selectedPreviewAttachment.previewUrl.trim() ? (
              <div className="max-h-96 overflow-hidden rounded-2xl flex items-center justify-center bg-black/5 dark:bg-black/40 p-2">
                <img
                  src={selectedPreviewAttachment.previewUrl}
                  alt={selectedPreviewAttachment.name}
                  className="max-h-92 object-contain rounded-xl"
                />
              </div>
            ) : selectedPreviewAttachment.mimeType === 'application/pdf' ? (
              <div className="p-8 text-center rounded-2xl bg-slate-50/80 dark:bg-[#131314]/80">
                <FileText className="w-12 h-12 text-red-500 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-800 dark:text-zinc-200">PDF Document Ready for Gemini Analysis</p>
                <p className="text-xs text-slate-400 mt-1">Processed natively during reasoning.</p>
              </div>
            ) : (
              <pre className="p-4 bg-[#131314] text-zinc-200 font-mono text-xs rounded-2xl max-h-80 overflow-auto whitespace-pre-wrap">
                {typeof selectedPreviewAttachment.data === 'string' && selectedPreviewAttachment.data.startsWith('data:')
                  ? atob(selectedPreviewAttachment.data.split(',')[1] || '')
                  : selectedPreviewAttachment.data}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Beautiful Custom State-Driven Confirmation Dialog (Bypasses Sandboxed Iframe limitations) */}
      {confirmModal && confirmModal.isOpen && (
        <div 
          className="fixed inset-0 z-55 bg-slate-950/60 dark:bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setConfirmModal(null)}
        >
          <div 
            className="bg-white dark:bg-[#1e1f20] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl animate-in zoom-in-98 duration-150 modal-content-smooth"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 shadow-xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-slate-900 dark:text-zinc-100">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4.5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Gemini Live Table Canvas Modal */}
      {canvasTableMarkdown && (
        <GeminiTableCanvasModal
          markdown={canvasTableMarkdown}
          messageId={canvasTableMessageId || undefined}
          isLoading={isLoading}
          onClose={() => {
            setCanvasTableMarkdown(null);
            setCanvasTableMessageId(null);
          }}
          onEditWithAi={(prompt, targetMessageId) => {
            const targetId = targetMessageId || canvasTableMessageId || undefined;
            handleSendMessage(prompt, undefined, targetId, {
              type: 'table',
              content: canvasTableMarkdown,
              title: 'Markdown Table',
              targetMessageId: targetId,
              prompt
            });
          }}
        />
      )}

      {/* 2. Gemini Test Canvas Modal */}
      {canvasTestData && (
        <GeminiTestCanvasModal
          test={canvasTestData.test}
          messageId={canvasTestData.messageId}
          existingTests={tests}
          isLoading={isLoading}
          onClose={() => setCanvasTestData(null)}
          onEditWithAi={(prompt, targetMessageId) => {
            const targetId = targetMessageId || canvasTestData.messageId;
            handleSendMessage(prompt, undefined, targetId, {
              type: 'test',
              content: JSON.stringify(canvasTestData.test, null, 2),
              title: canvasTestData.test.title,
              targetMessageId: targetId,
              prompt
            });
          }}
          onSaveTest={(t) => {
            if (onSaveTest) onSaveTest(t);
          }}
          onStartTest={(t, mode) => {
            if (onStartTest) onStartTest(t, mode);
          }}
          onEditTest={(t, opts) => {
            setCanvasTestData(null);
            if (onEditTest) onEditTest(t, opts);
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 3. Gemini Visual Image & Plot Canvas Modal */}
      {canvasImageData && (
        <GeminiImageCanvasModal
          imageUrl={canvasImageData.imageUrl}
          index={canvasImageData.index}
          pythonCode={canvasImageData.pythonCode}
          messageText={canvasImageData.messageText}
          imagePrompt={canvasImageData.imagePrompt}
          messageId={canvasImageData.messageId}
          isLoading={isLoading}
          onClose={() => setCanvasImageData(null)}
          onEditWithAi={(prompt, targetMessageId) => {
            const targetId = targetMessageId || canvasImageData.messageId;
            const isPlot = Boolean(canvasImageData.pythonCode);
            handleSendMessage(prompt, undefined, targetId, {
              type: isPlot ? 'code' : 'image',
              content: canvasImageData.pythonCode || canvasImageData.imagePrompt || canvasImageData.messageText || '',
              title: isPlot ? 'Visual Plot / Diagram' : (canvasImageData.imagePrompt || 'Visual Image Artwork'),
              targetMessageId: targetId,
              prompt
            });
          }}
          onRegenerateVariation={() => {
            const basePrompt = canvasImageData.imagePrompt || canvasImageData.messageText || 'this visual scene';
            handleSendMessage(
              `Generate a creative alternative visual variation of ${basePrompt} with fresh visual angles, richer atmospheric lighting, and high compositional fidelity.`,
              undefined,
              canvasImageData.messageId
            );
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Stateful Session Test Generator Modal */}
      <SessionTestGeneratorModal
        isOpen={isTestGeneratorModalOpen}
        onClose={() => setIsTestGeneratorModalOpen(false)}
        sessionFiles={sessionFiles}
        onGenerateTest={handleGenerateTestFromSession}
        isDarkMode={isDarkMode}
      />

      {/* Stateful Session Visual Image Generator Modal */}
      <SessionImageGeneratorModal
        isOpen={isImageGeneratorModalOpen}
        onClose={() => setIsImageGeneratorModalOpen(false)}
        sessionFiles={sessionFiles}
        onGenerateImage={handleGenerateImageFromModal}
        isDarkMode={isDarkMode}
      />

      {/* Stateful Session Data Table Generator Modal */}
      <SessionTableGeneratorModal
        isOpen={isTableGeneratorModalOpen}
        onClose={() => setIsTableGeneratorModalOpen(false)}
        sessionFiles={sessionFiles}
        onGenerateTable={handleGenerateTableFromModal}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
