import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Award,
  Target,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Zap,
  BarChart2,
  Eye,
  RotateCcw,
  Layers,
  Sparkles,
  Compass,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Bot,
  Send,
  Lightbulb,
  X,
  Wand2,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Check,
  FileText
} from 'lucide-react';
import type { TestAttempt, MathTest, MathQuestion } from '../types';
import { isAttemptOmrMode } from '../lib/storage';
import { APP_STYLES } from './ui/AppStyles';

export interface TestReportAnalysisViewProps {
  attempt: TestAttempt;
  test?: MathTest | null;
  allTests?: MathTest[];
  onClose: () => void;
  onRetakeTest?: (testId: string) => void;
  onViewRawSolutions?: (attempt: TestAttempt) => void;
  onGenerateThetaCourse?: (prompt: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export interface SubtopicAnalysisItem {
  subtopic: string;
  parentTopic: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  accuracy: number;
  precision: number;
  attemptedCount: number;
  allQuestions: number[];
  questions: Array<{
    questionNumber: number;
    questionId: string;
    isCorrect: boolean;
    isAttempted: boolean;
    subtopic?: string;
  }>;
}

export interface TopicAnalysisItem {
  topic: string;
  parentTopic?: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  accuracy: number;
  precision: number;
  attemptedCount: number;
  allQuestions: number[];
  correctQuestions: number[];
  wrongQuestions: number[];
  skippedQuestions: number[];
  subtopics: string[];
  subtopicItems: SubtopicAnalysisItem[];
  questions: Array<{
    questionNumber: number;
    questionId: string;
    isCorrect: boolean;
    isAttempted: boolean;
    subtopic?: string;
  }>;
}

interface QuestionClassification {
  primaryName: string;
  parentTopic?: string;
  subtopic?: string;
}

/**
 * Question topic & subtopic classifier:
 * 1. Checks `topic` / `qtopic` for primary topic
 * 2. Checks `subtopic` for granular concept classification
 * 3. Falls back to defaultTopic
 */
function extractQuestionClassification(q: any, defaultTopic: string): QuestionClassification {
  if (!q) {
    return { primaryName: defaultTopic || 'General Mathematics' };
  }

  if (typeof q === 'string') {
    try {
      const parsed = JSON.parse(q);
      if (parsed && typeof parsed === 'object') {
        return extractQuestionClassification(parsed, defaultTopic);
      }
    } catch {}
  }

  const rawSubtopic = (q.subtopic && typeof q.subtopic === 'string' && q.subtopic.trim() ? q.subtopic.trim() : undefined) ||
                      (q.subTopic && typeof q.subTopic === 'string' && q.subTopic.trim() ? q.subTopic.trim() : undefined) ||
                      (q.sub_topic && typeof q.sub_topic === 'string' && q.sub_topic.trim() ? q.sub_topic.trim() : undefined) ||
                      (q.concept && typeof q.concept === 'string' && q.concept.trim() ? q.concept.trim() : undefined) ||
                      (q.conceptTopic && typeof q.conceptTopic === 'string' && q.conceptTopic.trim() ? q.conceptTopic.trim() : undefined) ||
                      (q.question?.subtopic && typeof q.question.subtopic === 'string' && q.question.subtopic.trim() ? q.question.subtopic.trim() : undefined) ||
                      (q.q?.subtopic && typeof q.q?.subtopic === 'string' && q.q.subtopic.trim() ? q.q.subtopic.trim() : undefined);
  const rawQtopic = q.qtopic || q.qTopic || q.QTopic || q.Qtopic || q.q_topic || q.questionTopic;
  const cleanQtopic = typeof rawQtopic === 'string' && rawQtopic.trim() ? rawQtopic.trim() : undefined;
  const cleanTopic = typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim() : undefined;

  let embeddedSubtopic: string | undefined = undefined;
  let embeddedTopic: string | undefined = undefined;
  if (typeof q.text === 'string') {
    if (q.text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(q.text);
        if (parsed?.subtopic && typeof parsed.subtopic === 'string' && parsed.subtopic.trim()) {
          embeddedSubtopic = parsed.subtopic.trim();
        }
        if (parsed?.topic && typeof parsed.topic === 'string' && parsed.topic.trim()) {
          embeddedTopic = parsed.topic.trim();
        }
      } catch {}
    }
  }

  const subtopic = rawSubtopic || embeddedSubtopic;
  const topic = cleanTopic || cleanQtopic || embeddedTopic || defaultTopic || 'General Mathematics';

  return {
    primaryName: topic,
    parentTopic: topic,
    subtopic: subtopic,
  };
}

function formatQuestionList(nums: number[]): string {
  if (!nums || nums.length === 0) return '';
  return nums.map((n) => `Q${n}`).join(', ');
}

export interface PresetAddon {
  id: string;
  label: string;
  queryText: string;
  icon: React.ComponentType<{ className?: string }>;
  isThetaSpecial?: boolean;
}

const PRESET_ADDONS: PresetAddon[] = [
  {
    id: 'theta_full_masterclass',
    label: 'Theta 6-Module Masterclass',
    queryText: 'Generate full Theta AI 6-module diagnostic remedial masterclass with step-by-step derivations and practice drills',
    icon: Bot,
    isThetaSpecial: true,
  },
  {
    id: 'theta_concept_recovery',
    label: 'Theta Concept Recovery',
    queryText: 'Theta in-depth concept recovery breaking down why these error traps occur and common misconceptions',
    icon: BrainCircuit,
    isThetaSpecial: true,
  },
  {
    id: 'theta_formula_drills',
    label: 'Theta High-Yield Drills',
    queryText: 'Theta formula cheat-sheet with rapid 30-second elimination drills and memory anchors',
    icon: Sparkles,
    isThetaSpecial: true,
  },
  {
    id: 'shortcuts_traps',
    label: 'Shortcut Tricks & Traps',
    queryText: 'Focus heavily on shortcut tricks, speed heuristics, and counterexample traps',
    icon: Zap,
  },
  {
    id: 'derivations',
    label: 'Theoretical Derivations',
    queryText: 'Deep step-by-step theoretical derivations and mathematical proofs',
    icon: BookOpen,
  },
  {
    id: 'practice_questions',
    label: '5 Practice Questions',
    queryText: 'Provide 5 challenging exam-level practice questions with complete solutions',
    icon: Target,
  },
  {
    id: 'formula_sheet',
    label: 'Formula Cheat-Sheet',
    queryText: 'Comprehensive high-yield formula cheat-sheet and identity summary table',
    icon: FileText,
  },
  {
    id: 'visual_analogies',
    label: 'Visual & Geometric Analogies',
    queryText: 'Intuitive geometric, physical, and visual analogies for abstract concepts',
    icon: Lightbulb,
  },
  {
    id: 'elimination_heuristics',
    label: '30s Elimination Checks',
    queryText: '30-second option elimination heuristics and quick sanity checks',
    icon: Clock,
  },
];

export const TestReportAnalysisView: React.FC<TestReportAnalysisViewProps> = ({
  attempt,
  test,
  allTests = [],
  onClose,
  onRetakeTest,
  onViewRawSolutions,
  onGenerateThetaCourse,
  onNavigateTab,
}) => {
  const [expandedPerformanceTopics, setExpandedPerformanceTopics] = useState<Record<string, boolean>>({});
  const [expandedActionableTopics, setExpandedActionableTopics] = useState<Record<string, boolean>>({});
  const [performanceFilter, setPerformanceFilter] = useState<'all' | 'strong' | 'actionable'>('all');
  const [extraAddonsPrompt, setExtraAddonsPrompt] = useState<string>('');
  const promptBarInputRef = useRef<HTMLInputElement>(null);

  // Guarantee clean scroll reset on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  const togglePerformanceTopic = (topicName: string) => {
    setExpandedPerformanceTopics((prev) => ({
      ...prev,
      [topicName]: !prev[topicName],
    }));
  };

