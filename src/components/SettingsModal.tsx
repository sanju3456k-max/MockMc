import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft,
  Upload, 
  Download, 
  FileJson, 
  Cloud, 
  CloudDownload, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  HardDrive,
  UserCheck,
  UserX,
  Trash2,
  ShieldAlert,
  FileText,
  BarChart2,
  Bot,
  Layers,
  Sparkles
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { gpuAcceleratedStyle } from '../lib/animationConfig';
import { 
  getLocalDataStorageStats,
  exportAllLocalDataAsJson,
  importAllLocalDataFromJson,
  getCustomDataStats,
  deleteCustomDataAuthoredTests,
  deleteCustomDataAttempts,
  deleteCustomDataChatHistories,
  deleteCustomDataNotes
} from '../lib/storage';
import { syncHub } from '../lib/syncEngine';
import { DeleteAccountModal } from './DeleteAccountModal';
import { APP_STYLES } from './ui/AppStyles';
import { M3Switch, M3Button, M3Divider } from './ui/Material3';
import { Sun, Moon, Monitor, Sliders } from 'lucide-react';
import type { User } from 'firebase/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  onDataChanged?: () => void;
  uiScale?: any;
  onScaleChange?: (_scale: any) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

type ConfirmDeleteTarget = {
  type: 'tests' | 'attempts_all' | 'attempts_omr' | 'attempts_online' | 'chats' | 'notes';
  title: string;
  description: string;
  count: number;
} | null;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onDataChanged,
  uiScale,
  onScaleChange,
  isDarkMode,
  onToggleTheme,
}) => {
  const [storageStats, setStorageStats] = useState(() => getLocalDataStorageStats(currentUser?.uid || null));
  const [customStats, setCustomStats] = useState(() => getCustomDataStats(currentUser?.uid || null));
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ConfirmDeleteTarget>(null);
  const [isDeletingCustomData, setIsDeletingCustomData] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body & html scrolling while Settings & Storage page is open
  useScrollLock(isOpen);

  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 50,
    id: 'settings_modal_back',
  });

  const refreshStats = () => {
    const activeUid = currentUser?.uid || null;
    setStorageStats(getLocalDataStorageStats(activeUid));
    setCustomStats(getCustomDataStats(activeUid));
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setSyncStatus({ type: 'idle', message: '' });
    }
  }, [isOpen, currentUser]);

  const handleExportJsonArchive = async () => {
    try {
      setSyncStatus({ type: 'loading', message: 'Generating complete backup archive...' });
      const jsonStr = await exportAllLocalDataAsJson(currentUser?.uid || null);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `mockmc_storage_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncStatus({ type: 'success', message: 'Comprehensive JSON backup exported (tests, attempts, chats, study notes, HTML notes studio projects & preferences).' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Export failed: ${err.message || String(err)}` });
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncStatus({ type: 'loading', message: 'Restoring backup data...' });
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = await importAllLocalDataFromJson(content, currentUser?.uid || null);
        if (result.success) {
          syncHub.ingestImportedData({
            tests: result.mergedTests,
            attempts: result.mergedAttempts,
            activeUserId: currentUser?.uid || null,
          });
          setSyncStatus({ type: 'success', message: result.message || 'Data import succeeded!' });
          refreshStats();
          onDataChanged?.();

          // If signed in, immediately flush to Google Cloud so the restored data is permanently preserved
          if (currentUser?.uid) {
            syncHub.backupAllLocalDataToCloud(currentUser.uid).then((res) => {
              if (res.success) {
                setSyncStatus({
                  type: 'success',
                  message: `${result.message} (Synced to Google Cloud)`,
                });
              }
            }).catch((err) => {
              console.warn('Post-import cloud backup error:', err);
            });
          }
        } else {
          setSyncStatus({ type: 'error', message: result.message || 'Import failed.' });
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setSyncStatus({ type: 'error', message: 'Failed to read backup file.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleCloudBackupAll = async () => {
    if (!currentUser) {
      setSyncStatus({ type: 'error', message: 'Sign in with Google required for Cloud Backup.' });
      return;
    }
    setSyncStatus({ type: 'loading', message: 'Backing up local data to Google Cloud...' });
    try {
      const res = await syncHub.backupAllLocalDataToCloud(currentUser.uid);
      if (res.success) {
        setSyncStatus({
          type: 'success',
          message: `Backed up ${res.testsBackedUp} tests, ${res.attemptsBackedUp} attempts & ${res.htmlProjectsBackedUp || 0} HTML projects to Google Cloud!`,
        });
        refreshStats();
      } else {
        setSyncStatus({ type: 'error', message: res.error || 'Cloud backup failed.' });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Cloud backup error: ${err.message || String(err)}` });
    }
  };

  const handleCloudDownloadAll = async () => {
    if (!currentUser) {
      setSyncStatus({ type: 'error', message: 'Sign in with Google required to download from Cloud.' });
      return;
    }
    setSyncStatus({ type: 'loading', message: 'Downloading data from Google Cloud...' });
    try {
      const res = await syncHub.downloadAllDataFromCloud(currentUser.uid);
      if (res.success) {
        setSyncStatus({
          type: 'success',
          message: `Synchronized ${res.testsFetched} tests, ${res.attemptsFetched} attempts & ${res.htmlProjectsFetched || 0} HTML projects from Cloud!`,
        });
        refreshStats();
        onDataChanged?.();
      } else {
        setSyncStatus({ type: 'error', message: res.error || 'Cloud download failed.' });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Cloud download error: ${err.message || String(err)}` });
    }
  };

  const handleExecuteDeleteCustomData = async () => {
    if (!confirmDeleteTarget) return;
    setIsDeletingCustomData(true);
    const uid = currentUser?.uid || null;

    try {
      let deletedCount = 0;
      let label = '';

      if (confirmDeleteTarget.type === 'tests') {
        deletedCount = await deleteCustomDataAuthoredTests(uid);
        label = `${deletedCount} authored test papers deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_all') {
        deletedCount = await deleteCustomDataAttempts(uid, 'all');
        label = `${deletedCount} total exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_omr') {
        deletedCount = await deleteCustomDataAttempts(uid, 'omr');
        label = `${deletedCount} OMR exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_online') {
        deletedCount = await deleteCustomDataAttempts(uid, 'online');
        label = `${deletedCount} Online exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'chats') {
        deletedCount = await deleteCustomDataChatHistories(uid);
        label = `${deletedCount} Gemini AI chat conversations cleared.`;
      } else if (confirmDeleteTarget.type === 'notes') {
        deletedCount = await deleteCustomDataNotes();
        label = `${deletedCount} Study notes & formulas deleted.`;
      }

      setSyncStatus({ type: 'success', message: label });
      refreshStats();
      onDataChanged?.();
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Failed to delete data: ${err.message || String(err)}` });
    } finally {
      setIsDeletingCustomData(false);
      setConfirmDeleteTarget(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={gpuAcceleratedStyle}
        className={`fixed inset-0 ${APP_STYLES.page} z-50 flex flex-col h-full max-h-[100dvh] overflow-hidden`}
      >
        {/* HEADER: TRANSPARENT BACKGROUND, OMR STYLE BACK BUTTON */}
        <div className="px-3.5 sm:px-6 py-3 flex items-center justify-between shrink-0 z-30 bg-transparent border-0 shadow-none">
          <div className="flex items-center gap-3 min-w-0">
            {/* Round Back Button */}
            <button
              id="back-from-settings-btn"
              onClick={onClose}
              title="Back to App"
              className={APP_STYLES.button.icon}
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Round Icon Badge */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border-0">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight truncate">
                Data Backup & Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                Manage backups, cloud sync, and custom activity data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Profile pill */}
            <div className={`hidden sm:flex items-center gap-2 px-3.5 py-1.5 ${APP_STYLES.card.compact} text-xs text-slate-700 dark:text-zinc-300 font-medium`}>
              {currentUser ? (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate max-w-[180px] font-semibold">{currentUser.email || currentUser.uid}</span>
                </>
              ) : (
                <>
                  <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Guest Mode (Local Storage)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* MAIN SCROLLABLE CONTENT BODY (M3 SURFACE CARDS) */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-4 max-w-4xl mx-auto w-full space-y-4 pb-24 overscroll-y-contain [webkit-overflow-scrolling:touch]"
          data-scrollable="true"
        >

          {/* STATUS BANNER */}
          {syncStatus.message && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-[20px] text-xs flex items-center gap-3 font-semibold border-0 shadow-xs ${
                syncStatus.type === 'success' ? 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0]' :
                syncStatus.type === 'loading' ? 'bg-[#d3e3fd] dark:bg-[#0842a0] text-[#041e49] dark:text-[#d3e3fd]' :
                'bg-[#f9dedc] dark:bg-[#8c1d18] text-[#410e0b] dark:text-[#f9dedc]'
              }`}
            >
              {syncStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-300 stroke-[2.5]" />}
              {syncStatus.type === 'loading' && <RefreshCw className="w-4 h-4 shrink-0 text-[#0b57d0] dark:text-[#a8c7fa] animate-spin" />}
              {syncStatus.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-700 dark:text-rose-300 stroke-[2.5]" />}
              <span className="flex-1 leading-relaxed">{syncStatus.message}</span>
            </motion.div>
          )}

          {/* CARD 0: DISPLAY & APPEARANCE (THEME & UI SCALE) */}
          <div className={`p-5 sm:p-6 space-y-4 ${APP_STYLES.card.base}`}>
            <div>
              <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                <span>Display & Appearance</span>
              </h3>
              <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] mt-1">
                Customize application theme, color mode, and interface scale for all devices.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              {/* Dark Theme Toggle with M3Switch */}
              <div className={`flex items-center justify-between p-3.5 sm:p-4 rounded-[20px] ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0">
                    {isDarkMode ? <Moon className="w-5 h-5 text-[#a8c7fa]" /> : <Sun className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-[#1a1b1f] dark:text-[#e3e2e6]">Dark Theme</div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                      {isDarkMode ? 'Dark surface tonal palette active' : 'Light surface tonal palette active'}
                    </div>
                  </div>
                </div>

                {onToggleTheme && (
                  <M3Switch
                    checked={!!isDarkMode}
                    onChange={() => onToggleTheme()}
                    id="m3-settings-dark-mode-toggle"
                  />
                )}
              </div>

              {/* UI Scale Presets */}
              {onScaleChange && (
                <div className={`flex items-center justify-between p-3.5 sm:p-4 rounded-[20px] flex-wrap sm:flex-nowrap gap-3 ${APP_STYLES.subcard.base}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-[#1a1b1f] dark:text-[#e3e2e6]">Interface Density</div>
                      <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                        Select zoom scale for readability
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#ece6f0] dark:bg-[#2a2b30] p-1 rounded-full shrink-0">
                    {['compact', 'standard', 'comfortable'].map((scaleOption) => {
                      const isSelected = uiScale === scaleOption || (!uiScale && scaleOption === 'standard');
                      return (
                        <button
                          key={scaleOption}
                          type="button"
                          onClick={() => onScaleChange(scaleOption)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer border-0 outline-none select-none ${
                            isSelected
                              ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#062e6f] shadow-xs'
                              : 'bg-transparent text-[#44474f] dark:text-[#c4c6d0] hover:text-[#1a1b1f] dark:hover:text-white'
                          }`}
                        >
                          {scaleOption}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 1: ACCOUNT & STORAGE STATS OVERVIEW */}
          <div className={`p-5 sm:p-6 space-y-4 ${APP_STYLES.card.base}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#0842a0] flex items-center justify-center text-[#041e49] dark:text-[#d3e3fd] shrink-0 border-0">
                  {currentUser ? <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[2.2]" /> : <UserX className="w-5 h-5 text-amber-500 stroke-[2.2]" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6]">
                    {currentUser ? 'Google Cloud Profile Linked' : 'Guest Account Mode'}
                  </h3>
                  <p className="text-xs text-[#44474f] dark:text-[#c4c6d0]">
                    {currentUser ? currentUser.email || currentUser.uid : 'Data is stored locally on this device'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#44474f] dark:text-[#c4c6d0] flex-wrap">
                <span>{customStats.authoredTestsCount} Tests</span>
                <span>•</span>
                <span>{customStats.totalAttemptsCount} Attempts</span>
                <span>•</span>
                <span>{customStats.chatHistoriesCount} Chats</span>
                <span>•</span>
                <span>{customStats.htmlProjectsCount || 0} HTML Projects</span>
              </div>
            </div>
          </div>

          {/* CARD 2: LOCAL FILE BACKUP (.JSON) */}
          <div className={`p-5 sm:p-6 space-y-4 ${APP_STYLES.card.base}`}>
            <div>
              <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                <span>Local File Backup (.json)</span>
              </h3>
              <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] mt-1">
                Export all local tests, exam attempts, Gemini AI chats, study notes, HTML Notes Studio projects & documents, and app preferences into a portable JSON backup file, or restore a previously saved archive.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Export JSON */}
              <div className={`flex items-center justify-between gap-3 ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Export Backup</div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0] truncate">Save .json to device</div>
                  </div>
                </div>

                <M3Button
                  id="export-json-backup-btn"
                  onClick={handleExportJsonArchive}
                  variant="filled"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Download className="w-3.5 h-3.5" />}
                >
                  Export
                </M3Button>
              </div>

              {/* Import JSON */}
              <div className={`flex items-center justify-between gap-3 ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Import Backup</div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0] truncate">Restore from .json file</div>
                  </div>
                </div>

                <M3Button
                  id="import-json-backup-btn"
                  onClick={() => fileInputRef.current?.click()}
                  variant="tonal"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Upload className="w-3.5 h-3.5" />}
                >
                  Import
                </M3Button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json,text/json,text/plain,*/*"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
              </div>
            </div>
          </div>

          {/* CARD 3: GOOGLE CLOUD DATABASE SYNC */}
          <div className={`p-5 sm:p-6 space-y-4 ${APP_STYLES.card.base}`}>
            <div>
              <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider flex items-center gap-2">
                <Cloud className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Google Cloud Database Sync</span>
              </h3>
              <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] mt-1">
                Synchronize test papers, exam results, and HTML Notes Studio projects with your Google account in Firestore cloud storage.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Backup to Cloud */}
              <div className={`flex items-center justify-between gap-3 ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0] flex items-center justify-center shrink-0 border-0">
                    <Cloud className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Backup to Cloud</div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0] truncate">Upload tests, history & HTML notes</div>
                  </div>
                </div>

                <M3Button
                  id="cloud-backup-all-btn"
                  onClick={handleCloudBackupAll}
                  disabled={!currentUser}
                  variant="filled"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Cloud className="w-3.5 h-3.5" />}
                >
                  Upload
                </M3Button>
              </div>

              {/* Download from Cloud */}
              <div className={`flex items-center justify-between gap-3 ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#0842a0] text-[#041e49] dark:text-[#d3e3fd] flex items-center justify-center shrink-0 border-0">
                    <CloudDownload className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Download Cloud Data</div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0] truncate">Restore remote account data</div>
                  </div>
                </div>

                <M3Button
                  id="cloud-download-all-btn"
                  onClick={handleCloudDownloadAll}
                  disabled={!currentUser}
                  variant="tonal"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<CloudDownload className="w-3.5 h-3.5" />}
                >
                  Restore
                </M3Button>
              </div>
            </div>
          </div>

          {/* CARD 4: DELETE CUSTOM DATA (SELECTIVE ACTIVITY WIPE) */}
          <div className={`p-5 sm:p-6 space-y-4 ${APP_STYLES.card.base}`}>
            <div>
              <h3 className="text-xs font-bold text-[#ba1a1a] dark:text-[#ffb4ab] uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#ba1a1a] dark:text-[#ffb4ab]" />
                <span>Delete Custom Data</span>
              </h3>
              <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] mt-1">
                Wipe specific activity records and logs (tests, exam attempts, or AI chats) without deleting your account.
              </p>
            </div>

            <div className="space-y-3 pt-1">

              {/* 1. Authored Tests */}
              <div className={`flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Authored Test Papers
                    </div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                      {customStats.authoredTestsCount} user-created tests
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-authored-tests-btn"
                  disabled={customStats.authoredTestsCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'tests',
                    title: 'Delete All Authored Test Papers',
                    description: 'This will permanently remove all test papers authored by you from local storage and cloud databases.',
                    count: customStats.authoredTestsCount
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete ({customStats.authoredTestsCount})
                </M3Button>
              </div>

              {/* 2. Exam Attempts */}
              <div className={`space-y-3 ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                      <BarChart2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                        Exam Attempts & Submissions
                      </div>
                      <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                        {customStats.totalAttemptsCount} total attempts ({customStats.onlineAttemptsCount} Online, {customStats.omrAttemptsCount} OMR)
                      </div>
                    </div>
                  </div>

                  <M3Button
                    id="delete-all-attempts-btn"
                    disabled={customStats.totalAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_all',
                      title: 'Delete All Exam Attempts',
                      description: 'This will permanently remove all exam submissions and scores (both OMR and Online) from your history.',
                      count: customStats.totalAttemptsCount
                    })}
                    variant="danger"
                    className="h-9 px-4 text-xs shrink-0"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete All ({customStats.totalAttemptsCount})
                  </M3Button>
                </div>

                {/* Sub-options for Online vs OMR attempts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#cac4d0]/60 dark:border-[#49454f]/60">
                  <button
                    id="delete-online-attempts-btn"
                    disabled={customStats.onlineAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_online',
                      title: 'Delete Online Attempts Only',
                      description: 'This will remove only digital online exam submissions while preserving your OMR optical scan history.',
                      count: customStats.onlineAttemptsCount
                    })}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-all flex items-center justify-between gap-2 active:scale-95 border-0 ${
                      customStats.onlineAttemptsCount > 0
                        ? 'bg-[#fdfbff] dark:bg-[#1e1f25] text-[#ba1a1a] dark:text-[#ffb4ab] hover:bg-[#ffdad6] dark:hover:bg-[#93000a]/40 cursor-pointer shadow-xs'
                        : 'bg-[#ece6f0]/50 dark:bg-[#2a2b30]/50 text-[#44474f]/50 dark:text-[#c4c6d0]/50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>Online Attempts Only</span>
                    <span className="font-mono text-[10px] bg-[#ffdad6] dark:bg-[#93000a] text-[#410002] dark:text-[#ffdad6] px-2 py-0.5 rounded-full font-bold">{customStats.onlineAttemptsCount}</span>
                  </button>

                  <button
                    id="delete-omr-attempts-btn"
                    disabled={customStats.omrAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_omr',
                      title: 'Delete OMR Attempts Only',
                      description: 'This will remove only optical OMR sheet scan attempts while preserving your online digital test history.',
                      count: customStats.omrAttemptsCount
                    })}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-all flex items-center justify-between gap-2 active:scale-95 border-0 ${
                      customStats.omrAttemptsCount > 0
                        ? 'bg-[#fdfbff] dark:bg-[#1e1f25] text-[#ba1a1a] dark:text-[#ffb4ab] hover:bg-[#ffdad6] dark:hover:bg-[#93000a]/40 cursor-pointer shadow-xs'
                        : 'bg-[#ece6f0]/50 dark:bg-[#2a2b30]/50 text-[#44474f]/50 dark:text-[#c4c6d0]/50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>OMR Attempts Only</span>
                    <span className="font-mono text-[10px] bg-[#ffdad6] dark:bg-[#93000a] text-[#410002] dark:text-[#ffdad6] px-2 py-0.5 rounded-full font-bold">{customStats.omrAttemptsCount}</span>
                  </button>
                </div>
              </div>

              {/* 3. Gemini AI Chat Histories */}
              <div className={`p-4 rounded-[20px] flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Gemini Chat Histories
                    </div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                      {customStats.chatHistoriesCount} AI conversation threads & formulas
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-chat-histories-btn"
                  disabled={customStats.chatHistoriesCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'chats',
                    title: 'Clear Gemini AI Chat Histories',
                    description: 'This will wipe all saved AI tutor chat threads, mathematical solver histories, and canvas formulas.',
                    count: customStats.chatHistoriesCount
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  Clear ({customStats.chatHistoriesCount})
                </M3Button>
              </div>

              {/* 4. Study Notes & Formulas */}
              <div className={`p-4 rounded-[20px] flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap ${APP_STYLES.subcard.base}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ece6f0] dark:bg-[#2a2b30] text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Study Notes & Formulas
                    </div>
                    <div className="text-[11px] text-[#44474f] dark:text-[#c4c6d0]">
                      {customStats.notesCount || 0} user study notes & LaTeX solutions
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-study-notes-btn"
                  disabled={!customStats.notesCount || customStats.notesCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'notes',
                    title: 'Delete All Study Notes & Formulas',
                    description: 'This will permanently remove all authored study notes, formulas, and solution tricks from local storage.',
                    count: customStats.notesCount || 0
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete ({customStats.notesCount || 0})
                </M3Button>
              </div>

            </div>
          </div>

          {/* CARD 5: ACCOUNT & DANGER ZONE */}
          {currentUser && (
            <div className="p-5 sm:p-6 bg-[#ffdad6]/60 dark:bg-[#93000a]/25 rounded-[28px] border-0 space-y-3">
              <div className="flex items-center gap-2 text-[#ba1a1a] dark:text-[#ffb4ab] font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Account Deletion Safeguard (Danger Zone)</span>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs font-bold text-[#410002] dark:text-[#ffdad6]">
                    Delete Entire Account & Permanent Cloud Wipe
                  </div>
                  <div className="text-[11px] text-[#ba1a1a] dark:text-[#ffb4ab]/80 mt-0.5">
                    Triggers 3-step permanent deletion of account credentials, cloud Firestore records, and local caches.
                  </div>
                </div>

                <M3Button
                  id="open-delete-account-modal-btn"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete Account
                </M3Button>
              </div>
            </div>
          )}

        </div>

        {/* CUSTOM DATA DELETE CONFIRMATION DIALOG (M3 DIALOG 28PX) */}
        <AnimatePresence>
          {confirmDeleteTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-60 p-4 select-none"
              onClick={() => !isDeletingCustomData && setConfirmDeleteTarget(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-[#f7f2fa] dark:bg-[#202125] text-[#1a1b1f] dark:text-[#e3e2e6] rounded-[28px] p-6 sm:p-7 space-y-4 shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 text-[#ba1a1a] dark:text-[#ffb4ab]">
                  <div className="w-10 h-10 rounded-full bg-[#ffdad6] dark:bg-[#93000a] text-[#410002] dark:text-[#ffdad6] flex items-center justify-center shrink-0 border-0">
                    <Trash2 className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight text-[#1a1b1f] dark:text-[#e3e2e6]">
                    {confirmDeleteTarget.title}
                  </h3>
                </div>

                <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] leading-relaxed">
                  {confirmDeleteTarget.description}
                </p>

                <div className="p-3.5 bg-[#ffdad6] dark:bg-[#93000a]/40 rounded-[20px] text-xs font-bold text-[#410002] dark:text-[#ffdad6] border-0">
                  Target Items: {confirmDeleteTarget.count} records
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <M3Button
                    disabled={isDeletingCustomData}
                    onClick={() => setConfirmDeleteTarget(null)}
                    variant="tonal"
                    className="h-9 px-4 text-xs"
                  >
                    Cancel
                  </M3Button>

                  <M3Button
                    disabled={isDeletingCustomData}
                    onClick={handleExecuteDeleteCustomData}
                    variant="danger"
                    className="h-9 px-4 text-xs"
                    icon={isDeletingCustomData ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  >
                    {isDeletingCustomData ? 'Deleting...' : 'Confirm Delete'}
                  </M3Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3-STEP DELETE ACCOUNT MODAL */}
        <DeleteAccountModal
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          currentUser={currentUser || null}
          onAccountDeleted={() => {
            setIsDeleteDialogOpen(false);
            refreshStats();
            onDataChanged?.();
            onClose();
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
};
