export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Advanced';

export type MathTopic = 
  | 'Matrices and Determinants'
  | 'Mensuration'
  | 'Algebra' 
  | 'Calculus' 
  | 'Geometry' 
  | 'Trigonometry' 
  | 'Arithmetic & Numbers' 
  | 'Probability & Statistics' 
  | 'Linear Algebra'
  | 'General Mathematics';

export interface QuestionPaperLayout {
  optionLayout?: 'auto' | '4_across' | '2x2_grid' | 'stacked';
  breakBefore?: 'none' | 'column' | 'page';
  keepTogether?: boolean;
  imageUrl?: string; // Optional diagram URL override for paper layout
  imageWidth?: number; // Custom diagram width in question paper (pixels)
  imageWidths?: (number | undefined)[]; // Custom diagram widths for multiple diagrams in question paper (pixels)
}

export interface MathQuestion {
  id?: string;
  text: string;
  qtopic?: string; // Question-specific topic (distinct from test category)
  topic?: string;
  subtopic?: string;
  type?: 'mcq' | 'numerical';
  difficulty?: DifficultyLevel;
  options?: string[];
  correctAnswer: string; // Either the option text or numerical answer
  explanation?: string; // Step-by-step solution derivation
  solution?: string; // Alias for explanation in compact JSON
  points?: number;
  hint?: string;
  imageUrl?: string;
  imageWidth?: number; // Custom diagram width in question card (pixels)
  imageUrls?: string[]; // Multiple question diagrams
  imageWidths?: (number | undefined)[]; // Custom widths for multiple diagrams
  optionImages?: (string | undefined)[]; // Optional image diagrams for each option A, B, C, D
  optionImageWidths?: (number | undefined)[]; // Custom diagram widths for each option A, B, C, D
  explanationImageUrl?: string; // Optional image diagram for solution/explanation
  explanationImageWidth?: number; // Custom diagram width for explanation/solution
  explanationImageUrls?: string[]; // Multiple explanation diagrams
  explanationImageWidths?: (number | undefined)[]; // Custom widths for multiple explanation diagrams
  paperLayout?: QuestionPaperLayout;
}

export interface MathTest {
  id: string;
  title: string;
  description?: string;
  topic: MathTopic | string;
  category?: string;
  difficulty?: DifficultyLevel;
  time?: number; // Compact assessment property: time in minutes
  timeLimitMinutes?: number; // 0 for untimed
  durationMinutes?: number;
  totalMarks?: number;
  passingScorePercentage?: number;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  isPublic?: boolean;
  questionCount?: number;
  questions: MathQuestion[];
  createdAt?: string | number;
  updatedAt?: string | number;
  isLocalDraft?: boolean;
  _syncStatus?: 'synced' | 'pending' | 'failed';
}

export interface UserCustomNote {
  id: string;
  testId: string;
  attemptId: string;
  questionNumber?: number;
  content: string;
  tag: 'general' | 'formula' | 'trick' | 'mistake' | 'table';
  createdAt: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: 'image' | 'file' | 'pdf';
  driveFileId?: string;
  driveWebViewLink?: string;
  isDriveDirectFile?: boolean;
  isLocalAttachmentOnly?: boolean;
  _syncStatus?: 'synced' | 'pending' | 'failed';
}

/** Helper: Determine if a question is MCQ based on options presence */
export function isMcqQuestion(q: Partial<MathQuestion>): boolean {
  if (q.type === 'mcq') return true;
  if (q.type === 'numerical') return false;
  return Array.isArray(q.options) && q.options.length > 0;
}

/** Helper: Ensure every question in a test has a unique, non-empty id */
export function normalizeQuestions(questions: MathQuestion[]): MathQuestion[] {
  const seenIds = new Set<string>();
  return (questions || []).map((q, idx) => {
    const rawId = (q && q.id && typeof q.id === 'string' && q.id.trim() !== '') ? q.id.trim() : `q_${idx + 1}`;
    let qId = rawId;
    let counter = 1;
    while (seenIds.has(qId)) {
      qId = `${rawId}_${idx + 1}_${counter++}`;
    }
    seenIds.add(qId);
    return {
      ...q,
      id: qId,
    };
  });
}