  const toggleActionableTopic = (id: string) => {
    setExpandedActionableTopics((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleAllActionableTopics = () => {
    const allExpanded = actionableTopicGroups.length > 0 && actionableTopicGroups.every((g) => !!expandedActionableTopics[g.id]);
    const nextState: Record<string, boolean> = {};
    actionableTopicGroups.forEach((g) => {
      nextState[g.id] = !allExpanded;
    });
    setExpandedActionableTopics(nextState);
  };

  // Find associated test from props, embedded attempt data, or local storage
  const resolvedTest = useMemo(() => {
    if (test && Array.isArray(test.questions) && test.questions.length > 0) return test;

    // 1. Check allTests prop by ID or Title
    const foundInProps = allTests.find(
      (t) => (t && t.id && t.id === attempt.testId) || (t && t.title && t.title === attempt.testTitle)
    );
    if (foundInProps && Array.isArray(foundInProps.questions) && foundInProps.questions.length > 0) {
      return foundInProps;
    }

    // 2. Check embedded question arrays in attempt
    if ((attempt as any)?.test && Array.isArray((attempt as any).test.questions) && (attempt as any).test.questions.length > 0) {
      return (attempt as any).test;
    }
    if (Array.isArray((attempt as any)?.questions) && (attempt as any).questions.length > 0) {
      return {
        id: attempt.testId,
        title: attempt.testTitle,
        topic: attempt.testTopic,
        questions: (attempt as any).questions,
      } as MathTest;
    }

    // 3. Search storage across all scoped keys
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const scopedKeys = Object.keys(localStorage).filter((k) => k.startsWith('math_tests_scoped_'));
        for (const k of scopedKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const match = parsed.find(
                  (t: any) => (t && t.id === attempt.testId) || (t && t.title && t.title === attempt.testTitle)
                );
                if (match && Array.isArray(match.questions) && match.questions.length > 0) {
                  return match;
                }
              }
            }
          } catch {}
        }

        const extraKeys = ['math_tests_custom', 'custom_tests', 'math_practice_tests', 'saved_tests'];
        for (const k of extraKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const match = parsed.find(
                  (t: any) => (t && t.id === attempt.testId) || (t && t.title && t.title === attempt.testTitle)
                );
                if (match && Array.isArray(match.questions) && match.questions.length > 0) {
                  return match;
                }
              }
            }
          } catch {}
        }
      } catch {}
    }

    return test || foundInProps || null;
  }, [test, allTests, attempt]);

  const isOmr = isAttemptOmrMode(attempt);

  // Normalize questions & answers
  const answersMap = attempt.answers || {};
  const testQuestions: MathQuestion[] = resolvedTest?.questions || [];

  // Determine total questions
  const totalQuestions = Math.max(
    testQuestions.length,
    Object.keys(answersMap).length,
    attempt.totalPoints || 10
  );

  // Detailed question analysis list
  const questionDetails = useMemo(() => {
    const list = [];
    const baseTopic = resolvedTest?.topic || attempt.testTopic || 'General Mathematics';

    for (let i = 0; i < totalQuestions; i++) {
      const qNum = i + 1;
      const q = testQuestions[i] || null;
      const qId = q?.id || `q_${qNum}`;
      const ans = answersMap[qId] || answersMap[String(qNum)] || answersMap[String(i)] || null;

      const isAttempted = Boolean(ans && ans.selectedOption && ans.selectedOption.trim() !== '');
      const isCorrect = Boolean(ans && ans.isCorrect);
      const isWrong = isAttempted && !isCorrect;
      const isSkipped = !isAttempted;

      // Question-specific topic & subtopic classification
      let cls = extractQuestionClassification(q, '');
      if ((!cls.primaryName || cls.primaryName === '' || !cls.subtopic) && ans) {
        const ansCls = extractQuestionClassification(ans, '');
        if (!cls.primaryName || cls.primaryName === '') cls.primaryName = ansCls.primaryName;
        if (!cls.subtopic) cls.subtopic = ansCls.subtopic;
      }
      if (!cls.primaryName || cls.primaryName === '') {
        cls = { primaryName: baseTopic, parentTopic: baseTopic, subtopic: cls.subtopic };
      }

      list.push({
        questionNumber: qNum,
        questionId: qId,
        question: q,
        answer: ans,
        isAttempted,
        isCorrect,
        isWrong,
        isSkipped,
        topic: cls.primaryName,
        parentTopic: cls.parentTopic,
        subtopic: cls.subtopic,
        timeSpentSeconds: ans?.timeSpentSeconds || 0,
        selectedOption: ans?.selectedOption || '',
      });
    }
    return list;
  }, [totalQuestions, testQuestions, answersMap, resolvedTest, attempt]);

  // Aggregate metrics
  const correctCount = questionDetails.filter((q) => q.isCorrect).length;
  const attemptedCount = questionDetails.filter((q) => q.isAttempted).length;
  const wrongCount = Math.max(0, attemptedCount - correctCount);
  const skippedCount = Math.max(0, totalQuestions - attemptedCount);

  // Score & Metrics
  const score = attempt.score ?? correctCount;
  const totalPoints = attempt.totalPoints || totalQuestions;
  const scorePercentage = Math.round((score / Math.max(1, totalPoints)) * 100);
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const precision = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);
  const attemptRate = Math.round((attemptedCount / Math.max(1, totalQuestions)) * 100);

  // Negative marking impact
  const penaltyPoints = Number((wrongCount * 0.25).toFixed(2));
  const netEstimatedScore = Math.max(0, Number((score - penaltyPoints).toFixed(2)));

  // Time & Speed
  const totalTimeSpent = attempt.timeSpentSeconds || 0;
  const avgSecondsPerQuestion = attemptedCount > 0 ? Math.round(totalTimeSpent / attemptedCount) : 0;

  const pacingEvaluation = useMemo(() => {
    if (avgSecondsPerQuestion === 0) return { label: 'Standard Pace', color: 'text-blue-500' };
    if (avgSecondsPerQuestion < 35) return { label: 'Lightning Fast', color: 'text-amber-500' };
    if (avgSecondsPerQuestion <= 90) return { label: 'Optimal Speed', color: 'text-emerald-500' };
    return { label: 'Deliberate', color: 'text-purple-500' };
  }, [avgSecondsPerQuestion]);

  // Group by Question-Specific Topics (and nested Subtopics)
  const topicBreakdown = useMemo(() => {
    const topicMap: Record<string, {
      topic: string;
      parentTopic?: string;
      totalQuestions: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
      attemptedCount: number;
      allQuestions: number[];
      correctQuestions: number[];
      wrongQuestions: number[];
      skippedQuestions: number[];
      subtopicsMap: Record<string, {
        subtopic: string;
        parentTopic: string;
        totalQuestions: number;
        correctCount: number;
        wrongCount: number;
        skippedCount: number;
        attemptedCount: number;
        allQuestions: number[];
        questions: Array<{
          questionNumber: number;
          questionId: string;
          isCorrect: boolean;
          isAttempted: boolean;
          subtopic?: string;
        }>;
      }>;
      questions: Array<{
        questionNumber: number;
        questionId: string;
        isCorrect: boolean;
        isAttempted: boolean;
        subtopic?: string;
      }>;
    }> = {};

    questionDetails.forEach((q) => {
      const top = q.topic || 'General Mathematics';
      const sub = q.subtopic?.trim() || '';

      if (!topicMap[top]) {
        topicMap[top] = {
          topic: top,
          parentTopic: q.parentTopic,
          totalQuestions: 0,
          correctCount: 0,
          wrongCount: 0,
          skippedCount: 0,
          attemptedCount: 0,
          allQuestions: [],
          correctQuestions: [],
          wrongQuestions: [],
          skippedQuestions: [],
          subtopicsMap: {},
          questions: [],
        };
      }

      const tObj = topicMap[top];
      tObj.totalQuestions++;
      tObj.allQuestions.push(q.questionNumber);
      if (q.isAttempted) tObj.attemptedCount++;

      if (q.isCorrect) {
        tObj.correctCount++;
        tObj.correctQuestions.push(q.questionNumber);
      } else if (q.isWrong) {
        tObj.wrongCount++;
        tObj.wrongQuestions.push(q.questionNumber);
      } else if (q.isSkipped) {
        tObj.skippedCount++;
        tObj.skippedQuestions.push(q.questionNumber);
      }

      const qItem = {
        questionNumber: q.questionNumber,
        questionId: q.questionId,
        isCorrect: q.isCorrect,
        isAttempted: q.isAttempted,
        subtopic: q.subtopic,
      };

      tObj.questions.push(qItem);

      // Track subtopic under parent topic
      if (sub) {
        if (!tObj.subtopicsMap[sub]) {
          tObj.subtopicsMap[sub] = {
            subtopic: sub,
            parentTopic: top,
            totalQuestions: 0,
            correctCount: 0,
            wrongCount: 0,
            skippedCount: 0,
            attemptedCount: 0,
            allQuestions: [],
            questions: [],
          };
        }
        const sObj = tObj.subtopicsMap[sub];
        sObj.totalQuestions++;
        sObj.allQuestions.push(q.questionNumber);
        if (q.isAttempted) sObj.attemptedCount++;
        if (q.isCorrect) sObj.correctCount++;
        else if (q.isWrong) sObj.wrongCount++;
        else if (q.isSkipped) sObj.skippedCount++;
        sObj.questions.push(qItem);
      }
    });

    return Object.values(topicMap).map((t): TopicAnalysisItem => {
      const subtopicItems: SubtopicAnalysisItem[] = Object.values(t.subtopicsMap).map((s) => ({
        ...s,
        accuracy: s.attemptedCount > 0 ? Math.round((s.correctCount / s.attemptedCount) * 100) : 0,
        precision: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
      }));

      return {
        topic: t.topic,
        parentTopic: t.parentTopic,
        totalQuestions: t.totalQuestions,
        correctCount: t.correctCount,
        wrongCount: t.wrongCount,
        skippedCount: t.skippedCount,
        attemptedCount: t.attemptedCount,
        allQuestions: t.allQuestions,
        correctQuestions: t.correctQuestions,
        wrongQuestions: t.wrongQuestions,
        skippedQuestions: t.skippedQuestions,
        subtopics: Object.keys(t.subtopicsMap),
        subtopicItems,
        questions: t.questions,
        accuracy: t.attemptedCount > 0 ? Math.round((t.correctCount / t.attemptedCount) * 100) : 0,
        precision: t.totalQuestions > 0 ? Math.round((t.correctCount / t.totalQuestions) * 100) : 0,
      };
    });
  }, [questionDetails]);

  // Strong Topics (Validated: Attempted > 0, Accuracy >= 75%, Correct > Wrong, and adequate coverage)
  const strongTopics = useMemo(() => {
    return topicBreakdown.filter((t) => {
      const coverageRate = t.totalQuestions > 0 ? t.attemptedCount / t.totalQuestions : 0;
      return t.attemptedCount > 0 && t.accuracy >= 75 && t.correctCount > t.wrongCount && (coverageRate >= 0.5 || t.totalQuestions <= 2);
    });
  }, [topicBreakdown]);

  // Weaker Topics (Actionable: Attempted with Accuracy < 60% OR Wrong >= Correct)
  const weakTopics = useMemo(() => {
    return topicBreakdown.filter((t) => {
      return t.attemptedCount > 0 && (t.accuracy < 60 || t.wrongCount >= t.correctCount);
    });
  }, [topicBreakdown]);

  // Actionable Improvements organized Topic-Wise (Consistent 4-Tier Logic)
  const actionableTopicGroups = useMemo(() => {
    const list: Array<{
      id: string;
      topic: string;
      title: string;
      totalQuestions: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
      accuracy: number;
      statusBadge: string;
      statusType: 'danger' | 'warning' | 'info' | 'success';
      description: string;
      recommendation: string;
      subtopicItems: SubtopicAnalysisItem[];
    }> = [];

    topicBreakdown.forEach((t) => {
      const hasAttempted = t.attemptedCount > 0;
      const coverageRate = t.totalQuestions > 0 ? t.attemptedCount / t.totalQuestions : 0;
      const isStrong = hasAttempted && t.accuracy >= 75 && t.correctCount > t.wrongCount && (coverageRate >= 0.5 || t.totalQuestions <= 2);

      if (!hasAttempted) {
        list.push({
          id: `topic-unattempted-${t.topic}`,
          topic: t.topic,
          title: `${t.topic} (Unattempted)`,
          totalQuestions: t.totalQuestions,
          correctCount: 0,
          wrongCount: 0,
          skippedCount: t.totalQuestions,
          accuracy: 0,
          statusBadge: 'Unattempted',
          statusType: 'info',
          description: `All ${t.totalQuestions} question(s) in ${t.topic} were skipped without an attempt.`,
          recommendation: `Expand your question coverage in ${t.topic} by practicing faster formula identification so you can attempt these questions.`,
          subtopicItems: t.subtopicItems,
        });
      } else if (!isStrong) {
        const isCritical = t.accuracy < 50 || t.wrongCount >= t.correctCount;
        let recommendation = `Review standard definitions, theorem hypotheses, and key counterexamples in ${t.topic}.`;
        if (t.accuracy < 50) {
          recommendation = `Priority revision required: Rebuild foundational concepts in ${t.topic} (${t.correctCount} correct, ${t.wrongCount} wrong). Work through step-by-step example derivations before re-attempting.`;
        } else if (t.accuracy < 70) {
          recommendation = `Strengthen problem recognition in ${t.topic}: Solve targeted practice problems to eliminate algebraic and boundary-case slips.`;
        } else if (coverageRate < 0.5) {
          recommendation = `High accuracy on solved questions, but ${t.skippedCount} question(s) were skipped in ${t.topic}. Expand your practice coverage to attempt all questions with speed.`;
        } else if (t.wrongCount > 0) {
          recommendation = `Examine the solution notes for the ${t.wrongCount} missed question(s) in ${t.topic} to understand subtle counterexamples or formula constraints.`;
        }

        const filteredSubtopics = t.subtopicItems.filter(
          (s) => s.wrongCount > 0 || (s.attemptedCount > 0 && s.accuracy < 70) || (s.attemptedCount === 0 && s.totalQuestions > 0)
        );
        const subtopicItems = filteredSubtopics.length > 0 ? filteredSubtopics : t.subtopicItems;

        list.push({
          id: `topic-${t.topic}`,
          topic: t.topic,
          title: t.topic,
          totalQuestions: t.totalQuestions,
          correctCount: t.correctCount,
          wrongCount: t.wrongCount,
          skippedCount: t.skippedCount,
          accuracy: t.accuracy,
          statusBadge: isCritical ? 'High Priority' : coverageRate < 0.5 ? 'Partial Coverage' : 'Needs Practice',
          statusType: isCritical ? 'danger' : 'warning',
          description: `Under ${t.topic} (${t.totalQuestions} questions total), ${t.correctCount} answered correctly, ${t.wrongCount} answered incorrectly, and ${t.skippedCount} left unattempted.`,
          recommendation,
          subtopicItems,
        });
      }
    });

    return list;
  }, [topicBreakdown]);

  // Unified Performance & Actionable Items (Professional 4-Tier Categorization)
  const unifiedPerformanceItems = useMemo(() => {
    return topicBreakdown.map((t) => {
      const hasAttempted = t.attemptedCount > 0;
      const netScore = Math.max(0, Number((t.correctCount - 0.25 * t.wrongCount).toFixed(2)));
      const coverageRate = t.totalQuestions > 0 ? t.attemptedCount / t.totalQuestions : 0;
      const precisionRate = t.totalQuestions > 0 ? Math.round((t.correctCount / t.totalQuestions) * 100) : 0;

      let category: 'strong' | 'moderate' | 'weak' | 'unattempted';
      let statusBadge: string;
      let statusType: 'success' | 'warning' | 'danger' | 'info';
      let recommendation: string;

      if (!hasAttempted) {
        // Tier 1: 0 questions attempted -> Unattempted (Never marked as Strong or 0% Weaker!)
        category = 'unattempted';
        statusBadge = 'Unattempted';
        statusType = 'info';
        recommendation = `You skipped all ${t.totalQuestions} question(s) in ${t.topic}. Practice timed solving to build confidence and attempt these questions next time.`;
      } else if (
        t.accuracy >= 75 &&
        t.correctCount > t.wrongCount &&
        (coverageRate >= 0.5 || t.totalQuestions <= 2)
      ) {
        // Tier 2: Strong / Mastered (High accuracy >= 75%, more correct than wrong, at least 50% attempted)
        category = 'strong';
        const isMastered = t.wrongCount === 0 && t.skippedCount === 0;
        statusBadge = isMastered ? 'Mastered' : 'Strong';
        statusType = 'success';
        recommendation = `Excellent mastery in ${t.topic}! Solved ${t.correctCount}/${t.totalQuestions} with ${t.accuracy}% accuracy. Continue practicing challenging problem variations to maintain speed.`;
      } else if (
        (t.accuracy >= 60 && t.correctCount > t.wrongCount) ||
        (t.accuracy >= 75 && coverageRate < 0.5)
      ) {
        // Tier 3: Moderate / Developing (60-74% accuracy OR high accuracy on < 50% coverage)
        category = 'moderate';
        statusBadge = coverageRate < 0.5 ? 'Partial Coverage' : 'Developing';
        statusType = 'warning';
        if (coverageRate < 0.5) {
          recommendation = `High accuracy on attempted questions, but ${t.skippedCount} question(s) were skipped in ${t.topic}. Expand your practice coverage so you can solve all questions with confidence.`;
        } else {
          recommendation = `Solid foundation in ${t.topic} with ${t.accuracy}% accuracy, but ${t.wrongCount} question(s) were incorrect. Practice targeted problems to eliminate careless slips.`;
        }
      } else {
        // Tier 4: Weaker / Needs Practice (Accuracy < 60% OR Wrong >= Correct)
        category = 'weak';
        const isCritical = t.accuracy < 40 || (t.wrongCount >= t.correctCount && t.wrongCount > 1);
        statusBadge = isCritical ? 'High Priority' : 'Needs Practice';
        statusType = isCritical ? 'danger' : 'warning';
        if (isCritical) {
          recommendation = `Priority revision required: Rebuild foundational concepts and formulas in ${t.topic} (${t.correctCount} correct, ${t.wrongCount} incorrect). Review step-by-step solutions before re-testing.`;
        } else {
          recommendation = `Needs practice in ${t.topic}: Review the solution notes for the ${t.wrongCount} missed question(s) to understand formula constraints and standard counterexamples.`;
        }
      }

      const isStrong = category === 'strong';

      return {
        id: `unified-${t.topic}`,
        topic: t.topic,
        title: t.topic,
        totalQuestions: t.totalQuestions,
        correctCount: t.correctCount,
        wrongCount: t.wrongCount,
        skippedCount: t.skippedCount,
        attemptedCount: t.attemptedCount,
        accuracy: t.accuracy,
        precision: precisionRate,
        netScore,
        category,
        isStrong,
        statusBadge,
        statusType,
        recommendation,
        subtopicItems: t.subtopicItems || [],
        questions: t.questions,
      };
    });
  }, [topicBreakdown]);

  const strongCount = useMemo(() => unifiedPerformanceItems.filter((i) => i.isStrong).length, [unifiedPerformanceItems]);
  const actionableCount = useMemo(() => unifiedPerformanceItems.filter((i) => !i.isStrong).length, [unifiedPerformanceItems]);

  const filteredPerformanceItems = useMemo(() => {
    if (performanceFilter === 'strong') {
      return unifiedPerformanceItems.filter((item) => item.isStrong);
    }
    if (performanceFilter === 'actionable') {
      return unifiedPerformanceItems.filter((item) => !item.isStrong);
    }
    return unifiedPerformanceItems;
  }, [unifiedPerformanceItems, performanceFilter]);

  // Toggle or append a preset add-on to extraAddonsPrompt
  const handleTogglePresetAddon = (addon: PresetAddon) => {
    const cleanLabel = addon.label.trim();
    const cleanQuery = addon.queryText.trim();
    const isPresent = extraAddonsPrompt.toLowerCase().includes(cleanLabel.toLowerCase()) || 
                      extraAddonsPrompt.toLowerCase().includes(cleanQuery.toLowerCase());
    
    if (isPresent) {
      // Remove it
      const escapedLabel = cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[,\\s]*(${escapedLabel}|${escapedQuery})[,\\s]*`, 'gi');
      const updated = extraAddonsPrompt.replace(regex, ', ').replace(/^,\s*|,\s*$/g, '').trim();
      setExtraAddonsPrompt(updated);
    } else {
      // Append it
      const updated = extraAddonsPrompt.trim()
        ? `${extraAddonsPrompt.trim()}, ${cleanLabel}`
        : cleanLabel;
      setExtraAddonsPrompt(updated);
    }
    if (promptBarInputRef.current) {
      promptBarInputRef.current.focus();
    }
  };

  // Trigger Theta AI Course Material Generator in a new conversation
  const handleGenerateThetaMaterial = () => {
    const weakItems = topicBreakdown.filter(
      (t) => t.wrongCount > 0 || (t.attemptedCount > 0 && t.accuracy < 70) || t.skippedCount > 0
    );

    let promptText = `# 📚 Master Remedial Crash Course & Actionable Study Guide: "${attempt.testTitle || 'Mathematics Assessment'}"\n\n`;
    promptText += `Please generate an in-depth, structured revision masterclass based on my diagnostic performance on **"${attempt.testTitle || 'Mathematics Assessment'}"**.\n`;
    promptText += `**Diagnostic Score:** ${score}/${totalPoints} points (${accuracy}% Accuracy) • **Total Questions:** ${totalQuestions} (${correctCount} Correct, ${wrongCount} Wrong, ${skippedCount} Skipped)\n\n`;
    
    promptText += `## 🎯 Target Topics & Actionable Improvement Focus Areas:\n`;

    if (weakItems.length > 0) {
      weakItems.forEach((t, idx) => {
        promptText += `\n### ${idx + 1}. Chapter / Topic: **${t.topic}**\n`;
        promptText += `- **Performance:** ${t.correctCount}/${t.totalQuestions} Correct (${t.accuracy}% Accuracy), ${t.wrongCount} Incorrect, ${t.skippedCount} Skipped\n`;
        
        const subtopicsWithIssues = t.subtopicItems.filter(
          (s) => s.wrongCount > 0 || (s.attemptedCount > 0 && s.accuracy < 70) || s.skippedCount > 0
        );
        if (subtopicsWithIssues.length > 0) {
          promptText += `- **Target Subtopic Focus Areas & Missed Concepts:**\n`;
          subtopicsWithIssues.forEach((s) => {
            promptText += `  • **${s.subtopic}**: Question(s) ${formatQuestionList(s.allQuestions)} (Accuracy: ${s.accuracy}%, ${s.wrongCount} Wrong, ${s.skippedCount} Skipped)\n`;
          });
        } else if (t.subtopics.length > 0) {
          promptText += `- **Covered Subtopics:** ${t.subtopics.join(', ')}\n`;
        }
      });
    } else {
      promptText += `All primary topics achieved high accuracy. Covered topics: ${topicBreakdown.map((t) => t.topic).join(', ')}.\n`;
    }

    if (extraAddonsPrompt && extraAddonsPrompt.trim()) {
      promptText += `\n## 💡 Custom User Directives & Extra Add-ons (High Priority):\n`;
      promptText += `> **User Request:** "${extraAddonsPrompt.trim()}"\n\n`;
      promptText += `*(Note: Please explicitly customize the explanations, depth of proofs, problem difficulty, and special focus topics to fulfill this custom directive above.)*\n`;
    }

    promptText += `\n## 📐 Structural Modules Required (Produce a Full Masterclass):\n`;
    promptText += `Please generate a comprehensive, pedagogical course using clean Markdown headings, bullet points, and LaTeX mathematical typesetting ($...$ for inline formulas, $$...$$ for standalone display equations) structured across these 6 modules:\n\n`;
    
    promptText += `### Module 1: Diagnostic Deconstruction & Error Traps\n`;
    promptText += `- Why students commonly stumble in the target subtopics above.\n`;
    promptText += `- Detail subtle counterexamples, sign flips, non-invertible edge cases, domain restrictions, and boundary conditions.\n\n`;

    promptText += `### Module 2: Rigorous Theoretical Foundations & Geometric Intuition\n`;
    promptText += `- Formal mathematical definitions, statements of key theorems, and concise proof sketches.\n`;
    promptText += `- Intuitive geometric or physical analogies to ground abstract algebraic/calculus concepts.\n\n`;

    promptText += `### Module 3: High-Yield Formula Sheet & Speed Shortcuts\n`;
    promptText += `- Summary table/list of core properties, identities, matrix properties, and transformation rules.\n`;
    promptText += `- Rapid elimination shortcuts, special value substitutions, and 30-second sanity checks for competitive tests.\n\n`;

    promptText += `### Module 4: Step-by-Step Worked Exemplar Derivations\n`;
    promptText += `- 2 to 3 detailed, worked-out master problems specifically targeting the weak subtopics.\n`;
    promptText += `- Provide full step-by-step LaTeX derivations with clear commentary on each transformation step.\n\n`;

    promptText += `### Module 5: Targeted Retention Practice Set (with Step-by-Step Solutions)\n`;
    promptText += `- 3 to 5 graded practice questions ranging from conceptual to advanced exam difficulty.\n`;
    promptText += `- Provide complete mathematical derivations and explanations for each problem.\n\n`;

    promptText += `### Module 6: 3-Day Actionable Retention & Mastery Plan\n`;
    promptText += `- Day 1: Concept Reconstruction & Proof Review\n`;
    promptText += `- Day 2: Timed Formula Recall & Speed Drills\n`;
    promptText += `- Day 3: Full Re-assessment & Error Elimination\n`;

    if (onGenerateThetaCourse) {
      onGenerateThetaCourse(promptText);
    } else if (onNavigateTab) {
      try {
        localStorage.setItem('theta_initial_prompt_pending', promptText);
      } catch {}
      onNavigateTab('chatbot');
    }
  };

  // Format date helper
  const formattedDate = useMemo(() => {
    const raw = attempt.completedAt || attempt.createdAt;
    if (!raw) return 'Recently';
    try {
      const d = new Date(raw);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  }, [attempt]);

  return (
    <div className={`fixed inset-0 z-50 ${APP_STYLES.page} overflow-y-auto flex flex-col font-sans select-text [scrollbar-width:thin]`}>
      {/* Transparent Clean Header Banner (Minimal, No Subtopic Tags at Top) */}
      <div className="max-w-[1750px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
        <div className="flex items-center justify-between gap-3 px-0.5 py-1">
          {/* Left: Icon-Only Back Button & Test Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              id="report-back-btn"
              type="button"
              onClick={onClose}
              className={APP_STYLES.button.icon}
              title="Back to History"
              aria-label="Back to History"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-zinc-200" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
                  {attempt.testTitle || 'Test Report & Analysis'}
                </h1>
                {isOmr ? (
                  <span className={APP_STYLES.pill.amber}>
                    OMR
                  </span>
                ) : (
                  <span className={APP_STYLES.pill.blue}>
                    Online
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                <span>{attempt.testTopic || 'Mathematics'}</span>
                <span>•</span>
                <span>{formattedDate}</span>
              </p>
            </div>
          </div>

          {/* Right: Actions (View Solutions) */}
          <div className="flex items-center gap-2">
            {onViewRawSolutions && (
              <button
                id="report-top-view-solutions-btn"
                type="button"
                onClick={() => onViewRawSolutions(attempt)}
                className="w-9 h-9 sm:w-auto sm:h-9 sm:px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-xs border-0 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none"
                title="View full step-by-step solutions"
              >
                <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.2]" />
                <span className="hidden sm:inline">View Solutions</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Report Body Container */}
      <main className="flex-1 max-w-[1750px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-1 pb-10 space-y-4">
        {/* ==================================================================== */}
        {/* 1. SCORECARD & PRIMARY KPI HERO SECTION                              */}
        {/* ==================================================================== */}
        <div className={`${APP_STYLES.card.base} p-5 sm:p-6 space-y-4`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#2c3040]">
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                Test Scorecard
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Performance Overview
              </h2>
            </div>

            {/* Pass / Status Badge */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold border-0 ring-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{attempt.passed ? 'PASSED' : 'SCORED'}</span>
            </div>
          </div>

          {/* KPI Grid - Minimal Surfaces with Thin Border Ring */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
            {/* KPI 1: Score & Points */}
            <div className="bg-white dark:bg-[#181a20] rounded-[24px] p-4 ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1">
                <span className="text-xs font-bold">Total Score</span>
                <Award className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-[#0b57d0] dark:text-[#a8c7fa]">
                  {score} <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">/ {totalPoints}</span>
                </div>
                <p className="text-[10.5px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5">
                  {scorePercentage}% Score
                </p>
              </div>
            </div>

            {/* KPI 2: Accuracy */}
            <div className="bg-white dark:bg-[#181a20] rounded-[24px] p-4 ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1">
                <span className="text-xs font-bold">Accuracy</span>
                <Target className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-zinc-100">
                  {accuracy}%
                </div>
                <p className="text-[10.5px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5">
                  {correctCount} of {attemptedCount} attempted
                </p>
              </div>
            </div>

            {/* KPI 3: Precision / Efficiency */}
            <div className="bg-white dark:bg-[#181a20] rounded-[24px] p-4 ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1">
                <span className="text-xs font-bold">Precision</span>
                <Compass className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-zinc-100">
                  {precision}%
                </div>
                <p className="text-[10.5px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5">
                  Net: ~{netEstimatedScore} pts
                </p>
              </div>
            </div>

            {/* KPI 4: Time Spent & Pacing */}
            <div className="bg-white dark:bg-[#181a20] rounded-[24px] p-4 ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1">
                <span className="text-xs font-bold">Avg. Speed</span>
                <Clock className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-zinc-100">
                  {avgSecondsPerQuestion > 0 ? `${avgSecondsPerQuestion}s` : 'N/A'}
                </div>
                <p className={`text-[10.5px] font-bold ${pacingEvaluation.color} mt-0.5`}>
                  {pacingEvaluation.label}
                </p>
              </div>
            </div>
          </div>

          {/* Response Distribution Strip with Thin Border Ring */}
          <div className="bg-white dark:bg-[#181a20] rounded-[24px] p-4 sm:p-5 ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none space-y-2.5 transition-all">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-900 dark:text-zinc-100">
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                Response Distribution ({totalQuestions} Total Questions)
              </span>
              <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Attempt Rate: {attemptRate}%</span>
            </div>

            {/* Multi-segment Bar */}
            <div className="h-2.5 w-full bg-slate-200/70 dark:bg-[#252830] rounded-full overflow-hidden flex">
              <div
                style={{ width: `${(correctCount / totalQuestions) * 100}%` }}
                className="bg-[#0b57d0] dark:bg-[#a8c7fa] h-full"
                title={`Correct: ${correctCount}`}
              />
              <div
                style={{ width: `${(wrongCount / totalQuestions) * 100}%` }}
                className="bg-rose-500 h-full"
                title={`Wrong: ${wrongCount}`}
              />
              <div
                style={{ width: `${(skippedCount / totalQuestions) * 100}%` }}
                className="bg-slate-300 dark:bg-zinc-600 h-full"
                title={`Skipped: ${skippedCount}`}
              />
            </div>

            {/* Count Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] font-bold border-0 ring-0">
                <CheckCircle2 className="w-3 h-3" />
                <span>{correctCount} Correct</span>
              </div>
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border-0 ring-0">
                <XCircle className="w-3 h-3" />
                <span>{wrongCount} Incorrect</span>
              </div>
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-500/10 text-slate-700 dark:text-zinc-300 font-bold border-0 ring-0">
                <MinusCircle className="w-3 h-3" />
                <span>{skippedCount} Skipped</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* 2. TOPIC-WISE PERFORMANCE & ACTIONABLE INSIGHTS (UNIFIED SECTION)     */}
        {/* ==================================================================== */}
        <div className={`${APP_STYLES.card.base} p-5 sm:p-6 space-y-4`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-[#2c3040]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold shrink-0 border-0 ring-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                  Topic-Wise Performance &amp; Actionable Insights
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Complete chapter &amp; subtopic concept classification paired with targeted AI recommendations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Filter Tabs */}
              <div className="flex items-center bg-slate-100/80 dark:bg-[#141619] p-1 rounded-full gap-1 border border-slate-300 dark:border-zinc-700 shadow-xs">
                <button
                  type="button"
                  onClick={() => setPerformanceFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 ${
                    performanceFilter === 'all'
                      ? 'bg-white dark:bg-[#282a30] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({unifiedPerformanceItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceFilter('strong')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 ${
                    performanceFilter === 'strong'
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Strong ({strongCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceFilter('actionable')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 ${
                    performanceFilter === 'actionable'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Actionable Focus ({actionableCount})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const allKeys = filteredPerformanceItems.map((item) => item.id);
                  const allExpanded = allKeys.every((k) => !!expandedPerformanceTopics[k]);
                  const nextState: Record<string, boolean> = { ...expandedPerformanceTopics };
                  allKeys.forEach((k) => {
                    nextState[k] = !allExpanded;
                  });
                  setExpandedPerformanceTopics(nextState);
                }}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-white hover:bg-slate-50 text-slate-700 dark:text-zinc-200 dark:bg-[#282a30] dark:hover:bg-[#34374a] border border-slate-300 dark:border-zinc-700 transition-colors cursor-pointer ring-0 shadow-xs active:scale-95"
              >
                Toggle All
              </button>
            </div>
          </div>

          {/* Unified Dynamic Grid - Topic Cards */}
          <div
            className={`grid gap-3 lg:gap-4 ${
              filteredPerformanceItems.length === 1
                ? 'grid-cols-1'
                : filteredPerformanceItems.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {filteredPerformanceItems.length > 0 ? (
              filteredPerformanceItems.map((item) => {
                const isExpanded = !!expandedPerformanceTopics[item.id];
                const subItems = item.subtopicItems || [];
                const isStronger = item.isStrong;

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-[#181a20] rounded-[24px] ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none overflow-hidden flex flex-col justify-between transition-all"
                  >
                    <div>
                      {/* Main Clickable Topic Row */}
                      <div
                        onClick={() => togglePerformanceTopic(item.id)}
                        className="p-3.5 sm:p-4 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors select-none"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate" title={item.topic}>
                              {item.topic}
                            </h4>
                            {subItems.length > 0 && (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 shrink-0">
                                ({subItems.length} {subItems.length === 1 ? 'subtopic' : 'subtopics'})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>
                              {item.correctCount}/{item.totalQuestions} Correct {item.attemptedCount > 0 ? `(${item.accuracy}%)` : '(0% attempted)'}
                            </span>
                            <span>•</span>
                            <span>{item.wrongCount} Wrong</span>
                            <span>•</span>
                            <span>{item.skippedCount} Skipped</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border-0 ring-0 ${
                              item.category === 'strong'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : item.category === 'moderate'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : item.category === 'unattempted'
                                ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                                : item.statusType === 'danger'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {item.statusBadge}
                          </span>
                          <button
                            type="button"
                            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#252830] border-0 ring-0 flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-transform cursor-pointer"
                            aria-label="Toggle subtopics dropdown"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Subtopics Breakdown & AI Action Recommendation */}
                      {isExpanded && (
                        <div className="p-3 pt-1.5 border-t border-slate-100 dark:border-zinc-800 space-y-2 bg-slate-50/70 dark:bg-black/20 text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                            Subtopic Concept Breakdown ({subItems.length}):
                          </span>

                          <div
                            className={`grid gap-1.5 ${
                              filteredPerformanceItems.length === 1
                                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'
                                : 'grid-cols-1'
                            }`}
                          >
                            {subItems.map((sub, sIdx) => {
                              const subHasAttempted = sub.attemptedCount > 0;
                              let subCategory: 'strong' | 'moderate' | 'weak' | 'unattempted';
                              let subBadgeLabel: string;

                              if (!subHasAttempted) {
                                subCategory = 'unattempted';
                                subBadgeLabel = 'Unattempted';
                              } else if (sub.accuracy >= 75 && sub.wrongCount === 0) {
                                subCategory = 'strong';
                                subBadgeLabel = `${sub.accuracy}% (Stronger)`;
                              } else if (sub.accuracy >= 60 && sub.correctCount >= sub.wrongCount) {
                                subCategory = 'moderate';
                                subBadgeLabel = `${sub.accuracy}% (Moderate)`;
                              } else {
                                subCategory = 'weak';
                                subBadgeLabel = `${sub.accuracy}% (Weaker)`;
                              }

                              return (
                                <div
                                  key={sIdx}
                                  className="p-2.5 rounded-[18px] bg-white dark:bg-[#1e2024] border border-slate-200/60 dark:border-zinc-800/80 space-y-1.5 text-xs shadow-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-900 dark:text-zinc-100 truncate text-[11px]">
                                      {sub.subtopic}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold shrink-0 border-0 ring-0 ${
                                        subCategory === 'strong'
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                          : subCategory === 'moderate'
                                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                          : subCategory === 'unattempted'
                                          ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {subBadgeLabel}
                                    </span>
                                  </div>

                                  {/* Question Chips */}
                                  <div className="flex flex-wrap items-center gap-1">
                                    {sub.questions.map((q) => {
                                      let chipStyle = 'bg-slate-200/80 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
                                      let iconNode = <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-500 shrink-0 inline-block" />;
                                      if (q.isCorrect) {
                                        chipStyle = 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold';
                                        iconNode = <Check className="w-2.5 h-2.5 stroke-[3] shrink-0" />;
                                      } else if (q.isAttempted) {
                                        chipStyle = 'bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 font-bold';
                                        iconNode = <X className="w-2.5 h-2.5 stroke-[3] shrink-0" />;
                                      }

                                      return (
                                        <span
                                          key={q.questionNumber}
                                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border-0 ring-0 ${chipStyle}`}
                                          title={`Q${q.questionNumber}: ${q.isCorrect ? 'Correct' : q.isAttempted ? 'Wrong' : 'Skipped'}`}
                                        >
                                          <span className="w-3 h-3 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0">
                                            {iconNode}
                                          </span>
                                          <span>Q{q.questionNumber}</span>
                                        </span>
                                      );
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                                    <span>{sub.correctCount}/{sub.totalQuestions} Correct</span>
                                    <span>{sub.wrongCount} Wrong • {sub.skippedCount} Skipped</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Embedded Sparkles Actionable Recommendation Box */}
                          <div className="p-3 rounded-2xl bg-[#d3e3fd]/40 dark:bg-[#004a77]/30 border-0 ring-0 shadow-xs flex items-start gap-2 text-xs text-slate-800 dark:text-zinc-200 mt-1">
                            <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 mt-0.5" />
                            <p className="leading-relaxed font-medium text-[11px] sm:text-xs">
                              {item.recommendation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stats Bar Footer */}
                    <div className="p-3 sm:px-4 py-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 bg-slate-50/50 dark:bg-white/[0.02]">
                      <span className="font-semibold text-[11px]">
                        Score: <strong className="text-slate-900 dark:text-zinc-100">{item.correctCount}/{item.totalQuestions}</strong> ({item.accuracy}%)
                      </span>
                      <span className="text-[10.5px]">
                        {item.correctCount} Correct • {item.wrongCount} Wrong • {item.skippedCount} Skipped
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full p-8 text-center text-xs text-slate-500 dark:text-zinc-400 bg-white dark:bg-[#181a20] rounded-[24px] ring-1 ring-slate-400 dark:ring-zinc-600 border-0 shadow-none">
                No items match the selected filter tab.
              </div>
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* 5. THETA AI DIAGNOSTIC REMEDIAL COURSE & STUDY GENERATOR             */}
        {/* ==================================================================== */}
        <div className={`${APP_STYLES.card.base} p-5 sm:p-6 space-y-4`}>
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] flex items-center justify-center font-bold shrink-0 shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                    Generate Structured Remedial Course with Theta
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa]">
                    6-Module Masterclass
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Theta will compile diagnostic derivations, formula sheets, theory proofs, and target practice problems for your weak areas.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateThetaMaterial}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] active:scale-95 text-xs sm:text-sm font-bold rounded-full border-0 ring-0 shadow-xs hover:shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start Theta Study Session</span>
            </button>
          </div>

          {/* Prompt Bar */}
          <div className="pt-2 border-t border-slate-100 dark:border-[#2c3040] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="theta-extra-addons-input"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Describe your needs / extra add-ons</span>
                <span className="text-[11px] font-medium text-slate-400">(optional)</span>
              </label>
              {extraAddonsPrompt.trim() && (
                <button
                  type="button"
                  onClick={() => setExtraAddonsPrompt('')}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                ref={promptBarInputRef}
                id="theta-extra-addons-input"
                type="text"
                value={extraAddonsPrompt}
                onChange={(e) => setExtraAddonsPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleGenerateThetaMaterial();
                  }
                }}
                placeholder="Describe your needs / extra add-ons (optional)..."
                className="w-full pl-4 pr-12 py-2.5 rounded-full bg-[#eaedf3] dark:bg-[#2c3040] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 border border-slate-300 dark:border-zinc-700 outline-none shadow-xs transition-all"
              />

              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  type="button"
                  onClick={handleGenerateThetaMaterial}
                  className="w-8 h-8 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] flex items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer shrink-0 border-0 ring-0"
                  title="Send prompt to Theta"
                  aria-label="Generate Course with Theta"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
