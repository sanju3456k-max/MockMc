import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  studioStaggerContainer, 
  studioStaggerItem, 
  studioTabVariants,
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { 
  Clock, 
  BookOpen, 
  Award,
  Target,
  Percent,
  Cloud,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Zap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BarChart2,
  Filter,
  RotateCcw,
  Layers,
  ArrowUpRight,
  Eye,
  ArrowLeft,
  X,
  Minus,
  MinusCircle,
  Calendar,
  Loader2,
  Scan,
  Globe
} from 'lucide-react';
import type { TestAttempt, MathTest, MathQuestion, UserProfile, TopicStatRollup } from '../types';
import type { User } from 'firebase/auth';
import { isAttemptOmrMode, type CachedAuthUser } from '../lib/storage';
import { TestReportAnalysisView } from './TestReportAnalysisView';
import { APP_STYLES } from './ui/AppStyles';

export interface PerformanceAnalyticsProps {
  attempts: TestAttempt[];
  tests: MathTest[];
  currentUser: User | null;
  cachedUser?: CachedAuthUser | null;
  userProfile?: UserProfile | null;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
  onRetakeTest?: (testId: string) => void;
  onNavigateToTests?: () => void;
  onOpenCustomBuilder?: () => void;
  onSignIn?: () => void;
  onBack?: () => void;
  onLoadMoreAttempts?: () => Promise<void> | void;
  hasMoreAttempts?: boolean;
  isLoadingMoreAttempts?: boolean;
  onGenerateThetaCourse?: (prompt: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  attempts = [],
  tests = [],
  currentUser,
  cachedUser,
  userProfile,
  onSignIn,
  onViewAttemptResult,
  onRetakeTest,
  onNavigateToTests,
  onOpenCustomBuilder,
  onBack,
  onLoadMoreAttempts,
  hasMoreAttempts = false,
  isLoadingMoreAttempts = false,
  onGenerateThetaCourse,
  onNavigateTab,
}) => {
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'online' | 'omr' | 'score' | 'accuracy'>('recent');
  const [selectedReportAttempt, setSelectedReportAttempt] = useState<TestAttempt | null>(null);

  // Guarantee clean scroll reset on mount and report drill-down transitions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [selectedReportAttempt]);

  const displayUser = currentUser || cachedUser || null;
  const rollup = userProfile?.statsRollup;

  const passedAttempts = attempts.filter((a) => a.passed).length;
  // If rollup has higher total, use zero-waste rollup count; otherwise use attempts length
  const totalAttempts = rollup && rollup.totalTestsAttempted > 0
    ? Math.max(rollup.totalTestsAttempted, attempts.length)
    : attempts.length;
    
  const passRate = totalAttempts > 0 
    ? Math.round(((passedAttempts || (rollup?.totalTestsAttempted ? Math.round(rollup.totalTestsAttempted * 0.7) : 0)) / totalAttempts) * 100) 
    : 0;
  
  // Aggregate overall question level metrics with zero-read rollup acceleration
  const aggregatedStats = useMemo(() => {
    let totalCorrect = 0;
    let totalAttempted = 0;
    let totalQuestionsCount = 0;
    let totalTimeSpentSec = 0;
    let totalWrong = 0;
    let totalUnattempted = 0;

    const topicStats: Record<string, { total: number; correct: number; attempted: number; wrong?: number }> = {};
    const subtopicStats: Record<string, { total: number; correct: number; attempted: number; wrong?: number; parentTopic: string }> = {};

    // 1. If rollup is present, seed with cumulative atomic counts for instant zero-read KPIs
    if (rollup && rollup.totalTestsAttempted > 0) {
      totalCorrect = rollup.totalQuestionsCorrect || 0;
      totalAttempted = rollup.totalQuestionsAnswered || 0;
      totalQuestionsCount = rollup.totalQuestionsAnswered || 0;
      totalTimeSpentSec = rollup.totalTimeSpentSeconds || 0;

      if (rollup.topicStats) {
        Object.entries(rollup.topicStats).forEach(([topKey, val]) => {
          const topVal = val as TopicStatRollup;
          topicStats[topKey] = {
            total: topVal.questionsTotal || (topVal.attemptCount * 10),
            correct: topVal.questionsCorrect || 0,
            attempted: topVal.questionsTotal || (topVal.attemptCount * 10)
          };
        });
      }
    }

    // 2. Supplement / compute from loaded attempts using question-specific topic & subtopic classifications
    if (attempts.length > 0) {
      let localCorr = 0;
      let localAtt = 0;
      let localQCount = 0;
      let localTime = 0;

      attempts.forEach((att) => {
        localTime += att.timeSpentSeconds || 0;
        const answersMap = att.answers || {};
        const answersList = Object.values(answersMap) as { 
          selectedOption?: string; 
          isCorrect?: boolean; 
          timeSpentSeconds?: number; 
        }[];
        
        const foundTest = tests.find(t => (t && t.id && t.id === att.testId) || (t && t.title && t.title === att.testTitle));
        const testCategory = foundTest?.topic || att.testTopic || 'General Mathematics';
        const questionsList: MathQuestion[] = Array.isArray(foundTest?.questions) && foundTest.questions.length > 0
          ? foundTest.questions
          : (Array.isArray((att as any).questions) ? (att as any).questions : []);

        const qCount = questionsList.length > 0 ? questionsList.length : (answersList.length || 1);

        if (questionsList.length > 0) {
          questionsList.forEach((q, idx) => {
            const qNum = idx + 1;
            const qId = q.id || `q_${qNum}`;
            const ans = answersMap[qId] || answersMap[String(qNum)] || answersMap[String(idx)];
            const isAtt = Boolean(ans && ans.selectedOption && ans.selectedOption.trim() !== '');
            const isCorr = Boolean(ans && ans.isCorrect);

            localQCount++;
            if (isAtt) localAtt++;
            if (isCorr) localCorr++;

            // Question-specific topic and subtopic
            const qTopic = (typeof q.topic === 'string' && q.topic.trim()) || 
                          (typeof q.qtopic === 'string' && q.qtopic.trim()) || 
                          testCategory;
            const qSubtopic = typeof q.subtopic === 'string' && q.subtopic.trim() ? q.subtopic.trim() : '';

            // Accumulate topic stats with wrong count
            if (!topicStats[qTopic]) {
              topicStats[qTopic] = { total: 0, correct: 0, attempted: 0, wrong: 0 };
            }
            topicStats[qTopic].total += 1;
            if (isAtt) topicStats[qTopic].attempted += 1;
            if (isCorr) topicStats[qTopic].correct += 1;
            else if (isAtt) topicStats[qTopic].wrong = (topicStats[qTopic].wrong || 0) + 1;

            // Accumulate subtopic stats with wrong count
            if (qSubtopic) {
              if (!subtopicStats[qSubtopic]) {
                subtopicStats[qSubtopic] = { total: 0, correct: 0, attempted: 0, wrong: 0, parentTopic: qTopic };
              }
              subtopicStats[qSubtopic].total += 1;
              if (isAtt) subtopicStats[qSubtopic].attempted += 1;
              if (isCorr) subtopicStats[qSubtopic].correct += 1;
              else if (isAtt) subtopicStats[qSubtopic].wrong = (subtopicStats[qSubtopic].wrong || 0) + 1;
            }
          });
        } else {
          const correct = answersList.filter((a) => a.isCorrect).length;
          const attempted = answersList.filter((a) => a.selectedOption && a.selectedOption.trim() !== '').length;
          const wrong = Math.max(0, attempted - correct);

          localCorr += correct;
          localAtt += attempted;
          localQCount += qCount;

          if (!topicStats[testCategory]) {
            topicStats[testCategory] = { total: 0, correct: 0, attempted: 0, wrong: 0 };
          }
          topicStats[testCategory].total += qCount;
          topicStats[testCategory].correct += correct;
          topicStats[testCategory].attempted += attempted;
          topicStats[testCategory].wrong = (topicStats[testCategory].wrong || 0) + wrong;
        }
      });

      // If no rollup was present, use the calculated local totals
      if (!rollup || !rollup.totalTestsAttempted) {
        totalCorrect = localCorr;
        totalAttempted = localAtt;
        totalQuestionsCount = localQCount;
        totalTimeSpentSec = localTime;
      }
    }

    totalWrong = Math.max(0, totalAttempted - totalCorrect);
    totalUnattempted = Math.max(0, totalQuestionsCount - totalAttempted);

    const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const overallPrecision = totalQuestionsCount > 0 ? Math.round((totalCorrect / totalQuestionsCount) * 100) : 0;
    const avgSecondsPerQ = totalAttempted > 0 ? Math.round(totalTimeSpentSec / totalAttempted) : 0;

    return {
      totalCorrect,
      totalAttempted,
      totalQuestionsCount,
      totalWrong,
      totalUnattempted,
      totalTimeSpentSec,
      overallAccuracy,
      overallPrecision,
      avgSecondsPerQ,
      topicStats,
      subtopicStats
    };
  }, [attempts, tests, rollup]);

  const formatDuration = (sec: number) => {
    if (!sec || sec <= 0) return '0s';
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
  };

  const formatSimpleDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    } catch {
      return 'Recent';
    }
  };

  // Filter and sort attempts
  const filteredAndSortedAttempts = useMemo(() => {
    let result = [...attempts];

    if (selectedTopicFilter !== 'all') {
      result = result.filter(att => {
        const found = tests.find(t => t.id === att.testId);
        return (found?.topic || 'General Mathematics') === selectedTopicFilter;
      });
    }

    if (sortBy === 'online') {
      result = result.filter(att => {
        const isOmr = isAttemptOmrMode(att);
        return !isOmr;
      });
    } else if (sortBy === 'omr') {
      result = result.filter(att => {
        const isOmr = isAttemptOmrMode(att);
        return isOmr;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'score') {
        return (b.percentage || 0) - (a.percentage || 0);
      }
      if (sortBy === 'accuracy') {
        const aAns = Object.values(a.answers || {});
        const bAns = Object.values(b.answers || {});
        const aCorr = aAns.filter((x: any) => x.isCorrect).length;
        const bCorr = bAns.filter((x: any) => x.isCorrect).length;
        return bCorr - aCorr;
      }
      return new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime();
    });

    return result;
  }, [attempts, tests, selectedTopicFilter, sortBy]);

  const availableTopics = useMemo(() => {
    return Object.keys(aggregatedStats.topicStats);
  }, [aggregatedStats.topicStats]);

  const handleBack = onNavigateToTests || onBack;

  // Ensure view resets scroll position to top on mount
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  if (selectedReportAttempt) {
    return (
      <TestReportAnalysisView
        attempt={selectedReportAttempt}
        test={tests.find((t) => (t && t.id && t.id === selectedReportAttempt.testId) || (t && t.title && t.title === selectedReportAttempt.testTitle))}
        allTests={tests}
        onClose={() => setSelectedReportAttempt(null)}
        onRetakeTest={onRetakeTest}
        onViewRawSolutions={onViewAttemptResult}
        onGenerateThetaCourse={onGenerateThetaCourse}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  return (
    <div className={APP_STYLES.analytics.container}>
      {/* Header Banner with Back Button & Action Controls */}
      <div className="sticky top-0 z-30 bg-[#e5e9f0] dark:bg-[#0b0c10] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-6 py-2.5 -mx-3 sm:-mx-6 shadow-none border-0 mb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {handleBack && (
              <button
                id="back-to-tests-btn"
                onClick={handleBack}
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 ring-0 cursor-pointer shrink-0 outline-none"
                title="Back to Tests Library"
              >
                <ArrowLeft className="w-4 h-4 text-[#1f1f1f] dark:text-[#e3e3e3]" />
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Performance Analytics
            </h1>
          </div>
          <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">
            Real-time mastery curves, topic accuracy, time efficiency, and attempt history.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenCustomBuilder && (
            <button
              id="analytics-custom-builder-btn"
              onClick={onOpenCustomBuilder}
              className="h-9 px-4 rounded-full bg-white hover:bg-[#f0f4f9] dark:bg-[#1e2024] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer outline-none shrink-0"
            >
              <Zap className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] fill-[#0b57d0]/20 dark:fill-[#a8c7fa]/20" />
              <span>Custom Test Builder</span>
            </button>
          )}

          {handleBack && (
            <button
              id="analytics-take-test-btn"
              onClick={handleBack}
              className="h-9 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)] border-0 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer outline-none shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Practice Tests</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI Overview Cards - Static Pure Home Screen Cards (No Subpixel Diffusion / No Stagger Layer) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="p-4 sm:p-5 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-1 flex items-center justify-center gap-1 sm:gap-1.5">
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Tests Taken</span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-mono">
            {totalAttempts}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-medium flex items-center justify-center gap-1">
            <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{passedAttempts} Passed</span> ({passRate}%)
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-1 flex items-center justify-center gap-1 sm:gap-1.5">
            <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Accuracy</span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-mono">
            {aggregatedStats.overallAccuracy}%
          </div>
          <div className="text-[10px] sm:text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-medium">
            On {aggregatedStats.totalAttempted} answered Qs
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-1 flex items-center justify-center gap-1 sm:gap-1.5">
            <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Precision</span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-mono">
            {aggregatedStats.overallPrecision}%
          </div>
          <div className="text-[10px] sm:text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-medium">
            Across {aggregatedStats.totalQuestionsCount} items
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-1 flex items-center justify-center gap-1 sm:gap-1.5">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Active Time</span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-mono truncate max-w-full">
            {formatDuration(aggregatedStats.totalTimeSpentSec)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-medium">
            ~{aggregatedStats.avgSecondsPerQ}s per question
          </div>
        </div>
      </div>

      {/* Analytics Insights Row: Question Distribution & Topic Mastery */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3.5">
        <div className="p-4 sm:p-6 bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Question Breakdown
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-600 dark:text-zinc-400 font-bold">
              {aggregatedStats.totalQuestionsCount} Total
            </span>
          </div>

          <div className="h-3 w-full rounded-full bg-[#f0f4f9] dark:bg-[#141619] flex overflow-hidden">
            {aggregatedStats.totalQuestionsCount > 0 && (
              <>
                <div 
                  style={{ width: `${(aggregatedStats.totalCorrect / aggregatedStats.totalQuestionsCount) * 100}%` }}
                  className="bg-[#0b57d0] dark:bg-[#a8c7fa] h-full"
                  title={`Correct: ${aggregatedStats.totalCorrect}`}
                />
                <div 
                  style={{ width: `${(aggregatedStats.totalWrong / aggregatedStats.totalQuestionsCount) * 100}%` }}
                  className="bg-rose-500 h-full"
                  title={`Incorrect: ${aggregatedStats.totalWrong}`}
                />
                <div 
                  style={{ width: `${(aggregatedStats.totalUnattempted / aggregatedStats.totalQuestionsCount) * 100}%` }}
                  className="bg-slate-300 dark:bg-zinc-600 h-full"
                  title={`Unattempted: ${aggregatedStats.totalUnattempted}`}
                />
              </>
            )}
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" />
                <span className="text-[#1f1f1f] dark:text-[#e3e3e3] font-medium">Correct Answers</span>
              </div>
              <span className="font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                {aggregatedStats.totalCorrect} ({aggregatedStats.totalQuestionsCount > 0 ? Math.round((aggregatedStats.totalCorrect / aggregatedStats.totalQuestionsCount) * 100) : 0}%)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-[#1f1f1f] dark:text-[#e3e3e3] font-medium">Incorrect Answers</span>
              </div>
              <span className="font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                {aggregatedStats.totalWrong} ({aggregatedStats.totalQuestionsCount > 0 ? Math.round((aggregatedStats.totalWrong / aggregatedStats.totalQuestionsCount) * 100) : 0}%)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-zinc-500" />
                <span className="text-[#1f1f1f] dark:text-[#e3e3e3] font-medium">Skipped / Unattempted</span>
              </div>
              <span className="font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                {aggregatedStats.totalUnattempted} ({aggregatedStats.totalQuestionsCount > 0 ? Math.round((aggregatedStats.totalUnattempted / aggregatedStats.totalQuestionsCount) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] p-4 sm:p-6 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Topic Mastery Distribution
              </h2>
            </div>
          </div>

          {availableTopics.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 dark:text-zinc-400">
              Complete tests across multiple topics to view your topic mastery breakdown.
            </div>
          ) : (
            <div className="space-y-3">
              {availableTopics.slice(0, 8).map((key) => {
                const stat = aggregatedStats.topicStats[key];
                if (!stat) return null;
                const hasAtt = stat.attempted > 0;
                const acc = hasAtt ? Math.round((stat.correct / stat.attempted) * 100) : 0;
                const wrongCount = stat.wrong ?? Math.max(0, stat.attempted - stat.correct);
                const coverageRate = stat.total > 0 ? (stat.attempted / stat.total) : 0;

                let topicBadge = 'Needs Practice';
                let badgeColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
                let barColor = 'bg-rose-500 dark:bg-rose-400';

                if (!hasAtt) {
                  topicBadge = 'Unattempted';
                  badgeColor = 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
                  barColor = 'bg-slate-300 dark:bg-zinc-700';
                } else if (acc >= 75 && stat.correct > wrongCount && (coverageRate >= 0.5 || stat.total <= 2)) {
                  topicBadge = stat.correct === stat.total ? 'Mastered' : 'Strong';
                  badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
                  barColor = 'bg-emerald-500 dark:bg-emerald-400';
                } else if (acc >= 60 && stat.correct > wrongCount) {
                  topicBadge = 'Moderate';
                  badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
                  barColor = 'bg-[#0b57d0] dark:bg-[#a8c7fa]';
                }
                
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium gap-2">
                      <div className="flex items-center gap-2 truncate max-w-[280px]">
                        <span className="text-slate-900 dark:text-zinc-100 font-semibold truncate">
                          {key}
                        </span>
                        <span className={`px-2 py-0.2 rounded-full text-[9.5px] font-extrabold shrink-0 border-0 ${badgeColor}`}>
                          {topicBadge}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                        <span className="text-slate-500 font-medium">
                          {stat.correct}/{stat.total} Qs
                        </span>
                        <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                          {hasAtt ? `${acc}%` : '0%'}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-[#f0f4f9] dark:bg-[#141619] rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${hasAtt ? acc : 0}%` }}
                        className={`h-full ${barColor} rounded-full transition-all duration-300`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>Target: Aim for &ge;75% accuracy and full coverage to achieve Strong mastery</span>
            </span>
          </div>
        </div>
      </div>

      {/* Attempt History List with Prominent Title & Clean Filter Row */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#d3e3fd]/50 dark:bg-[#004a77]/30 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Attempt History &amp; Records
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {availableTopics.length > 1 && (
              <div className="relative inline-flex items-center">
                <select
                  id="analytics-topic-filter-select"
                  value={selectedTopicFilter}
                  onChange={(e) => setSelectedTopicFilter(e.target.value)}
                  className="appearance-none h-9 pl-4 pr-8 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 ring-0 focus:ring-0 focus:outline-none cursor-pointer min-w-[130px] sm:min-w-[150px] transition-all shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] outline-none"
                >
                  <option value="all">All Topics</option>
                  {availableTopics.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] absolute right-3 pointer-events-none" />
              </div>
            )}

            <div className="relative inline-flex items-center">
              <select
                id="analytics-sort-by-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none h-9 pl-4 pr-8 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 ring-0 focus:ring-0 focus:outline-none cursor-pointer min-w-[130px] sm:min-w-[150px] transition-all shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] outline-none"
              >
                <option value="recent">Most Recent</option>
                <option value="online">Online Mode</option>
                <option value="omr">OMR Mode</option>
                <option value="score">Highest Score</option>
                <option value="accuracy">Highest Accuracy</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] absolute right-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {filteredAndSortedAttempts.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2024] border-0 ring-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] rounded-[24px] text-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#a8c7fa] mx-auto flex items-center justify-center mb-3">
              <Award className="w-6 h-6 stroke-[2.2]" />
            </div>
            <p className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              No test attempts matching criteria
            </p>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] mt-1">
              Complete a mock test in your library to populate your analytics log.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filteredAndSortedAttempts.map((attempt) => {
              const answersList = Object.values(attempt.answers || {}) as { 
                selectedOption?: string; 
                isCorrect?: boolean; 
                timeSpentSeconds?: number; 
              }[];

              const totalQuestions = answersList.length > 0 
                ? answersList.length 
                : (attempt.totalPoints || 10);

              const correctCount = answersList.filter((a) => a.isCorrect).length || Math.round((attempt.score / (attempt.totalPoints || 1)) * totalQuestions);
              const attemptedCount = answersList.filter((a) => a.selectedOption && a.selectedOption.trim() !== '').length || correctCount;
              const wrongCount = Math.max(0, attemptedCount - correctCount);
              const unansweredCount = Math.max(0, totalQuestions - attemptedCount);

              const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
              const isOmrMode = isAttemptOmrMode(attempt);

              const foundTest = tests.find(t => (t && t.id && t.id === attempt.testId) || (t && t.title && t.title === attempt.testTitle));
              const questionsList: MathQuestion[] = Array.isArray(foundTest?.questions) && foundTest.questions.length > 0
                ? foundTest.questions
                : (Array.isArray((attempt as any).questions) ? (attempt as any).questions : []);

              return (
                <div
                  key={attempt.id}
                  id={`history-attempt-card-${attempt.id}`}
                  onClick={() => setSelectedReportAttempt(attempt)}
                  className="bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 flex flex-col gap-2.5 sm:gap-3 p-4 sm:p-5 cursor-pointer group"
                >
                  {/* Row 1: Test Title & Mode Tag */}
                  <div className="flex items-center justify-between gap-2.5">
                    <h3 className="font-semibold text-base sm:text-lg text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors truncate tracking-tight flex-1 min-w-0 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa]">
                      {attempt.testTitle}
                    </h3>

                    {isOmrMode ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] sm:text-[11px] font-bold bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#c4eed0] shrink-0 border-0 outline-none">
                        OMR
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] sm:text-[11px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shrink-0 border-0 outline-none">
                        Online
                      </span>
                    )}
                  </div>

                  {/* Row 2: Date and Time in Single Strip */}
                  <div className="flex items-center">
                    <div className="inline-flex items-center gap-2 sm:gap-2.5 text-[#444746] dark:text-[#c4c7c5] text-[11px] font-bold shrink-0" title="Completion Date & Duration">
                      <div className="flex items-center gap-1.5" title="Completion Date">
                        <Calendar className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                        <span>{formatSimpleDate(attempt.completedAt || attempt.createdAt)}</span>
                      </div>
                      {attempt.timeSpentSeconds ? (
                        <>
                          <span className="text-[#444746] dark:text-[#c4c7c5] font-medium">•</span>
                          <div className="flex items-center gap-1.5" title="Time Spent">
                            <Clock className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 stroke-[2.2] shrink-0" />
                            <span>{formatDuration(attempt.timeSpentSeconds)}</span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 3: Correct, Wrong, Skipped in Single Strip */}
                  <div className="flex items-center">
                    <div className="inline-flex items-center gap-2 sm:gap-2.5 text-[#1f1f1f] dark:text-[#e3e3e3] text-[11px] font-medium shrink-0">
                      {/* Correct */}
                      <div className="flex items-center gap-1.5" title="Correct Questions">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                        <span>
                          <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{correctCount}</strong> <span>correct</span>
                        </span>
                      </div>

                      <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>

                      {/* Wrong */}
                      <div className="flex items-center gap-1.5" title="Incorrect Questions">
                        <XCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 stroke-[2.2] shrink-0" />
                        <span>
                          <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{wrongCount}</strong> <span>wrong</span>
                        </span>
                      </div>

                      <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>

                      {/* Skipped */}
                      <div className="flex items-center gap-1.5" title="Skipped / Unanswered Questions">
                        <MinusCircle className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] stroke-[2.2] shrink-0" />
                        <span>
                          <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{unansweredCount}</strong> <span>skipped</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Thin Subtle Divider Line matching Home Test Cards */}
                  <div className="w-full border-t border-[#edf0f5] dark:border-[#2f3238] my-0.5 pointer-events-none" />

                  {/* Row 4: Accuracy & Score (Left) and Action Buttons (Right End) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    {/* Accuracy & Score in Single Strip */}
                    <div className="inline-flex items-center gap-1.5 sm:gap-2.5 text-[#1f1f1f] dark:text-[#e3e3e3] text-[11px] font-semibold shrink-0">
                      {/* Accuracy */}
                      <div className="flex items-center gap-1" title="Accuracy">
                        <Target className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                        <span>Acc</span>
                        <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{accuracy}%</strong>
                      </div>

                      <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>

                      {/* Score */}
                      <div className="flex items-center gap-1" title="Score">
                        <Award className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                        <span>Score</span>
                        <strong className="text-[#0b57d0] dark:text-[#a8c7fa] font-extrabold">{correctCount}/{totalQuestions}</strong>
                      </div>
                    </div>

                    {/* Action Buttons: Report & Solutions */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReportAttempt(attempt);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-3.5 py-1.5 bg-[#d3e3fd] hover:bg-[#c2e7ff] dark:bg-[#004a77] dark:hover:bg-[#005a92] active:scale-95 text-[#041e49] dark:text-[#c2e7ff] text-[10.5px] sm:text-xs font-bold rounded-full border-0 transition-all cursor-pointer whitespace-nowrap"
                        title="View detailed test report & analysis"
                      >
                        <BarChart2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.2]" />
                        <span>Analysis</span>
                      </button>

                      <button
                        id={`view-solution-btn-${attempt.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onViewAttemptResult) onViewAttemptResult(attempt);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-3.5 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] text-white active:scale-95 text-[10.5px] sm:text-xs font-bold rounded-full border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] transition-all cursor-pointer whitespace-nowrap"
                        title="View detailed test solutions"
                      >
                        <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.2]" />
                        <span>Solutions</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {hasMoreAttempts && onLoadMoreAttempts && (
              <div className="pt-2 text-center">
                <button
                  id="load-more-attempts-btn"
                  onClick={() => onLoadMoreAttempts()}
                  disabled={isLoadingMoreAttempts}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-[28px] bg-white hover:bg-[#f0f4f9] dark:bg-[#1e2024] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold transition-all shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] active:scale-95 cursor-pointer disabled:opacity-60 border-0"
                >
                  {isLoadingMoreAttempts ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0b57d0] dark:text-[#a8c7fa]" />
                      <span>Loading older attempts...</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      <span>Load older attempts</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AnalyticsDashboard = PerformanceAnalytics;
