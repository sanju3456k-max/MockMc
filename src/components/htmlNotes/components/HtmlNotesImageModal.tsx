import React, { useState } from 'react';
import { X, Upload, Link2, Sparkles, Image as ImageIcon, Check } from 'lucide-react';

interface HtmlNotesImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (
    dataUrl: string,
    fileName?: string,
    caption?: string,
    align?: 'center' | 'left' | 'right' | 'full'
  ) => void;
  onTriggerDeviceUpload: () => void;
}

export const HtmlNotesImageModal: React.FC<HtmlNotesImageModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
  onTriggerDeviceUpload
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [webUrl, setWebUrl] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [align, setAlign] = useState<'center' | 'left' | 'right' | 'full'>('center');
  const [urlError, setUrlError] = useState<string>('');

  if (!isOpen) return null;

  const handleInsertUrl = () => {
    const trimmed = webUrl.trim();
    if (!trimmed) {
      setUrlError('Please enter a valid image URL');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setUrlError('URL must begin with https:// or data:image/');
      return;
    }
    onInsertImage(trimmed, 'Web Diagram', caption, align);
    onClose();
  };

  const samplePresets = [
    {
      name: 'Cartesian Coordinate Plane',
      url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80',
      category: 'Math'
    },
    {
      name: 'DNA Double Helix',
      url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=800&q=80',
      category: 'Biology'
    },
    {
      name: 'Molecular Structure',
      url: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=800&q=80',
      category: 'Chemistry'
    },
    {
      name: 'Electromagnetic Wave',
      url: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=800&q=80',
      category: 'Physics'
    }
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#14161d] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-slate-800 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white m-0">Insert Image</h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 m-0">Place diagrams and charts into your notes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 border-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800 px-5 pt-2 gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer bg-transparent ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer bg-transparent ${
              activeTab === 'url'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Web Image URL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer bg-transparent ${
              activeTab === 'presets'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Study Diagrams
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {activeTab === 'upload' && (
            <div
              onClick={() => {
                onTriggerDeviceUpload();
                onClose();
              }}
              className="border-2 border-dashed border-blue-400/60 dark:border-blue-600/40 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all text-center"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-200 m-0">Click to upload from device</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 m-0 mt-1">or drag & drop anywhere onto the preview canvas</p>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">PNG, JPG, WebP, SVG, GIF up to 10MB</span>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Image Web URL
                </label>
                <input
                  type="text"
                  value={webUrl}
                  onChange={(e) => {
                    setWebUrl(e.target.value);
                    if (urlError) setUrlError('');
                  }}
                  placeholder="https://example.com/diagram.png"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-blue-500"
                />
                {urlError && <p className="text-[11px] text-red-500 mt-1 m-0">{urlError}</p>}
              </div>
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {samplePresets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    onInsertImage(preset.url, preset.name, caption, align);
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 hover:border-blue-300 dark:hover:border-blue-700 text-left transition-all flex flex-col gap-1.5 cursor-pointer group"
                >
                  <div className="w-full h-20 rounded-lg overflow-hidden bg-slate-200 dark:bg-zinc-800 relative">
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[9px] font-semibold text-white">
                      {preset.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 line-clamp-1">{preset.name}</span>
                </button>
              ))}
            </div>
          )}







          {/* Alignment & Text Flow Selection (Google Docs Style) */}
          <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Text Wrapping & Placement
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setAlign('center')}
                className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  align === 'center'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 bg-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => setAlign('left')}
                className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  align === 'left'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 bg-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                Wrap Left
              </button>
              <button
                type="button"
                onClick={() => setAlign('right')}
                className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  align === 'right'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 bg-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                Wrap Right
              </button>
              <button
                type="button"
                onClick={() => setAlign('full')}
                className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  align === 'full'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 bg-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                Full Width
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mt-2 mb-1">
                Optional Caption
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Figure 1.1: System Diagram"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-zinc-800 border-0 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          {activeTab === 'url' && (
            <button
              type="button"
              onClick={handleInsertUrl}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 border-0 shadow-xs cursor-pointer transition-colors"
            >
              Insert Image
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