/** Helper: Robustly verify whether an option matches the question's correct answer */
export function checkIsOptionCorrect(opt: string, optIdx: number, q: Partial<MathQuestion>): boolean {
  if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') return false;
  if (!opt && opt !== '') return false;

  const cleanOpt = String(opt).trim().toLowerCase();
  const cleanAns = String(q.correctAnswer).trim().toLowerCase();

  const norm = (str: string) =>
    str
      .trim()
      .toLowerCase()
      .replace(/^\$+|\$+$/g, '')
      .replace(/\s+/g, '')
      .replace(/[.,;:]+$/, '');

  const normAns = norm(cleanAns);
  const normOpt = norm(cleanOpt);

  const options = Array.isArray(q.options) ? q.options : [];

  // Step 1: If question has MCQ options, check if any option matches the correct answer by text or normalized math string
  if (options.length > 0) {
    const textMatchedIndices: number[] = [];
    options.forEach((o, idx) => {
      const cO = String(o).trim().toLowerCase();
      const nO = norm(cO);
      if (cO === cleanAns || nO === normAns) {
        textMatchedIndices.push(idx);
      }
    });

    if (textMatchedIndices.length > 0) {
      // If one or more options match the text/math of correctAnswer, ONLY those options are correct
      return textMatchedIndices.includes(optIdx);
    }
  } else {
    // If no options array (e.g. numerical question), simple direct/normalized text comparison
    if (cleanOpt === cleanAns || normOpt === normAns) return true;
  }

  // Step 2: If no option text matched q.correctAnswer directly, check if q.correctAnswer is a 0-based index or option letter
  if (optIdx >= 0) {
    // Single digit integer string: "0", "1", "2", "3"
    if (/^\d+$/.test(cleanAns)) {
      const targetIdx = parseInt(cleanAns, 10);
      if (optIdx === targetIdx) return true;
    }

    // Letter matching: 'a', 'b', 'c', 'd'
    const letter = String.fromCharCode(65 + optIdx).toLowerCase();
    if (
      cleanAns === letter ||
      cleanAns === `option ${letter}` ||
      cleanAns === `(${letter})` ||
      cleanAns === `${letter})` ||
      cleanAns === `option ${optIdx}` ||
      cleanAns === `index ${optIdx}`
    ) {
      return true;
    }
  }

  return false;
}

/** Helper: Robustly check whether an option matches what the user selected/submitted */
export function checkIsOptionSelected(opt: string, optIdx: number, userAns?: string, options?: string[]): boolean {
  if (userAns === undefined || userAns === null || userAns === '') return false;
  if (!opt && opt !== '') return false;

  const cleanOpt = String(opt).trim().toLowerCase();
  const cleanAns = String(userAns).trim().toLowerCase();

  const norm = (str: string) =>
    str
      .trim()
      .toLowerCase()
      .replace(/^\$+|\$+$/g, '')
      .replace(/\s+/g, '')
      .replace(/[.,;:]+$/, '');

  const normAns = norm(cleanAns);
  const normOpt = norm(cleanOpt);

  const opts = Array.isArray(options) ? options : [];

  // Step 1: Check if options array contains text matching userAns
  if (opts.length > 0) {
    const textMatchedIndices: number[] = [];
    opts.forEach((o, idx) => {
      const cO = String(o).trim().toLowerCase();
      const nO = norm(cO);
      if (cO === cleanAns || nO === normAns) {
        textMatchedIndices.push(idx);
      }
    });

    if (textMatchedIndices.length > 0) {
      return textMatchedIndices.includes(optIdx);
    }
  } else {
    if (cleanOpt === cleanAns || normOpt === normAns) return true;
  }

  // Step 2: Fallback to index / letter check if userAns didn't match option text directly
  if (optIdx >= 0) {
    if (/^\d+$/.test(cleanAns)) {
      const targetIdx = parseInt(cleanAns, 10);
      if (optIdx === targetIdx) return true;
    }

    const letter = String.fromCharCode(65 + optIdx).toLowerCase();
    if (
      cleanAns === letter ||
      cleanAns === `option ${letter}` ||
      cleanAns === `(${letter})` ||
      cleanAns === `${letter})` ||
      cleanAns === `option ${optIdx}` ||
      cleanAns === `index ${optIdx}`
    ) {
      return true;
    }
  }

  return false;
}

/** Helper: Get explanation or solution text */
export function getQuestionExplanation(q: Partial<MathQuestion>): string {
  return q.explanation || q.solution || '';
}

export interface QuestionAnswer {
  questionId: string;
  selectedOption: string;
  isCorrect: boolean;
  flagged: boolean;
  timeSpentSeconds: number;
}

export interface TestAttempt {
  id: string;
  testId: string;
  testTitle: string;
  testTopic: string;
  userId: string;
  userEmail: string;
  userName: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  timeSpentSeconds: number;
  answers: Record<string, QuestionAnswer>;
  attemptMode?: 'online' | 'omr';
  omrScannedImageUrl?: string;
  completedAt: string;
  createdAt: string;
  _syncStatus?: 'synced' | 'pending' | 'failed';
}

