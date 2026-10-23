import { MathTest, TestAttempt, UserProfile, ParsedAppAction, GeminiModelTier } from '../../types';
import { ParsedTestAction } from '../GeminiTestActionCard';

export type { GeminiModelTier };

export interface SessionStagedQuestion {
  id: string;
  sourceDocName?: string;
  questionNumber?: number | string;
  text: string;
  type: 'mcq' | 'numerical';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  points?: number;
}

export interface SessionDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
  uploadedAt: number;
  extractedQuestionCount?: number;
}

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

export interface PresetRole {
  id: string;
  name: string;
  tag: string;
  description: string;
  recommendedModel: GeminiModelTier;
  icon: any;
  badgeColor: string;
}

export interface SystemPresetPrompt {
  id: string;
  title: string;
  category: string;
  prompt: string;
  icon: any;
}
