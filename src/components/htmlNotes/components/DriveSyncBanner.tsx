import React, { useState, useEffect } from 'react';
import { AlertCircle, CloudOff, RefreshCw, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import {
  subscribeDriveOutboxCount,
  processDriveOutbox,
  getDeviceId,
} from '../../../lib/driveOutbox';
import { isDriveConnected } from '../../../lib/htmlNotesCloudSyncEngine';
import { type HtmlNoteItem } from '../../../lib/htmlNotesSync';

interface DriveSyncBannerProps {
  activeNote?: HtmlNoteItem;
  isDriveConnected: boolean;
  onConnectDrive: () => void;
  showToast?: (msg: string) => void;
}

export const DriveSyncBanner: React.FC<DriveSyncBannerProps> = ({
  activeNote,
  isDriveConnected: propDriveConnected,
  onConnectDrive,
  showToast,
}) => {
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeDriveOutboxCount((count) => {
      setOutboxCount(count);
    });
    return unsub;
  }, []);

  // Reset dismissal if outbox count or drive connection status changes
  useEffect(() => {
    setIsDismissed(false);
  }, [outboxCount, propDriveConnected]);

  const handleManualFlush = async () => {
    if (isFlushing) return;
    setIsFlushing(true);
    try {
      const res = await processDriveOutbox();
      if (res.authRequired) {
        showToast?.('Please re-connect Google Drive to upload pending files');
        onConnectDrive();
      } else if (res.processed > 0) {
        showToast?.(`Uploaded ${res.processed} pending file(s) to Google Drive!`);
      } else if (res.failed > 0) {
        showToast?.(`Sync encountered issues for ${res.failed} file(s). Will retry automatically.`);
      }
    } finally {
      setIsFlushing(false);
    }
  };

  if (isDismissed) {
    return null;
  }

  const currentDeviceId = getDeviceId();
  const isPendingFromAnotherDevice = Boolean(
    activeNote &&
    activeNote.driveSyncStatus === 'pending_device_upload' &&
    activeNote.pendingDeviceId &&
    activeNote.pendingDeviceId !== currentDeviceId
  );

  // Scenario 1: Active file has pending changes on another device (Device B view)
  if (isPendingFromAnotherDevice) {
    return (
      <div className="bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="truncate">
            <strong className="font-semibold">Device Sync Notice:</strong> Newer changes were saved on another device and are awaiting Google Drive upload. Showing last synced version.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualFlush}
            disabled={isFlushing}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-medium rounded-md text-[11px] shrink-0 transition-all flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isFlushing ? 'animate-spin' : ''}`} />
            Check Drive
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
            title="Close notice"
            aria-label="Close notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Scenario 2: Drive disconnected or expired token with pending outbox items
  if (outboxCount > 0 && !propDriveConnected) {
    return (
      <div className="bg-orange-500/10 dark:bg-orange-500/15 border-b border-orange-500/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-orange-950 dark:text-orange-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
          <span className="truncate">
            <strong className="font-semibold">Google Drive session expired:</strong> {outboxCount} note edit{outboxCount > 1 ? 's' : ''} saved locally · Re-connect to sync code to Drive.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onConnectDrive}
            className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-semibold rounded-md text-[11px] transition-all flex items-center gap-1 cursor-pointer"
          >
            Re-connect Drive
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-orange-800 hover:text-orange-950 dark:text-orange-300 dark:hover:text-white hover:bg-orange-500/20 transition-colors cursor-pointer shrink-0"
            title="Close banner"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Scenario 3: Drive connected and pending outbox items are ready to flush
  if (outboxCount > 0 && propDriveConnected) {
    return (
      <div className="bg-blue-500/10 dark:bg-blue-500/15 border-b border-blue-500/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-blue-950 dark:text-blue-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 ${isFlushing ? 'animate-spin' : ''}`} />
          <span className="truncate">
            {outboxCount} file{outboxCount > 1 ? 's' : ''} queued for Google Drive cloud sync.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualFlush}
            disabled={isFlushing}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium rounded-md text-[11px] transition-all flex items-center gap-1 cursor-pointer shrink-0"
          >
            {isFlushing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-blue-800 hover:text-blue-950 dark:text-blue-300 dark:hover:text-white hover:bg-blue-500/20 transition-colors cursor-pointer shrink-0"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