export interface OmrBubbleReading {
  option: string;
  optionIndex: number;
  fillRatio: number; // 0 to 1 (fill density)
  isMarked: boolean;
}

export interface OmrQuestionDetection {
  questionNumber: number;
  questionId: string;
  detectedOption: string; // 'A' | 'B' | 'C' | 'D' | ''
  confidence: number;
  isAmbiguous: boolean;
  isMultipleMarked?: boolean;
  bubbleReadings: OmrBubbleReading[];
  actualCorrectOption: string;
  isCorrect: boolean;
}

export interface OmrScanResult {
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  questionDetections: OmrQuestionDetection[];
  processedImageDataUrl?: string;
  cleanImageDataUrl?: string;
  refinedCenters?: { [key: string]: { x: number; y: number } };
  sheetFormat?: 'a4' | 'compact';
  detectedDimensions?: string;
  a4RatioMatch?: boolean;
}

export interface TopicStatRollup {
  attemptCount: number;
  scoreSum: number;
  questionsCorrect: number;
  questionsTotal: number;
  timeSpentSeconds: number;
}

export interface StatsRollup {
  totalTestsAttempted: number;
  totalQuestionsAnswered: number;
  totalQuestionsCorrect: number;
  totalScoreSum: number;
  totalTimeSpentSeconds: number;
  lastAttemptAt?: string;
  topicStats?: Record<string, TopicStatRollup>;
}

export interface CompactHistoryRecord {
  /** Test ID */
  i: string;
  /** Test Title */
  t?: string;
  /** Attempt count */
  c: number;
  /** Last updated epoch seconds */
  u: number;
  /** Last attempt summary [score, totalPoints, percentage, passed (1/0), timeSpentSec, epochSeconds] */
  l?: [number, number, number, number, number, number];
  /** First attempt summary [score, totalPoints, percentage, passed (1/0), timeSpentSec, epochSeconds] */
  f?: [number, number, number, number, number, number];
}

export interface AppSettings {
  temperature: number;
  aiModel?: string;
  theme?: 'light' | 'dark' | 'system';
  soundEnabled?: boolean;
  updatedAt?: string;
}

export interface TestHistoryEntry {
  testId: string;
  testTitle?: string;
  firstAttempt: TestAttempt;
  lastAttempt: TestAttempt;
  attemptCount: number;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  totalTestsCreated: number;
  totalTestsAttempted: number;
  totalQuestionsSolved: number;
  averageScore: number;
  deletedTestIds?: string[];
  statsRollup?: StatsRollup;
  settings?: AppSettings;
  testHistories?: Record<string, TestHistoryEntry>;
  notes?: Record<string, any>;
  bookmarks?: Record<string, any>;
  chatSessions?: Record<string, any>;
  createdTests?: Record<string, any>;
  activeSession?: ActiveTestSession | null;
}

export interface ActiveTestSession {
  testId: string;
  test: MathTest;
  mode: 'timed' | 'practice';
  hasStarted: boolean;
  currentIndex: number;
  answers: Record<string, { selectedOption: string; flagged: boolean; timeSpent: number }>;
  elapsedTime: number;
  timeLeft: number;
  updatedAt: string;
}

export type ActiveTab = 'tests' | 'create' | 'custom-builder' | 'take-test' | 'omr-test' | 'results' | 'analytics' | 'chatbot' | 'notes-repository' | 'bulk-print' | 'html-notes';

export interface ParsedAppAction {
  type: 'NAVIGATE' | 'LAUNCH_TEST' | 'OPEN_STUDIO' | 'OPEN_CUSTOM_BUILDER' | 'OPEN_OMR' | 'OPEN_ANALYTICS' | 'DIAGNOSE_WEAKNESSES' | 'EXPORT_DATA' | 'OPEN_HTML_NOTES' | 'OPEN_NOTES';
  title?: string;
  description?: string;
  targetTab?: ActiveTab;
  payload?: {
    testId?: string;
    testTitle?: string;
    mode?: 'timed' | 'practice';
    initialPrompt?: string;
    topic?: string;
    projectId?: string;
    fileId?: string;
  };
}

export type GeminiModelTier = 'gemini-3.8-flash' | 'gemini-flash-latest' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  data: string;
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

export interface ChatArchive {
  userId: string;
  sessions: ChatSession[];
  totalSessions: number;
  updatedAt: string;
  clientVersion: string;
}

