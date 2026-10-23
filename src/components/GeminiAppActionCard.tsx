import React from 'react';
import { 
  Play, 
  Sparkles, 
  BarChart2, 
  Scan, 
  FileText, 
  ArrowRight, 
  Layers, 
  Download, 
  Target, 
  Settings,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { ParsedAppAction, MathTest, ActiveTab } from '../types';
import { APP_STYLES } from './ui/AppStyles';

interface GeminiAppActionCardProps {
  actionData: ParsedAppAction;
  existingTests?: MathTest[];
  onNavigateTab?: (tab: ActiveTab) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  onExportData?: () => void;
  isDarkMode?: boolean;
}

export const GeminiAppActionCard: React.FC<GeminiAppActionCardProps> = ({
  actionData,
  existingTests = [],
  onNavigateTab,
  onStartTest,
  onEditTest,
  onExportData,
  isDarkMode
}) => {
  const { type, title, description, targetTab, payload } = actionData;

  // Resolve matching test if a testId or testTitle is provided
  const matchingTest = payload?.testId 
    ? existingTests.find((t) => t.id === payload.testId)
    : payload?.testTitle 
      ? existingTests.find((t) => t.title?.trim().toLowerCase() === payload.testTitle?.trim().toLowerCase())
      : undefined;

  const handleExecuteAction = () => {
    switch (type) {
      case 'LAUNCH_TEST':
        if (matchingTest && onStartTest) {
          onStartTest(matchingTest, payload?.mode || 'timed');
        } else if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        } else if (onNavigateTab) {
          onNavigateTab('tests');
        }
        break;

      case 'OPEN_CUSTOM_BUILDER':
        if (onNavigateTab) {
          onNavigateTab('custom-builder');
        }
        break;

      case 'OPEN_STUDIO':
        if (targetTab === 'custom-builder' && onNavigateTab) {
          onNavigateTab('custom-builder');
        } else if (matchingTest && onEditTest) {
          onEditTest(matchingTest, { openAiPrompt: true });
        } else if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        } else if (onNavigateTab) {
          onNavigateTab('create');
        }
        break;

      case 'OPEN_OMR':
        if (onNavigateTab) {
          onNavigateTab('omr-test');
        }
        break;

      case 'OPEN_ANALYTICS':
        if (onNavigateTab) {
          onNavigateTab('analytics');
        }
        break;

      case 'EXPORT_DATA':
        if (onExportData) {
          onExportData();
        } else {
          // Trigger standard export
          try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(existingTests, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `math_tests_backup_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          } catch (e) {
            console.error('Export error:', e);
          }
        }
        break;

      case 'OPEN_HTML_NOTES':
        if (onNavigateTab) {
          onNavigateTab('html-notes');
        }
        break;

      case 'OPEN_NOTES':
        if (onNavigateTab) {
          onNavigateTab('notes-repository');
        }
        break;

      case 'NAVIGATE':
      default:
        if (targetTab && onNavigateTab) {
          onNavigateTab(targetTab);
        }
        break;
    }
  };

  const getActionTheme = () => {
    switch (type) {
      case 'LAUNCH_TEST':
        return {
          icon: Play,
          color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40',
          btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
          badge: 'Test Runner',
          badgeColor: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
          defaultTitle: matchingTest ? `Launch "${matchingTest.title}"` : 'Launch Test',
          defaultDesc: `Start practicing with ${matchingTest?.questions?.length || 'all'} questions in ${payload?.mode || 'timed'} mode.`
        };

      case 'OPEN_CUSTOM_BUILDER':
        return {
          icon: Target,
          color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          badge: 'Custom Studio',
          badgeColor: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
          defaultTitle: 'Launch Custom Test Studio',
          defaultDesc: 'Create tests with custom questions, marks, and manual timer settings.'
        };

      case 'OPEN_STUDIO':
        return {
          icon: Sparkles,
          color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40',
          btnBg: 'bg-purple-600 hover:bg-purple-700 text-white',
          badge: 'Test Studio',
          badgeColor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
          defaultTitle: 'Open Test Creator Studio',
          defaultDesc: 'Create or refine questions, LaTeX equations, and custom test layouts.'
        };

      case 'OPEN_OMR':
        return {
          icon: Scan,
          color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
          btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          badge: 'OMR Scanner',
          badgeColor: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
          defaultTitle: 'Open OMR Bubble Scanner',
          defaultDesc: 'Scan paper answer sheets via camera or file upload for instant AI grading.'
        };

      case 'OPEN_ANALYTICS':
      case 'DIAGNOSE_WEAKNESSES':
        return {
          icon: BarChart2,
          color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
          badge: 'Analytics Hub',
          badgeColor: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
          defaultTitle: 'View Performance Analytics',
          defaultDesc: 'Analyze your score trends, accuracy by topic, and time management.'
        };

      case 'EXPORT_DATA':
        return {
          icon: Download,
          color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40',
          btnBg: 'bg-cyan-600 hover:bg-cyan-700 text-white',
          badge: 'Data Backup',
          badgeColor: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300',
          defaultTitle: 'Export Tests Backup (JSON)',
          defaultDesc: 'Download an offline copy of all your tests and question banks.'
        };

      case 'OPEN_HTML_NOTES':
        return {
          icon: FileText,
          color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40',
          btnBg: 'bg-violet-600 hover:bg-violet-700 text-white',
          badge: 'HTML Notes',
          badgeColor: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300',
          defaultTitle: title || 'Open HTML Notes Studio',
          defaultDesc: description || 'Inspect and edit your HTML slide decks, KaTeX formulas, and chapter notes.'
        };

      case 'OPEN_NOTES':
        return {
          icon: Layers,
          color: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40',
          btnBg: 'bg-teal-600 hover:bg-teal-700 text-white',
          badge: 'Formula Notes',
          badgeColor: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300',
          defaultTitle: title || 'Open Formula Notes Studio',
          defaultDesc: description || 'Access your saved mathematical formulas, mistake notes, and exam tricks.'
        };

      case 'NAVIGATE':
      default:
        return {
          icon: ArrowRight,
          color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          badge: 'Quick Navigation',
          badgeColor: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
          defaultTitle: title || `Go to ${targetTab || 'App'}`,
          defaultDesc: description || `Navigate directly to the ${targetTab} section in the app.`
        };
    }
  };

  const theme = getActionTheme();
  const IconComp = theme.icon;

  return (
    <div className={`${APP_STYLES.geminiCanvas.actionCard} my-3 w-full max-w-xl p-4 sm:p-5 shadow-xs border-0 transition-all rounded-2xl`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-0 shadow-xs ${theme.color}`}>
            <IconComp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-xl border-0 shadow-xs ${theme.badgeColor}`}>
                {theme.badge}
              </span>
              {matchingTest && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-xl bg-slate-200/80 dark:bg-[#282a2d] text-slate-800 dark:text-zinc-200 border-0 shadow-xs">
                  {matchingTest.topic}
                </span>
              )}
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 mt-1">
              {title || theme.defaultTitle}
            </h4>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-zinc-400 mb-4 leading-relaxed font-medium">
        {description || theme.defaultDesc}
      </p>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-zinc-800/80">
        <button
          type="button"
          onClick={handleExecuteAction}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-[0.98] cursor-pointer border-0 ${theme.btnBg}`}
        >
          <span>{type === 'LAUNCH_TEST' ? 'Start Test' : type === 'EXPORT_DATA' ? 'Download Backup' : 'Open Now'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {targetTab && onNavigateTab && type !== 'NAVIGATE' && (
          <button
            type="button"
            onClick={() => onNavigateTab(targetTab)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 bg-slate-200/80 hover:bg-slate-300/80 dark:bg-[#282a2d] dark:hover:bg-[#32353d] transition-colors cursor-pointer border-0 shadow-xs"
          >
            Go to tab
          </button>
        )}
      </div>
    </div>
  );
};
