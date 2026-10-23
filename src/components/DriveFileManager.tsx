import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Paperclip,
  ImageIcon,
  Plus,
  Search,
  LayoutGrid,
  List,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Download,
  FolderOpen,
  Calendar,
  X,
  Check,
  Tag,
  ChevronDown,
  Filter,
  Info,
  Cloud,
  CloudOff,
  FileUp,
  ExternalLink,
  RefreshCw,
  Zap,
  Table,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  signInWithGoogle,
  getCachedGoogleAccessToken,
  setCachedGoogleAccessToken,
} from '../lib/firebase';
import {
  listGoogleDriveFiles,
  uploadFileToGoogleDrive,
  deleteGoogleDriveFile,
  downloadGoogleDriveFile,
  createGoogleDoc,
  exportGoogleDoc,
  getOrCreateNotesFolder,
  getOrCreateTestNotesFolder,
  listTestDriveFolders,
  saveNoteToGoogleDrive,
  syncNotesManifestToGoogleDrive,
  loadNotesManifestFromGoogleDrive,
  moveDriveFileToFolder,
  sanitizeFolderName,
  uploadPendingNotesToGoogleDrive,
  getCleanFileName,
  fetchGoogleDriveFileContent,
  cleanUpLegacyVisibleDriveFolders,
  exportNoteToVisibleGoogleDrive,
  type GoogleDriveFile,
  type DocSection,
} from '../lib/googleWorkspace';
import { getAllNotesFromIDB, saveSingleNoteToIDB, getCacheStats, addDeletedTombstone, isTombstoned, getDeletedTombstones } from '../lib/idbNotes';
import {
  isImageFile,
  isPdfFile,
  getDriveImageCandidates,
  extractAttachmentFileName,
} from '../lib/filePreviewUtils';
import {
  studioStaggerContainer,
  studioStaggerItem,
  studioDropdownVariants,
  studioModalVariants,
  studioBackdropVariants,
  gpuAcceleratedStyle,
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import type { User } from 'firebase/auth';

export interface UserNoteItem {
  id: string;
  userId?: string;
  testId: string;
  attemptId?: string;
  questionNumber?: number;
  content: string;
  tag: 'trick' | 'formula' | 'mistake' | 'general' | 'table';
  fileUrl?: string;
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'file';
  createdAt: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  isLocalAttachmentOnly?: boolean;
  isDriveDirectFile?: boolean;
}

interface DriveFileManagerProps {
  notes: UserNoteItem[];
  testTitle?: string;
  testId?: string;
  allTests?: Array<{ id: string; title: string; topic?: string }>;
  isGlobalPage?: boolean;
  onNavigateToTest?: (testId: string) => void;
  onBackToHome?: () => void;
  currentUser?: User | null;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  onRenameNote: (id: string, newName: string) => void;
  onEditNote?: (updatedNote: UserNoteItem) => void;
  onPreviewFile: (file: {
    url: string;
    name: string;
    fileName?: string;
    type: 'image' | 'pdf' | 'file';
    fileType?: 'image' | 'pdf' | 'file';
    content?: string;
    driveFileId?: string;
    driveWebViewLink?: string;
    noteId?: string;
    testTitle?: string;
    questionNumber?: number;
    tag?: string;
    createdAt?: string;
  }) => void;
  onNoteDriveSynced?: (noteId: string, driveFileId: string, webViewLink: string) => void;
  onAddNewFileNote?: (newNote: UserNoteItem) => void;
  onImportDriveNotes?: (importedNotes: UserNoteItem[]) => void;
}

export const DriveFileManager: React.FC<DriveFileManagerProps> = ({
  notes,
  testTitle,
  testId,
  allTests = [],
  isGlobalPage = false,
  onNavigateToTest,
  onBackToHome,
  currentUser,
  onAddNote,
  onDeleteNote,
  onRenameNote,
  onEditNote,
  onPreviewFile,
  onNoteDriveSynced,
  onAddNewFileNote,
  onImportDriveNotes,
}) => {
  // Set activeTab statically to 'local' for a common, unified files & notes storage workspace
  const activeTab = 'local';
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Note Modal States
  const [editingNoteTarget, setEditingNoteTarget] = useState<UserNoteItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editTag, setEditTag] = useState<'general' | 'formula' | 'trick' | 'mistake' | 'table'>('general');
  const [editTestId, setEditTestId] = useState<string>('all');
  const [editAttachedFile, setEditAttachedFile] = useState<{
    url: string;
    name: string;
    type: 'image' | 'pdf' | 'file';
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Local Notes State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'table' | 'text' | 'formula' | 'pdf' | 'image' | 'synced'>('all');
  const [selectedTestFilter, setSelectedTestFilter] = useState<string>(isGlobalPage ? 'all' : (testId || 'all'));
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<boolean>(false);
  const [isTestSelectorOpen, setIsTestSelectorOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Live Google Workspace Sync States
  const [googleToken, setGoogleToken] = useState<string | null>(getCachedGoogleAccessToken());
  const [isTokenExpired, setIsTokenExpired] = useState<boolean>(() => {
    return !getCachedGoogleAccessToken() && (localStorage.getItem('mockmc_had_google_auth') === 'true');
  });
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState<string>('');
  const [driveFilterType, setDriveFilterType] = useState<'all' | 'pdf' | 'image' | 'document'>('all');
  const [driveFolderFilter, setDriveFolderFilter] = useState<'test' | 'notes' | 'all'>('test');
  const [activeFolderName, setActiveFolderName] = useState<string>(sanitizeFolderName(testTitle || 'General Repository'));
  const [availableTestFolders, setAvailableTestFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [notesFolderId, setNotesFolderId] = useState<string | null>(null);

  // Persistent Media Cache Counter
  const [cachedMediaCount, setCachedMediaCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    getCacheStats()
      .then((res) => {
        if (isMounted) setCachedMediaCount(res.count);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [notes, driveFiles]);
  const [testFolderId, setTestFolderId] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState<boolean>(false);

  // Note Sync to Google Drive States
  const [syncingNoteId, setSyncingNoteId] = useState<string | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState<boolean>(false);
  const [isCleaningLegacy, setIsCleaningLegacy] = useState<boolean>(false);

  // Document Compilation & Google Docs States
  const [isExportingToDoc, setIsExportingToDoc] = useState<boolean>(false);
  const [exportedDocLink, setExportedDocLink] = useState<string | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; isFile: boolean } | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [detailsTarget, setDetailsTarget] = useState<UserNoteItem | null>(null);

  // Modal & Popup scroll lock
  useScrollLock(!!renameTarget || !!detailsTarget || !!editingNoteTarget || isFilterDropdownOpen || !!activeMenuId || isFolderDropdownOpen);

  useBackHandler({
    isOpen: !!editingNoteTarget,
    onBack: () => setEditingNoteTarget(null),
    priority: 55,
    id: 'drive_edit_note_modal_back',
  });

  useBackHandler({
    isOpen: !!renameTarget,
    onBack: () => setRenameTarget(null),
    priority: 50,
    id: 'drive_rename_modal_back',
  });

  useBackHandler({
    isOpen: !!detailsTarget,
    onBack: () => setDetailsTarget(null),
    priority: 50,
    id: 'drive_details_modal_back',
  });

  useBackHandler({
    isOpen: isFilterDropdownOpen,
    onBack: () => setIsFilterDropdownOpen(false),
    priority: 30,
    id: 'drive_filter_dropdown_back',
  });

  useBackHandler({
    isOpen: isFolderDropdownOpen,
    onBack: () => setIsFolderDropdownOpen(false),
    priority: 30,
    id: 'drive_folder_dropdown_back',
  });

  useBackHandler({
    isOpen: !!activeMenuId,
    onBack: () => setActiveMenuId(null),
    priority: 25,
    id: 'drive_item_menu_back',
  });

  // Close menus on outside click
  const menuRef = useRef<HTMLDivElement | null>(null);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);
  const folderDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync / Load Google Drive Files & Test Subfolders (Plan C: appDataFolder sandbox)
  const loadDriveFiles = useCallback(async (token: string, search = driveSearchQuery, filter = driveFilterType, folderMode = driveFolderFilter) => {
    setIsDriveLoading(true);
    setDriveError(null);
    try {
      let targetFolderId: string | undefined = undefined;
      
      // 1. Fetch available subfolders dynamically from appDataFolder notes manifest
      const folders = await listTestDriveFolders(token);
      setAvailableTestFolders(folders);

      if (folderMode === 'test' || folderMode === 'notes') {
        const { testFolderName } = await getOrCreateTestNotesFolder(token, testTitle || 'General Repository');
        setNotesFolderId('appDataFolder');
        setTestFolderId('appDataFolder');
        setActiveFolderName(folderMode === 'test' ? testFolderName : 'Google Drive AppData');
        targetFolderId = 'appDataFolder';

        // Auto-load manifest from Google Drive appDataFolder
        const remoteNotes = await loadNotesManifestFromGoogleDrive(token, testTitle || 'General Repository');
        if (remoteNotes && remoteNotes.length > 0 && onImportDriveNotes) {
          onImportDriveNotes(remoteNotes);
        }
      } else {
        setActiveFolderName('All Drive Files');
      }

      const files = await listGoogleDriveFiles(token, search, filter, targetFolderId, targetFolderId === 'appDataFolder' ? 'appDataFolder' : undefined);
      // Filter out internal manifest JSON from file list display
      const displayFiles = files.filter((f) => f.name !== 'mockmc_notes_manifest.json');
      setDriveFiles(displayFiles);
    } catch (err: any) {
      setDriveError(err?.message || "Failed to load Google Drive files.");
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('expire') || err?.message?.toLowerCase().includes('unauthorized')) {
        setGoogleToken(null);
        setCachedGoogleAccessToken(null);
        setIsTokenExpired(true);
      }
    } finally {
      setIsDriveLoading(false);
    }
  }, [driveSearchQuery, driveFilterType, driveFolderFilter, testTitle, onImportDriveNotes]);

  // Check and pull updates made to Google Docs / Drive files back into local notes
  const syncRemoteEditsToLocalNotes = useCallback(async (token: string) => {
    if (!token || !notes || notes.length === 0) return;
    const syncedNotes = notes.filter((n) => n.driveFileId && (!n.fileType || n.fileType === 'file' || !n.fileUrl));
    if (syncedNotes.length === 0) return;

    for (const note of syncedNotes.slice(0, 10)) {
      try {
        const remoteText = await fetchGoogleDriveFileContent(token, note.driveFileId!);
        if (remoteText && remoteText.trim() && remoteText.trim() !== note.content.trim()) {
          const updatedNote = { ...note, content: remoteText.trim() };
          await saveSingleNoteToIDB(updatedNote);
          if (onImportDriveNotes) {
            onImportDriveNotes([updatedNote]);
          }
        }
      } catch (e) {
        // Silently continue
      }
    }
  }, [notes, onImportDriveNotes]);

  // Window focus listener for auto two-way sync
  useEffect(() => {
    const handleFocus = () => {
      const token = getCachedGoogleAccessToken();
      if (token) {
        syncRemoteEditsToLocalNotes(token);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncRemoteEditsToLocalNotes]);

  const isSyncingPendingRef = useRef<boolean>(false);

  // Auto-upload local notes and attachments that haven't reached Google Drive yet
  const syncPendingNotesToDrive = async (token: string) => {
    if (!token || isSyncingPendingRef.current || !notes || notes.length === 0) return;
    const unuploaded = notes.filter((n) => !n.driveFileId && (n.content?.trim() || n.fileUrl));
    if (unuploaded.length === 0) return;

    isSyncingPendingRef.current = true;
    try {
      await uploadPendingNotesToGoogleDrive(token, notes, testTitle, (noteId, driveFileId, webViewLink) => {
        if (onNoteDriveSynced) {
          onNoteDriveSynced(noteId, driveFileId, webViewLink);
        }
      });
      loadDriveFiles(token);
    } catch (err) {
      console.warn('Pending notes sync in DriveFileManager error:', err);
    } finally {
      isSyncingPendingRef.current = false;
    }
  };

  // Load token and trigger Drive folder check on mount
  useEffect(() => {
    const token = getCachedGoogleAccessToken();
    if (token) {
      setGoogleToken(token);
      loadDriveFiles(token);
      syncPendingNotesToDrive(token);
    }
  }, [testTitle]);

  // Reactive listener for token changes (session expiry or reconnect)
  useEffect(() => {
    const handleTokenChanged = (e: any) => {
      const updatedToken = e.detail || getCachedGoogleAccessToken();
      setGoogleToken(updatedToken);
      if (updatedToken) {
        loadDriveFiles(updatedToken);
        syncPendingNotesToDrive(updatedToken);
      }
    };
    window.addEventListener('mockmc-drive-token-changed', handleTokenChanged);
    return () => {
      window.removeEventListener('mockmc-drive-token-changed', handleTokenChanged);
    };
  }, []);

  // Authenticate & connect Google Workspace
  const handleConnectGoogle = async (): Promise<string | null> => {
    if (isDriveLoading) return null;
    setIsDriveLoading(true);
    setDriveError(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const token = getCachedGoogleAccessToken();
        setGoogleToken(token);
        if (token) {
          await loadDriveFiles(token);
          syncPendingNotesToDrive(token);
          return token;
        } else {
          setDriveError("Unable to retrieve Google OAuth access token. Please authorize all scopes.");
        }
      }
      return null;
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = (err?.message || '').toLowerCase();
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('cancelled-popup-request') ||
        errMsg.includes('closed-by-user')
      ) {
        return null;
      }
      setDriveError(err?.message || "Google Workspace authentication failed. Please retry.");
      return null;
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Direct file upload handler from repository
  const handleDirectUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(file.name);
    const fileType: 'image' | 'pdf' | 'file' = isPdf ? 'pdf' : isImg ? 'image' : 'file';

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const noteItem: UserNoteItem = {
        id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        testId: testId || 'notes_repository',
        content: `Uploaded: ${file.name}`,
        tag: 'general',
        fileUrl: dataUrl,
        fileName: file.name,
        fileType: fileType,
        createdAt: new Date().toISOString(),
      };

      if (onAddNewFileNote) {
        onAddNewFileNote(noteItem);
      }

      // Automatically upload & save to Google Drive inside test folder if connected
      let token = googleToken || getCachedGoogleAccessToken();
      if (token) {
        setSyncingNoteId(noteItem.id);
        try {
          const res = await saveNoteToGoogleDrive(token, noteItem, testTitle);
          if (onNoteDriveSynced) {
            onNoteDriveSynced(noteItem.id, res.driveFileId, res.webViewLink);
          }
          setExportSuccessMessage(`"${file.name}" uploaded to Drive (${res.testFolderName})!`);
          setTimeout(() => setExportSuccessMessage(null), 4500);
          loadDriveFiles(token);
        } catch (err: any) {
          console.warn('Auto drive upload error:', err);
        } finally {
          setSyncingNoteId(null);
        }
      } else {
        setExportSuccessMessage(`"${file.name}" saved to repository. Connect Drive to auto-sync.`);
        setTimeout(() => setExportSuccessMessage(null), 4000);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Upload local file to Google Drive test folder
  const handleUploadLocalFileToDrive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !googleToken) return;

    setIsUploadingToDrive(true);
    setDriveError(null);
    try {
      const { testFolderId: fId, testFolderName } = await getOrCreateTestNotesFolder(googleToken, testTitle);
      await uploadFileToGoogleDrive(googleToken, file.name, file.type, file, fId);
      await loadDriveFiles(googleToken);
      setExportSuccessMessage(`Successfully uploaded "${file.name}" to Drive (${testFolderName})!`);
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (err: any) {
      setDriveError(err?.message || "Failed to upload file to Google Drive.");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Save single note to Google Drive inside Mock MC App > Notes > [Test Name]
  const [isOpeningDriveFolder, setIsOpeningDriveFolder] = useState(false);

  // Open the specific test's notes folder in Google Drive directly
  const handleOpenFolderInDrive = async () => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }
    setIsOpeningDriveFolder(true);
    try {
      const folder = await getOrCreateTestNotesFolder(token, testTitle || 'General Repository');
      const targetFolderId = folder?.testFolderId || folder?.notesFolderId || folder?.appFolderId;
      if (targetFolderId) {
        window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank');
      } else {
        window.open('https://drive.google.com/drive/my-drive', '_blank');
      }
    } catch (err: any) {
      console.warn('Error opening folder in Drive:', err);
      window.open('https://drive.google.com/drive/my-drive', '_blank');
    } finally {
      setIsOpeningDriveFolder(false);
    }
  };

  // Sync all local notes and documents to Google Drive in batch
  const handleSyncAllLocalNotes = async () => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }
    setIsBulkSyncing(true);
    try {
      await syncPendingNotesToDrive(token);
      setExportSuccessMessage("All notes and files synchronized with Google Drive!");
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (err: any) {
      console.warn('Sync all notes error:', err);
    } finally {
      setIsBulkSyncing(false);
    }
  };

  // Safe file preview trigger with IDB fallback and Drive web view fallback
  const handleTriggerPreview = async (item: UserNoteItem) => {
    let activeUrl = item.fileUrl || '';

    const isPdf = isPdfFile(item);
    const isImg = !isPdf && isImageFile(item);
    const hasRichText = Boolean(item.content && item.content.trim().length > 0 && !item.content.trim().startsWith('data:image/') && item.content.trim() !== (item.fileUrl || '').trim());
    const isPureImageOnly = isImg && !hasRichText;
    const resolvedType: 'image' | 'pdf' | 'file' = isPdf ? 'pdf' : isPureImageOnly ? 'image' : 'file';

    // Stale blob: URLs from previous sessions or other devices are invalid.
    const activeToken = googleToken || getCachedGoogleAccessToken();
    if (activeUrl.startsWith('blob:') && item.driveFileId) {
      activeUrl = isImg ? getDriveImageCandidates(item.driveFileId, activeToken)[0] : '';
    }

    // If local fileUrl is missing but driveFileId exists for an image
    if (isImg && item.driveFileId && (!activeUrl || activeUrl.startsWith('blob:'))) {
      activeUrl = getDriveImageCandidates(item.driveFileId, activeToken)[0];
    }

    const displayName = getCleanFileName(item.fileName, item.content);

    // If local fileUrl is missing, retrieve from IndexedDB
    if (!activeUrl && !item.driveFileId) {
      try {
        const allLocalNotes = await getAllNotesFromIDB();
        const localMatch = allLocalNotes.find((n: any) => n.id === item.id);
        if (localMatch?.fileUrl) {
          activeUrl = localMatch.fileUrl;
        } else if (localMatch?.content) {
          const imgMatch = localMatch.content.match(/!\[.*?\]\((data:image\/[^)]+)\)/) || localMatch.content.match(/(data:image\/[a-zA-Z0-9+;=,/-]+)/);
          if (imgMatch && imgMatch[1]) {
            activeUrl = imgMatch[1];
          }
        }
      } catch (e) {
        console.warn('IDB lookup warning:', e);
      }
    }

    onPreviewFile({
      url: activeUrl,
      name: displayName,
      fileName: item.fileName,
      type: resolvedType,
      fileType: resolvedType,
      content: item.content || '',
      driveFileId: item.driveFileId,
      driveWebViewLink: item.driveWebViewLink || (item.driveFileId ? `https://drive.google.com/file/d/${item.driveFileId}/view` : undefined),
      noteId: item.id,
      testTitle: testTitle || item.testId,
      questionNumber: item.questionNumber,
      tag: item.tag,
      createdAt: item.createdAt,
    });
  };

  const handleSaveIndividualNoteToDrive = async (note: UserNoteItem) => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    setSyncingNoteId(note.id);
    try {
      const res = await saveNoteToGoogleDrive(token, note, testTitle);
      if (onNoteDriveSynced) {
        onNoteDriveSynced(note.id, res.driveFileId, res.webViewLink);
      }
      setExportSuccessMessage('Saved to Google Drive AppData Sandbox (Plan C: zero duplicate folders)!');
      setTimeout(() => setExportSuccessMessage(null), 4500);
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Google Drive save error:', err);
      setDriveError("Save to Google Drive failed. Please check your connection or reconnect.");
    } finally {
      setSyncingNoteId(null);
    }
  };

  // Sync all notes to Google Drive AppData Sandbox (Plan C)
  const handleSyncAllNotesToDrive = async () => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    if (notes.length === 0) {
      return;
    }

    setIsBulkSyncing(true);
    try {
      for (const note of notes) {
        if (!note.driveFileId) {
          const res = await saveNoteToGoogleDrive(token, note, testTitle);
          if (onNoteDriveSynced) {
            onNoteDriveSynced(note.id, res.driveFileId, res.webViewLink);
          }
        }
      }
      await syncNotesManifestToGoogleDrive(token, notes, testTitle);
      setExportSuccessMessage(`All ${notes.length} notes synced cleanly to Google Drive AppData (Plan C: zero duplicates)!`);
      setTimeout(() => setExportSuccessMessage(null), 4500);
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Sync all notes error:', err);
      setDriveError("Sync to Google Drive failed. Reconnect required.");
    } finally {
      setIsBulkSyncing(false);
    }
  };

  // Plan C: Clean up legacy visible folders from Google Drive
  const handleCleanUpLegacyFolders = async () => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    setIsCleaningLegacy(true);
    try {
      const res = await cleanUpLegacyVisibleDriveFolders(token);
      if (res.cleanedCount > 0) {
        setExportSuccessMessage(`Cleaned up ${res.cleanedCount} old visible folder(s) from your Google Drive. Plan C is active!`);
      } else {
        setExportSuccessMessage('No old visible folders found in your Google Drive. Everything is clean!');
      }
      setTimeout(() => setExportSuccessMessage(null), 5000);
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Clean up error:', err);
      setDriveError(`Clean up failed: ${err?.message || err}`);
    } finally {
      setIsCleaningLegacy(false);
    }
  };

  // Open Note directly in Google Docs (create or sync if not yet created)
  const handleOpenInGoogleDoc = async (item: UserNoteItem) => {
    setActiveMenuId(null);
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    try {
      setIsExportingToDoc(true);
      const res = await exportNoteToVisibleGoogleDrive(token, item, testTitle || item.testId || 'General Repository');
      if (res.webViewLink) {
        window.open(res.webViewLink, '_blank');
      }
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Failed to open/export in Google Docs:', err);
      setDriveError(`Failed to open in Google Docs: ${err?.message || err}`);
    } finally {
      setIsExportingToDoc(false);
    }
  };

  // Open Note directly in Google Drive (save/upload if not yet in Drive)
  const handleOpenInGoogleDrive = async (item: UserNoteItem) => {
    setActiveMenuId(null);
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    try {
      setSyncingNoteId(item.id);
      const res = await exportNoteToVisibleGoogleDrive(token, item, testTitle || item.testId || 'General Repository');
      if (res.webViewLink) {
        window.open(res.webViewLink, '_blank');
      }
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Failed to upload/open in Google Drive:', err);
      setDriveError(`Failed to open in Google Drive: ${err?.message || err}`);
    } finally {
      setSyncingNoteId(null);
    }
  };

  // Google Doc creation for an individual note inside test folder
  const handleExportNoteToGoogleDoc = async (note: UserNoteItem) => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    const title = getCleanFileName(note.fileName, note.content) || `Math Note - ${note.tag.toUpperCase()} (${new Date().toLocaleDateString()})`;

    setIsExportingToDoc(true);
    setExportSuccessMessage(null);
    setExportedDocLink(null);
    setDriveError(null);

    try {
      const res = await exportNoteToVisibleGoogleDrive(token, note, testTitle || note.testId || 'General Repository');
      setExportedDocLink(res.webViewLink || null);
      setExportSuccessMessage(`Created Google Doc "${title}" in your Google Drive!`);
      if (res.webViewLink) {
        window.open(res.webViewLink, '_blank');
      }
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Google Doc export error:', err);
      setDriveError(`Google Doc export failed: ${err?.message || err}`);
    } finally {
      setIsExportingToDoc(false);
    }
  };

  // Compile all notes into a single comprehensive Google Doc inside test folder
  const handleExportAllNotesToGoogleDoc = async () => {
    let token = googleToken || getCachedGoogleAccessToken();
    if (!token) {
      token = await handleConnectGoogle();
      if (!token) return;
    }

    if (notes.length === 0) {
      setDriveError("You do not have any notes to export yet.");
      return;
    }

    const folderName = sanitizeFolderName(testTitle || 'General Repository');

    setIsExportingToDoc(true);
    setExportSuccessMessage(null);
    setExportedDocLink(null);
    setDriveError(null);

    try {
      const docSections = notes.map((note, idx) => ({
        title: `${idx + 1}. ${note.fileName || `Revision Note #${idx + 1}`} [${note.tag.toUpperCase()}]`,
        body: `${note.content}\n\n(Created: ${new Date(note.createdAt).toLocaleDateString()}${note.questionNumber ? ` | Question Ref: Q${note.questionNumber}` : ''})`,
        isHeading: true,
      }));

      const title = `${folderName} - Revision Guide (${new Date().toLocaleDateString()})`;
      const doc = await createGoogleDoc(token, title, docSections);
      const link = doc.webViewLink || `https://docs.google.com/document/d/${doc.documentId}/edit`;
      setExportedDocLink(link);
      setExportSuccessMessage(`Compiled revision guide in your Google Drive!`);
      if (link) {
        window.open(link, '_blank');
      }
      loadDriveFiles(token);
    } catch (err: any) {
      console.warn('Google Doc compilation error:', err);
      setDriveError(`Google Doc compilation failed: ${err?.message || err}`);
    } finally {
      setIsExportingToDoc(false);
    }
  };

  // Delete a live Google Drive File
  const handleArchiveDriveFile = async (file: GoogleDriveFile) => {
    if (!googleToken) return;

    setIsDriveLoading(true);
    setDriveError(null);
    try {
      await deleteGoogleDriveFile(googleToken, file.id);
      await loadDriveFiles(googleToken);
      setExportSuccessMessage(`Successfully deleted "${file.name}" from Google Drive.`);
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (err: any) {
      console.warn('Failed to delete Drive file:', err);
      setDriveError(`Failed to delete Google Drive file: ${err?.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Download raw Google Drive File to local
  const handleDownloadDriveFile = async (file: GoogleDriveFile) => {
    if (!googleToken) return;
    try {
      const blob = await downloadGoogleDriveFile(googleToken, file.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.warn('Download error:', err);
      setDriveError(`Download failed: ${err?.message || err}`);
    }
  };

  // Merge notes with any remote Drive files in the current folder that aren't yet in local state
  const combinedItems = React.useMemo(() => {
    let list: UserNoteItem[] = [...notes];

    // Filter by test if selected and not 'all'
    if (selectedTestFilter !== 'all') {
      list = list.filter((n) => n.testId === selectedTestFilter);
    }

    const tombstones = getDeletedTombstones();
    const existingFileIds = new Set(list.map((n) => n.driveFileId).filter(Boolean));
    const existingFileNames = new Set(list.map((n) => n.fileName).filter(Boolean));

    driveFiles.forEach((df) => {
      if (tombstones.has(df.id) || tombstones.has(`drive_${df.id}`)) return;
      if (!existingFileIds.has(df.id) && !existingFileNames.has(df.name)) {
        const isPdf = df.mimeType === 'application/pdf' || /\.pdf$/i.test(df.name);
        const isImg = df.mimeType.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(df.name);
        list.push({
          id: `drive_${df.id}`,
          testId: testId || 'notes_repository',
          content: df.name,
          tag: 'general',
          fileName: df.name,
          fileType: isPdf ? 'pdf' : isImg ? 'image' : 'file',
          fileUrl: df.thumbnailLink || df.webViewLink,
          driveFileId: df.id,
          driveWebViewLink: df.webViewLink,
          createdAt: df.createdTime || new Date().toISOString(),
          isDriveDirectFile: true,
        });
      }
    });

    // Strict Deduplication Pass: remove duplicate items sharing driveFileId or identical clean title
    const seenKeys = new Set<string>();
    const deduplicatedList: UserNoteItem[] = [];

    for (const item of list) {
      if (tombstones.has(item.id) || (item.driveFileId && (tombstones.has(item.driveFileId) || tombstones.has(`drive_${item.driveFileId}`)))) {
        continue;
      }
      const cleanTitleKey = getCleanFileName(item.fileName, item.content).toLowerCase();
      const contentKey = (item.content || '').slice(0, 80).toLowerCase().trim();
      const key = item.driveFileId ? `drive_${item.driveFileId}` : `item_${cleanTitleKey}_${contentKey}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduplicatedList.push(item);
      }
    }

    return deduplicatedList;
  }, [notes, driveFiles, testId, selectedTestFilter]);

  // Helper to identify whether an item represents a structured table note
  const isTableItem = (n: UserNoteItem) => {
    if (n.tag === 'table') return true;
    if (n.fileName && /table/i.test(n.fileName)) return true;
    if (n.content) {
      if (n.content.includes('<table')) return true;
      return n.content.split('\n').some((l) => {
        const tr = l.trim();
        return (tr.startsWith('|') && tr.includes('|', 1)) || (tr.includes('|') && tr.split('|').length >= 3);
      });
    }
    return false;
  };

  // Category counts (Combined Notes & Drive Files)
  const allCount = combinedItems.length;
  const tableCount = combinedItems.filter(isTableItem).length;
  const pdfCount = combinedItems.filter((n) => n.fileType === 'pdf' || (n.fileName && /\.pdf$/i.test(n.fileName))).length;
  const imageCount = combinedItems.filter((n) => n.fileType === 'image' || (n.fileName && /\.(jpg|jpeg|png)$/i.test(n.fileName))).length;
  const textCount = combinedItems.filter((n) => !n.fileUrl && !n.isDriveDirectFile && n.tag !== 'formula' && n.tag !== 'trick' && !isTableItem(n)).length;
  const formulaCount = combinedItems.filter((n) => n.tag === 'formula' || n.tag === 'trick').length;
  const syncedCount = combinedItems.filter((n) => Boolean(n.driveFileId || n.driveWebViewLink)).length;

  // Filter local notes based on type and search query
  const filteredNotes = combinedItems.filter((item) => {
    const isPdf =
      item.fileType === 'pdf' ||
      (item.fileName && /\.pdf$/i.test(item.fileName)) ||
      (item.fileUrl && item.fileUrl.startsWith('data:application/pdf'));

    const isImage =
      item.fileType === 'image' ||
      (item.fileName && /\.(jpg|jpeg|png)$/i.test(item.fileName));

    const isFormula = item.tag === 'formula' || item.tag === 'trick';
    const isTable = isTableItem(item);
    const isSynced = Boolean(item.driveFileId || item.driveWebViewLink);

    // Filter type condition
    if (filterType === 'table' && !isTable) return false;
    if (filterType === 'pdf' && !isPdf) return false;
    if (filterType === 'image' && !isImage) return false;
    if (filterType === 'text' && (isPdf || isImage || isFormula || isTable)) return false;
    if (filterType === 'formula' && !isFormula) return false;
    if (filterType === 'synced' && !isSynced) return false;

    // Search query condition
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = item.fileName?.toLowerCase().includes(q);
    const contentMatch = item.content?.toLowerCase().includes(q);
    const tagMatch = item.tag?.toLowerCase().includes(q);
    return nameMatch || contentMatch || tagMatch;
  });

  const handleOpenRename = (note: UserNoteItem) => {
    const isFile = !!note.fileName;
    const currentName = note.fileName || note.content || 'Untitled Note';
    setRenameTarget({ id: note.id, name: currentName, isFile });
    setRenameInput(currentName);
    setActiveMenuId(null);
  };

  const handleOpenEditNote = (note: UserNoteItem) => {
    setEditingNoteTarget(note);
    setEditTitle(getCleanFileName(note.fileName, note.content));
    setEditContent(note.content || '');
    const validTags = ['general', 'formula', 'trick', 'mistake', 'table'];
    setEditTag(validTags.includes(note.tag) ? (note.tag as any) : 'general');
    setEditTestId(note.testId || (testId || 'all'));
    if (note.fileUrl) {
      setEditAttachedFile({
        url: note.fileUrl,
        name: note.fileName || 'Attachment',
        type: note.fileType || 'file',
      });
    } else {
      setEditAttachedFile(null);
    }
    setActiveMenuId(null);
  };

  const handleSaveEditedNote = async () => {
    if (!editingNoteTarget) return;
    setIsSavingEdit(true);
    try {
      const trimmedTitle = editTitle.trim() || editingNoteTarget.fileName || 'Untitled Note';
      const trimmedContent = editContent.trim();
      const resolvedTestId = editTestId === 'all' ? 'global_repo' : editTestId;

      const updatedItem: UserNoteItem = {
        ...editingNoteTarget,
        fileName: trimmedTitle,
        content: trimmedContent,
        tag: editTag,
        testId: resolvedTestId,
        fileUrl: editAttachedFile ? editAttachedFile.url : (editAttachedFile === null ? undefined : editingNoteTarget.fileUrl),
        fileType: editAttachedFile ? editAttachedFile.type : (editAttachedFile === null ? undefined : editingNoteTarget.fileType),
      };

      await saveSingleNoteToIDB(updatedItem);

      if (onEditNote) {
        onEditNote(updatedItem);
      } else if (onAddNewFileNote) {
        onAddNewFileNote(updatedItem);
      }

      // Sync to Google Drive if connected
      const token = googleToken || getCachedGoogleAccessToken();
      if (token) {
        saveNoteToGoogleDrive(token, updatedItem, testTitle).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent('notes-updated', { detail: updatedItem }));
      setEditingNoteTarget(null);
    } catch (err) {
      console.warn('Failed to save edited note:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    const reader = new FileReader();
    reader.onload = () => {
      setEditAttachedFile({
        url: reader.result as string,
        name: file.name,
        type: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveRename = () => {
    if (renameTarget && renameInput.trim()) {
      onRenameNote(renameTarget.id, renameInput.trim());
      setRenameTarget(null);
      setRenameInput('');
    }
  };

  const renderContextMenu = (
    item: UserNoteItem,
    isPdf: boolean,
    isImg: boolean,
    isMenuOpen: boolean,
    direction: 'up' | 'down' = 'up'
  ) => {
    if (!isMenuOpen) return null;

    const menuContent = (
      <>
        {/* Item Quick Details Summary Box inside 3-dots popup */}
        <div className="p-2.5 rounded-xl bg-[#f0f2f5] dark:bg-[#222634] border-0 shadow-xs space-y-1 text-[11px]">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 font-semibold">
            <span className="uppercase text-[9px] tracking-wider text-[#0084ff] font-bold">Details</span>
            <span className="font-mono text-[10px]">{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f8fafc] dark:bg-[#222634] text-slate-700 dark:text-zinc-200 border-0 shadow-xs">
              {isPdf ? 'PDF Document' : isImg ? 'Image' : 'Text Note'}
            </span>
            {item.questionNumber ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-[#0084ff] dark:text-blue-400">
                Q{item.questionNumber}
              </span>
            ) : null}
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-200/80 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
              {item.tag}
            </span>
          </div>
        </div>

        <div className="pt-1 space-y-1">
          <button
            type="button"
            onClick={() => {
              setActiveMenuId(null);
              setDetailsTarget(item);
            }}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f0f2f5] dark:hover:bg-[#282a39] flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Info className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">View Full Details</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMenuId(null);
              handleTriggerPreview(item);
            }}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f0f2f5] dark:hover:bg-[#282a39] flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0084ff] flex items-center justify-center shrink-0">
              <Eye className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Preview</span>
          </button>

          {/* Edit Note */}
          <button
            type="button"
            onClick={() => handleOpenEditNote(item)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 text-[#0084ff] dark:text-blue-400 flex items-center gap-2.5 font-semibold cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0084ff] flex items-center justify-center shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Edit Note</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenRename(item)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f0f2f5] dark:hover:bg-[#282a39] flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Rename</span>
          </button>

          {/* Open in Google Docs */}
          <button
            type="button"
            onClick={() => handleOpenInGoogleDoc(item)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Open in Google Docs</span>
          </button>

          {/* Open in Google Drive */}
          <button
            type="button"
            onClick={() => handleOpenInGoogleDrive(item)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-500 flex items-center justify-center shrink-0">
              <Cloud className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Open in Google Drive</span>
          </button>

          {item.fileUrl && (
            <a
              href={item.fileUrl}
              download={item.fileName || 'file'}
              onClick={() => setActiveMenuId(null)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f0f2f5] dark:hover:bg-[#282a39] flex items-center gap-2.5 font-medium cursor-pointer transition-colors active:scale-98"
            >
              <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center shrink-0">
                <Download className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs">Download</span>
            </a>
          )}

          <div className="h-px bg-slate-200 dark:bg-zinc-700/80 my-1" />

          {/* Delete Option - Cleanly Highlighted and Tap-Safe */}
          <button
            type="button"
            onClick={() => {
              setActiveMenuId(null);
              addDeletedTombstone(item.id);
              if (item.driveFileId) {
                addDeletedTombstone(item.driveFileId);
                addDeletedTombstone(`drive_${item.driveFileId}`);
              }
              setDriveFiles((prev) =>
                prev.filter(
                  (f) =>
                    f.id !== item.driveFileId &&
                    f.id !== item.id &&
                    f.id !== item.id.replace('drive_', '')
                )
              );
              const token = googleToken || getCachedGoogleAccessToken();
              if (item.driveFileId && token) {
                deleteGoogleDriveFile(token, item.driveFileId).catch(() => {});
              }
              onDeleteNote(item.id);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center gap-2.5 font-bold cursor-pointer transition-colors active:scale-98"
          >
            <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs">Delete File</span>
          </button>
        </div>
      </>
    );

    return (
      <>
        {/* Mobile View Bottom-Sheet Modal ensuring delete option is never off-screen */}
        <div
          className="sm:hidden fixed inset-0 z-[100] bg-black/60 flex items-end justify-center p-3 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenuId(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#f8fafc] dark:bg-[#21222e] border-0 shadow-2xl p-4 text-xs text-slate-700 dark:text-zinc-200 space-y-2 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100/50 dark:border-zinc-800/30">
              <span className="font-bold text-sm text-slate-800 dark:text-zinc-100">File Actions</span>
              <button
                type="button"
                onClick={() => setActiveMenuId(null)}
                className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {menuContent}
          </div>
        </div>

        {/* Desktop View Anchored Context Popover */}
        <div
          className={`hidden sm:block absolute right-0 ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } w-60 max-h-[min(380px,calc(100vh-100px))] overflow-y-auto rounded-2xl bg-[#f8fafc] dark:bg-[#21222e] border-0 shadow-2xl z-50 p-2 text-xs text-slate-700 dark:text-zinc-200 space-y-1 animate-in fade-in zoom-in-95 duration-100`}
        >
          {menuContent}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4 font-sans text-slate-800 dark:text-zinc-100">

      {/* COMPILATION AND GOOGLE DOC SUCCESS PORTAL POP-UP */}
      {exportSuccessMessage && (
        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top duration-200">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-indigo-600" />
              <span>{exportSuccessMessage}</span>
            </h4>
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
              The compiled notes and calculations have been synchronized directly to your Google Docs account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {exportedDocLink && (
              <a
                href={exportedDocLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <span>Open Google Doc</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={() => setExportSuccessMessage(null)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="space-y-3.5">
        {/* SEARCH & CONTROLS PANEL (Matching Home Screen Card Style) */}
        <div className="bg-white dark:bg-[#1e2024] p-3.5 sm:p-5 rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3">
          {/* M3 Search Box (Reduced height) */}
          <div className="relative w-full">
            <div className="h-9.5 sm:h-10 w-full rounded-full bg-[#f0f4f9] dark:bg-[#141619] flex items-center px-3.5 sm:px-4 gap-2.5 border-0 shadow-none transition-all">
              <Search className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 stroke-[2.2]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes, formulas, diagrams, questions..."
                className="w-full bg-transparent text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#5e5e5e]/70 dark:placeholder-[#9aa0a6]/70 border-0 outline-none focus:ring-0 font-normal"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="w-7 h-7 rounded-full bg-transparent hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center justify-center transition-all cursor-pointer border-0"
                  title="Clear Search"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>

          {/* Action and Filter Controls Group: Left Hand and Right Hand */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 w-full">
            {/* LEFT HAND CONTROLS: All Tests & Files button without border ring */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Test / Scope Selector Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (allTests.length > 0) {
                      setIsTestSelectorOpen(!isTestSelectorOpen);
                    }
                  }}
                  className="flex items-center gap-2 h-9 px-3.5 sm:px-4 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] hover:bg-[#e2e8f0] dark:hover:bg-[#32353c] text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-none transition-all cursor-pointer active:scale-95 outline-none"
                  title="Filter by specific test or view all app files"
                >
                  <FolderOpen className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <span className="max-w-[110px] xs:max-w-[140px] sm:max-w-[170px] truncate">
                    {selectedTestFilter === 'all'
                      ? (isGlobalPage ? 'All Tests & Files' : (testTitle ? `${testTitle} Files` : 'All Tests & Files'))
                      : allTests.find((t) => t.id === selectedTestFilter)?.title || testTitle || 'Current Test'}
                  </span>
                  {allTests.length > 0 && (
                    <ChevronDown className={`w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] transition-transform ${isTestSelectorOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>

                {/* Dropdown menu */}
                {isTestSelectorOpen && allTests.length > 0 && (
                  <div className="absolute left-0 top-full mt-2 w-64 max-h-64 overflow-y-auto rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-2 z-50 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTestFilter('all');
                        setIsTestSelectorOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[16px] text-xs font-semibold text-left transition-colors cursor-pointer border-0 ${
                        selectedTestFilter === 'all'
                          ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold'
                          : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                      }`}
                    >
                      <span>All Tests & Files</span>
                      {selectedTestFilter === 'all' && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </button>

                    {allTests.map((t) => {
                      const testNoteCount = notes.filter((n) => n.testId === t.id).length;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTestFilter(t.id);
                            setIsTestSelectorOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[16px] text-xs font-semibold text-left transition-colors cursor-pointer border-0 ${
                            selectedTestFilter === t.id
                              ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold'
                              : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                          }`}
                        >
                          <span className="truncate pr-2">{t.title}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-[#f0f4f9] dark:bg-[#282a30]">
                              {testNoteCount}
                            </span>
                            {selectedTestFilter === t.id && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT HAND CONTROLS: Plus button -> Sync button -> Grid/List view toggle at very right end */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {/* + Add Note Button */}
              <button
                id="notes-create-btn"
                type="button"
                onClick={onAddNote}
                className="w-9 h-9 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-[0_2px_6px_rgba(11,87,208,0.25)] border-0 shrink-0 outline-none"
                title="Create Revision Note"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>

              {/* Sync Button */}
              <button
                type="button"
                onClick={handleSyncAllLocalNotes}
                disabled={isBulkSyncing || isDriveLoading}
                className="w-9 h-9 rounded-full bg-[#f0f4f9] hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#32353c] active:scale-95 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all cursor-pointer border-0 shadow-xs shrink-0 disabled:opacity-50 outline-none"
                title="Sync files and notes with Google Drive"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${isBulkSyncing || isDriveLoading ? 'animate-spin' : ''}`} />
              </button>

              {/* View Mode Switcher (Grid / List) at very right end */}
              <div className="h-9 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] border-0 p-0.5 flex items-center gap-0.5 shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`w-7.5 h-7.5 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 outline-none ${
                    viewMode === 'grid'
                      ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold'
                      : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:bg-[#e2e8f0] dark:hover:bg-[#32353c]'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`w-7.5 h-7.5 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 outline-none ${
                    viewMode === 'list'
                      ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold'
                      : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:bg-[#e2e8f0] dark:hover:bg-[#32353c]'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Category Quick Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'all'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            All ({allCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('table')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'table'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <Table className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Tables ({tableCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('text')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'text'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Notes ({textCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('formula')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'formula'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Formulas ({formulaCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('pdf')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'pdf'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>PDFs ({pdfCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('image')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'image'
                ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Images ({imageCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('synced')}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-0 ${
              filterType === 'synced'
                ? 'bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#c4eed0] font-bold shadow-xs'
                : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Synced ({syncedCount})</span>
          </button>
        </div>

          {/* Main Files Display */}
          {filteredNotes.length === 0 ? (
            <div className="bg-white dark:bg-[#1e2024] rounded-[24px] text-center py-12 px-4 space-y-3 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 ring-0">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#141619] flex items-center justify-center mx-auto mb-2 text-slate-400 dark:text-zinc-500">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                  {searchQuery || filterType !== 'all' ? 'No matching files or notes found' : 'Your Revision Hub is Empty'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  {searchQuery
                    ? `No items found matching "${searchQuery}".`
                    : filterType !== 'all'
                    ? `No ${filterType.toUpperCase()} items found in this category.`
                    : 'Upload study sheets, take exam notes, or compile everything directly into Google Docs.'}
                </p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Google Drive Grid Layout matching Home Screen Cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full">
              {filteredNotes.map((item, index) => {
                const isPdf = isPdfFile(item);
                const isImg = !isPdf && isImageFile(item);

                let imgDisplayUrl = '';
                const activeToken = googleToken || getCachedGoogleAccessToken();
                if (isImg) {
                  if (item.fileUrl && !item.fileUrl.startsWith('blob:')) {
                    imgDisplayUrl = item.fileUrl;
                  } else if (item.driveFileId) {
                    imgDisplayUrl = getDriveImageCandidates(item.driveFileId, activeToken)[0];
                  }
                }

                const isMarkdownFile = !isImg && !isPdf && Boolean(
                  (item.fileName && /\.(md|markdown|txt)$/i.test(item.fileName)) ||
                  (!item.fileType && item.content && !item.fileUrl)
                );
                const isTable = isTableItem(item);

                const isMenuOpen = activeMenuId === item.id;
                const displayName = getCleanFileName(item.fileName, item.content);

                return (
                  <div
                    key={item.id ? `note-${item.id}-${index}` : `note-index-${index}`}
                    className="group relative rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 overflow-hidden flex flex-col justify-between"
                  >
                    {/* Top File Preview Box */}
                    <div
                      onClick={() => handleTriggerPreview(item)}
                      className="relative h-28 sm:h-32 bg-slate-50/70 dark:bg-[#181a1f] border-b border-slate-100 dark:border-zinc-800/60 p-2 flex flex-col items-center justify-center cursor-pointer overflow-hidden animate-none"
                    >
                      {isImg && imgDisplayUrl ? (
                        <div className="w-full h-full relative flex items-center justify-center">
                          <img
                            src={imgDisplayUrl}
                            alt={displayName}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.currentTarget;
                              const token = googleToken || getCachedGoogleAccessToken();
                              if (item.driveFileId) {
                                if (!img.dataset.fallbackLevel) {
                                  img.dataset.fallbackLevel = '1';
                                  img.src = `/api/drive/media/${item.driveFileId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
                                  return;
                                }
                                if (img.dataset.fallbackLevel === '1') {
                                  img.dataset.fallbackLevel = '2';
                                  img.src = `https://drive.google.com/thumbnail?id=${item.driveFileId}&sz=w800`;
                                  return;
                                }
                              }
                              img.style.display = 'none';
                              const badge = img.parentElement?.querySelector('.img-grid-fallback-badge');
                              if (badge) {
                                (badge as HTMLElement).style.display = 'flex';
                              }
                            }}
                            className="w-full h-full object-contain rounded-xl group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="img-grid-fallback-badge hidden flex-col items-center justify-center gap-1.5 text-center p-1.5">
                            <div className="w-9 h-9 rounded-full bg-blue-500/15 flex flex-col items-center justify-center text-[#0084ff]">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 truncate max-w-[120px]">
                              {displayName}
                            </span>
                          </div>
                        </div>
                      ) : isPdf ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-center p-1.5">
                          <div className="w-10 h-10 rounded-full bg-rose-500/15 flex flex-col items-center justify-center text-rose-600 dark:text-rose-400">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 line-clamp-2 px-1 leading-tight">
                            {displayName}
                          </span>
                        </div>
                      ) : isTable ? (
                        <div className="w-full h-full p-2 bg-cyan-500/5 dark:bg-cyan-500/10 rounded-xl overflow-hidden flex flex-col justify-between">
                          <div className="overflow-hidden max-h-[76px] pointer-events-none scale-[0.88] origin-top-left">
                            <MathRenderer content={item.content} tableActions="none" />
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 mt-auto">
                            <Table className="w-3 h-3" />
                            <span>Data Table</span>
                          </div>
                        </div>
                      ) : item.content ? (
                        <div className="w-full h-full p-2.5 bg-amber-500/5 dark:bg-amber-500/10 rounded-xl overflow-hidden text-slate-800 dark:text-zinc-200 text-xs leading-relaxed font-sans">
                          <MathRenderer content={item.content} tableActions="none" />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-center p-1.5">
                          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex flex-col items-center justify-center text-amber-600 dark:text-amber-400">
                            <FileText className="w-4 h-4" />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 line-clamp-2 px-1 leading-tight">
                            {displayName}
                          </span>
                        </div>
                      )}

                      {/* Hover Quick Preview Overlay */}
                      <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-2">
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5" />
                        </div>
                        <span>Open Preview</span>
                      </div>
                    </div>

                    {/* Bottom Card File Info & Drive 3-Dots Action Menu */}
                    <div className="p-3.5 flex items-center justify-between gap-1.5 bg-white dark:bg-[#1e2024] rounded-b-[24px]">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* File Type Badge Icon - Round */}
                        <div className="shrink-0">
                          {isPdf ? (
                            <div className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                              <Paperclip className="w-3.5 h-3.5" />
                            </div>
                          ) : isImg ? (
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                              <ImageIcon className="w-3.5 h-3.5" />
                            </div>
                          ) : isTable ? (
                            <div className="w-7 h-7 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                              <Table className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            onClick={() => handleTriggerPreview(item)}
                            title={displayName}
                            className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate cursor-pointer hover:text-[#0084ff] dark:hover:text-blue-400 block leading-snug"
                          >
                            {displayName}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.driveWebViewLink || item.driveFileId ? (
                              <a
                                href={item.driveWebViewLink || `https://drive.google.com/file/d/${item.driveFileId}/view`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                                title="View in Google Drive"
                              >
                                <Cloud className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">View in Drive</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSaveIndividualNoteToDrive(item)}
                                disabled={syncingNoteId === item.id}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
                                title="Save to Google Drive"
                              >
                                {syncingNoteId === item.id ? (
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
                                ) : (
                                  <Cloud className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span>Save to Drive</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3-Dots Menu Button */}
                      <div className="relative shrink-0" ref={isMenuOpen ? menuRef : null}>
                        <button
                          type="button"
                          onClick={() => setActiveMenuId(isMenuOpen ? null : item.id)}
                          className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-[#202433] text-slate-500 dark:text-zinc-400 flex items-center justify-center transition-colors cursor-pointer border-0 ring-0"
                          title="File Options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Popover Context Menu */}
                        {renderContextMenu(item, isPdf, isImg, isMenuOpen)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View Container with Static Home Screen Cards */
            <div className="space-y-2 w-full">
              {filteredNotes.map((item, index) => {
                const isPdf = isPdfFile(item);
                const isImg = !isPdf && isImageFile(item);

                const isMarkdownFile = !isImg && !isPdf && Boolean(
                  (item.fileName && /\.(md|markdown|txt)$/i.test(item.fileName)) ||
                  (!item.fileType && item.content && !item.fileUrl)
                );
                const isTable = isTableItem(item);

                const isMenuOpen = activeMenuId === item.id;
                const displayName = getCleanFileName(item.fileName, item.content);

                return (
                  <div
                    key={item.id ? `note-list-${item.id}-${index}` : `note-list-index-${index}`}
                    className="relative p-3 sm:p-3.5 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 group flex items-center justify-between gap-3"
                  >
                    {/* Left: File Icon & Name */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0">
                        {isPdf ? (
                          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                            <Paperclip className="w-4 h-4" />
                          </div>
                        ) : isImg ? (
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        ) : isTable ? (
                          <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                            <Table className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4
                          onClick={() => handleTriggerPreview(item)}
                          title={displayName}
                          className="text-xs sm:text-sm font-bold text-slate-800 dark:text-zinc-200 truncate cursor-pointer hover:text-[#0084ff] dark:hover:text-blue-400 leading-snug"
                        >
                          {displayName}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {isTable && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">
                              <Table className="w-2.5 h-2.5" />
                              Data Table
                            </span>
                          )}
                          {item.driveWebViewLink || item.driveFileId ? (
                            <a
                              href={item.driveWebViewLink || `https://drive.google.com/file/d/${item.driveFileId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                              title="View in Google Drive"
                            >
                              <Cloud className="w-2.5 h-2.5 shrink-0" />
                              <span>View in Drive</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSaveIndividualNoteToDrive(item)}
                              disabled={syncingNoteId === item.id}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
                              title="Save to Google Drive"
                            >
                              {syncingNoteId === item.id ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
                              ) : (
                                <Cloud className="w-2.5 h-2.5 shrink-0" />
                              )}
                              <span>Save to Drive</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: 3-Dots Action Button */}
                    <div className="relative shrink-0" ref={isMenuOpen ? menuRef : null}>
                      <button
                        type="button"
                        onClick={() => setActiveMenuId(isMenuOpen ? null : item.id)}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-[#202433] text-slate-500 dark:text-zinc-400 flex items-center justify-center transition-colors cursor-pointer border-0 ring-0"
                        title="File Options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Popover Context Menu */}
                      {renderContextMenu(item, isPdf, isImg, isMenuOpen)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* EDIT NOTE MODAL */}
      <AnimatePresence>
        {editingNoteTarget && (
          <motion.div
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 cursor-pointer overflow-y-auto"
            onClick={() => setEditingNoteTarget(null)}
          >
            <motion.div
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              className="bg-white dark:bg-[#21222e] rounded-3xl border-0 ring-0 shadow-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 text-slate-800 dark:text-zinc-100 cursor-default relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-500/15 text-[#0084ff] flex items-center justify-center font-bold shrink-0">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Edit Revision Note</h3>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                      Update title, category tag, LaTeX math explanation, or attachments
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingNoteTarget(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#202433] text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-colors border-0 ring-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scope & Test Association */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Associate with Test / Category:
                </label>
                <select
                  value={editTestId}
                  onChange={(e) => setEditTestId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202433] border-0 ring-0 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="all">General Repository (All Tests)</option>
                  {allTests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Title / Name:</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter note title..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202433] border-0 ring-0 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none"
                />
              </div>

              {/* Tag Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Classification Tag:</label>
                <div className="flex flex-wrap gap-2">
                  {(['general', 'formula', 'trick', 'mistake', 'table'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditTag(t)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ring-0 ${
                        editTag === t
                          ? t === 'formula'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : t === 'trick'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : t === 'mistake'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : t === 'table'
                            ? 'bg-cyan-600 text-white shadow-xs'
                            : 'bg-[#0084ff] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-[#202433] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#2b3042]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note Content Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Note Content (Markdown & LaTeX Math Supported):
                </label>
                <textarea
                  rows={5}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Enter study note, formula derivation, key shortcut, or concept summary..."
                  className="w-full p-3.5 rounded-2xl bg-slate-100 dark:bg-[#202433] text-xs font-medium text-slate-800 dark:text-zinc-200 border-0 ring-0 focus:outline-none resize-none placeholder-slate-400 dark:placeholder-zinc-500"
                />
              </div>

              {/* Attachment Management */}
              <div className="space-y-1.5">
                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={handleEditFileChange}
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  className="hidden"
                />

                 {editAttachedFile ? (
                  <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border-0 shadow-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {editAttachedFile.type === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-[#0084ff] shrink-0" />
                      ) : (
                        <Paperclip className="w-4 h-4 text-[#0084ff] shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                        {editAttachedFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditAttachedFile(null)}
                      className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                      title="Remove attachment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-2xl border-0 shadow-sm bg-slate-100/50 dark:bg-[#18181c] hover:bg-slate-200/60 dark:hover:bg-[#22222a] text-slate-600 dark:text-zinc-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-[#0084ff]" />
                    <span>Attach Diagram, Photo, or PDF Document</span>
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-0">
                <button
                  type="button"
                  onClick={() => setEditingNoteTarget(null)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#202433] transition-colors cursor-pointer border-0 ring-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedNote}
                  disabled={isSavingEdit || (!editContent.trim() && !editAttachedFile)}
                  className="px-5 py-2 rounded-full text-xs font-bold bg-[#0084ff] hover:bg-[#0073e6] active:scale-95 text-white disabled:opacity-40 transition-all border-0 ring-0 shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingEdit ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename File Modal */}
      <AnimatePresence>
        {renameTarget && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 cursor-pointer"
            onClick={() => setRenameTarget(null)}
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              className="bg-white dark:bg-[#21222e] rounded-3xl border-0 ring-0 p-6 max-w-md w-full space-y-4 shadow-2xl cursor-default relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-500/15 text-[#0084ff] flex items-center justify-center shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                  <span>Rename Item</span>
                </h3>
                <button
                  onClick={() => setRenameTarget(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#202433] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-colors border-0 ring-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-zinc-400 font-semibold block mb-1.5">
                  New Name / Title:
                </label>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                  }}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202433] border-0 ring-0 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                <button
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#202433] text-slate-700 dark:text-zinc-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-[#2b3042] transition-colors cursor-pointer border-0 ring-0 shadow-none"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRename}
                  className="px-5 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold transition-all border-0 ring-0 shadow-none cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Name</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item Full Details Modal */}
      <AnimatePresence>
        {detailsTarget && (
          <motion.div
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 cursor-pointer"
            onClick={() => setDetailsTarget(null)}
          >
            <motion.div
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              className="bg-white dark:bg-[#21222e] rounded-3xl border-0 ring-0 p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl relative cursor-default overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    Item Details
                  </h3>
                </div>
                <button
                  onClick={() => setDetailsTarget(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#202433] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-colors border-0 ring-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Info Grid */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                    Title / Name
                  </span>
                  <p className="font-bold text-slate-800 dark:text-zinc-100 text-sm break-words">
                    {getCleanFileName(detailsTarget.fileName, detailsTarget.content)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-[#202433]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                      Type
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-zinc-200">
                      {detailsTarget.fileType === 'pdf' ? 'PDF Document' : detailsTarget.fileType === 'image' ? 'Image Diagram' : 'Text Note'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                      Date Added
                    </span>
                    <span className="font-semibold font-mono text-slate-700 dark:text-zinc-200">
                      {new Date(detailsTarget.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {detailsTarget.questionNumber ? (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                        Question Ref
                      </span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        Question #{detailsTarget.questionNumber}
                      </span>
                    </div>
                  ) : null}

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                      Tag
                    </span>
                    <span className="font-semibold uppercase text-slate-700 dark:text-zinc-200">
                      {detailsTarget.tag}
                    </span>
                  </div>
                </div>

                {detailsTarget.content && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-1">
                      Note Content
                    </span>
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#202433] text-slate-700 dark:text-zinc-300 font-sans max-h-36 overflow-y-auto leading-relaxed">
                      <MathRenderer content={detailsTarget.content} tableActions="none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                <button
                  onClick={() => {
                    const isPdf = isPdfFile(detailsTarget);
                    const isImg = !isPdf && isImageFile(detailsTarget);
                    const resolvedType = isPdf ? 'pdf' : isImg ? 'image' : 'file';
                    const activeUrl = detailsTarget.fileUrl || (detailsTarget.driveFileId ? getDriveImageCandidates(detailsTarget.driveFileId)[0] : '');
                    onPreviewFile({
                      url: activeUrl,
                      name: getCleanFileName(detailsTarget.fileName, detailsTarget.content),
                      fileName: detailsTarget.fileName,
                      type: resolvedType,
                      fileType: resolvedType,
                      content: isImg ? '' : detailsTarget.content,
                      driveFileId: detailsTarget.driveFileId,
                      driveWebViewLink: detailsTarget.driveWebViewLink,
                      noteId: detailsTarget.id,
                      testTitle: testTitle || detailsTarget.testId,
                      questionNumber: detailsTarget.questionNumber,
                      tag: detailsTarget.tag,
                      createdAt: detailsTarget.createdAt,
                    });
                    setDetailsTarget(null);
                  }}
                  className="px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 border-0 ring-0 shadow-none"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Open Preview</span>
                </button>
                <button
                  onClick={() => setDetailsTarget(null)}
                  className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#202433] text-slate-700 dark:text-zinc-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-[#2b3042] transition-colors cursor-pointer border-0 ring-0 shadow-none"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
