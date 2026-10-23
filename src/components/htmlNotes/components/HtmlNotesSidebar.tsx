import React from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
  ListTree,
  Sliders,
  X,
  Search,
  Plus,
  FileCode,
  Trash2,
  ChevronRight,
  ChevronDown,
  BookMarked,
  History,
  Download
} from 'lucide-react';
import { type HtmlProject, type HtmlNoteItem } from '../../../lib/htmlNotesSync';
import { type DocumentHeading, type ViewMode } from '../types';

interface HtmlNotesSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  activeSidebarTab: 'files' | 'outline' | 'margins';
  setActiveSidebarTab: (tab: 'files' | 'outline' | 'margins') => void;
  searchFilter: string;
  setSearchFilter: (filter: string) => void;
  projects: HtmlProject[];
  activeProject: HtmlProject | undefined;
  activeProjectId: string;
  activeFileId: string;
  activeProjectFiles: HtmlNoteItem[];
  viewMode: ViewMode;
  onOpenFile: (projectId: string, file: HtmlNoteItem, mode: ViewMode) => void;
  onAddFileToProject: (projectId: string) => void;
  onDeleteFile: (e: React.MouseEvent, projectId: string, fileId: string) => void;
  onOpenVersionHistory?: () => void;
  onExportFullProject?: (projectId?: string) => void;
  // Outline
  headingsList: DocumentHeading[];
  onJumpToHeading: (headingText: string, headingIndex?: number) => void;
  onAddSampleHeading: () => void;
  activeHeadingText?: string;
  activeHeadingId?: string;
  activePage?: number;
  // Margins
  leftBindingGutterMm: number;
  setLeftBindingGutterMm: (val: number) => void;
  totalLeftMarginMm: number;
  sideMarginMm: number;
  setSideMarginMm: (val: number) => void;
  verticalMarginMm: number;
  setVerticalMarginMm: (val: number) => void;
  fontSizePx: number;
  setFontSizePx: (val: number) => void;
}

export const HtmlNotesSidebar: React.FC<HtmlNotesSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeSidebarTab,
  setActiveSidebarTab,
  searchFilter,
  setSearchFilter,
  projects,
  activeProject,
  activeProjectId,
  activeFileId,
  activeProjectFiles,
  viewMode,
  onOpenFile,
  onAddFileToProject,
  onDeleteFile,
  onOpenVersionHistory,
  onExportFullProject,
  headingsList,
  onJumpToHeading,
  onAddSampleHeading,
  activeHeadingText,
  activeHeadingId,
  activePage,
  leftBindingGutterMm,
  setLeftBindingGutterMm,
  totalLeftMarginMm,
  sideMarginMm,
  setSideMarginMm,
  verticalMarginMm,
  setVerticalMarginMm,
  fontSizePx,
  setFontSizePx
}) => {
  const [collapsedH2Ids, setCollapsedH2Ids] = React.useState<Set<string>>(new Set());
  const [outlineFilter, setOutlineFilter] = React.useState<string>('');

  const toggleH2Collapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedH2Ids(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <>
      {/* SLIM LEFT ACTIVITY RAIL (DESKTOP ONLY) */}
      <aside className="sidebar-rail">
        <div className="sidebar-rail-group">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="sidebar-rail-btn"
            title={isSidebarOpen ? "Close Sidebar Drawer" : "Open Sidebar Drawer"}
          >
            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              setActiveSidebarTab('files');
              setIsSidebarOpen(true);
            }}
            className={`sidebar-rail-btn ${isSidebarOpen && activeSidebarTab === 'files' ? 'active' : ''}`}
            title="Project Files & Search"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveSidebarTab('outline');
              setIsSidebarOpen(true);
            }}
            className={`sidebar-rail-btn ${isSidebarOpen && activeSidebarTab === 'outline' ? 'active' : ''}`}
            title="Document Headings Outline"
          >
            <ListTree className="w-4 h-4" />
          </button>
        </div>

        <div className="sidebar-rail-group">
          {onOpenVersionHistory && (
            <button
              onClick={onOpenVersionHistory}
              className="sidebar-rail-btn text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-blue-50 dark:hover:bg-blue-950/50"
              title="Last 2 Version Histories (Time, Date & Modification)"
            >
              <History className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              setActiveSidebarTab('margins');
              setIsSidebarOpen(true);
            }}
            className={`sidebar-rail-btn ${isSidebarOpen && activeSidebarTab === 'margins' ? 'active' : ''}`}
            title="Custom Margins & Left Binding Gutter"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* MOBILE BACKDROP OVERLAY WHEN DRAWER IS OPEN */}
      {isSidebarOpen && (
        <div 
          className="mobile-drawer-backdrop md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* EXPANDABLE SIDEBAR DRAWER */}
      {isSidebarOpen && (
        <aside className="sidebar-drawer mobile-sheet">
          <div className="sidebar-drawer-header !py-2 !px-2.5">
            {/* Segmented Tab Bar inside Drawer Header */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-zinc-800/80 rounded-full gap-0.5 w-full mr-2">
              <button
                onClick={() => setActiveSidebarTab('files')}
                className={`flex-1 text-[11px] font-bold py-1 px-2 rounded-full border-0 transition-all cursor-pointer text-center truncate ${
                  activeSidebarTab === 'files'
                    ? 'bg-white dark:bg-zinc-700 text-[#0b57d0] dark:text-[#a8c7fa] shadow-xs'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                Files
              </button>
              <button
                onClick={() => setActiveSidebarTab('outline')}
                className={`flex-1 text-[11px] font-bold py-1 px-2 rounded-full border-0 transition-all cursor-pointer text-center truncate ${
                  activeSidebarTab === 'outline'
                    ? 'bg-white dark:bg-zinc-700 text-[#0b57d0] dark:text-[#a8c7fa] shadow-xs'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                Outline {headingsList.length > 0 ? `(${headingsList.length})` : ''}
              </button>
              <button
                onClick={() => setActiveSidebarTab('margins')}
                className={`flex-1 text-[11px] font-bold py-1 px-2 rounded-full border-0 transition-all cursor-pointer text-center truncate ${
                  activeSidebarTab === 'margins'
                    ? 'bg-white dark:bg-zinc-700 text-[#0b57d0] dark:text-[#a8c7fa] shadow-xs'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                Margins
              </button>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center shrink-0 border-0 outline-none cursor-pointer transition-colors"
              title="Close Drawer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="sidebar-drawer-content !p-3 scrollbar-thin">
            {/* TAB 1: FILES LIST WITH INTEGRATED SEARCH BAR */}
            {activeSidebarTab === 'files' && (
              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search files in notes..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-full border-0 ring-1 ring-slate-200 dark:ring-zinc-800 text-xs bg-slate-50/70 dark:bg-zinc-800/50 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-slate-400 focus:ring-2 focus:ring-[#0b57d0] outline-none transition-all"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 border-0 bg-transparent cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate mr-1.5">
                    {activeProject?.name || 'Project'} ({activeProjectFiles.length})
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {onExportFullProject && (
                      <button
                        onClick={() => onExportFullProject(activeProjectId)}
                        className="w-7 h-7 rounded-full text-slate-500 hover:text-[#0b57d0] dark:text-zinc-400 dark:hover:text-[#a8c7fa] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors border-0 bg-transparent flex items-center justify-center cursor-pointer active:scale-90"
                        title="Download full project (.zip)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddFileToProject(activeProject?.id || activeProjectId)}
                      className="px-2.5 py-1 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-[10.5px] font-bold border-0 flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
                      title="Add new file to this project"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add File</span>
                    </button>
                  </div>
                </div>

                {searchFilter.trim() ? (
                  <div className="space-y-1.5">
                    {projects.flatMap(p => p.files.map(f => ({ ...f, projectId: p.id, projectName: p.name })))
                      .filter(f => (f.title || '').toLowerCase().includes(searchFilter.toLowerCase()) || (f.code || '').toLowerCase().includes(searchFilter.toLowerCase()))
                      .map(f => (
                        <div
                          key={f.id}
                          onClick={() => onOpenFile(f.projectId, f, 'preview')}
                          className="p-2.5 rounded-xl bg-white dark:bg-[#222631] ring-1 ring-slate-200/90 dark:ring-[#2f3542] text-xs cursor-pointer hover:ring-[#0b57d0]/60 transition-all space-y-0.5"
                        >
                          <div className="font-bold truncate text-[#1f1f1f] dark:text-[#e8eaed]">{f.title}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span>{f.projectName}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeProjectFiles.map((file) => {
                      const isActive = file.id === activeFileId;
                      return (
                        <div
                          key={file.id}
                          onClick={() => onOpenFile(activeProjectId, file, viewMode)}
                          className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between text-xs group ${
                            isActive
                              ? 'bg-[#0b57d0]/10 dark:bg-[#004a77]/40 ring-1 ring-[#0b57d0]/60 text-[#0b57d0] dark:text-[#a8c7fa] font-bold shadow-xs'
                              : 'bg-white dark:bg-[#222631] ring-1 ring-slate-200/80 dark:ring-[#2f3542] text-[#1f1f1f] dark:text-[#e8eaed] hover:ring-slate-300 dark:hover:ring-[#3c4252]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-1">
                            <FileCode className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#0b57d0] dark:text-[#a8c7fa]' : 'text-slate-400'}`} />
                            <span className="truncate font-medium">{file.title || 'Untitled'}</span>
                          </div>
                          {activeProjectFiles.length > 1 && (
                            <button
                              onClick={(e) => onDeleteFile(e, activeProjectId, file.id)}
                              className="w-6 h-6 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 flex items-center justify-center border-0 outline-none cursor-pointer transition-colors opacity-70 group-hover:opacity-100"
                              title="Delete file"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: OUTLINE HEADINGS */}
            {activeSidebarTab === 'outline' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-zinc-800/80">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Document Outline ({headingsList.length})
                  </span>
                  {activePage && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">
                      Active: Page {activePage}
                    </span>
                  )}
                </div>

                {headingsList.length > 3 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={outlineFilter}
                      onChange={(e) => setOutlineFilter(e.target.value)}
                      placeholder="Filter headings or page..."
                      className="w-full pl-7 pr-6 py-1 rounded-full border-0 ring-1 ring-slate-200 dark:ring-zinc-800 text-[11px] bg-slate-50 dark:bg-zinc-800/50 text-[#1f1f1f] dark:text-[#e3e3e3] outline-none"
                    />
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    {outlineFilter && (
                      <button
                        type="button"
                        onClick={() => setOutlineFilter('')}
                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 border-0 bg-transparent cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {headingsList.length === 0 ? (
                  <div className="py-6 px-3 text-center space-y-2 rounded-xl bg-slate-50 dark:bg-[#222631] border border-slate-200/80 dark:border-[#2f3542]">
                    <div className="w-9 h-9 rounded-full bg-white dark:bg-[#1b1e27] text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
                      <ListTree className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">
                      No headings found
                    </p>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">
                      Add &lt;h1&gt;, &lt;h2&gt;, or &lt;h3&gt; elements in your note to auto-generate page-mapped outline navigation.
                    </p>
                    <button
                      type="button"
                      onClick={onAddSampleHeading}
                      className="mt-1 px-3 py-1 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[10.5px] font-bold border-0 cursor-pointer shadow-xs active:scale-95"
                    >
                      + Add Sample Heading
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-0.5 scrollbar-thin">
                    {(() => {
                      let lastH2Id: string | null = null;
                      const filtered = outlineFilter.trim()
                        ? headingsList.filter(h => 
                            h.text.toLowerCase().includes(outlineFilter.toLowerCase()) || 
                            `page ${h.pageIndex}`.includes(outlineFilter.toLowerCase()) ||
                            `pg ${h.pageIndex}`.includes(outlineFilter.toLowerCase())
                          )
                        : headingsList;

                      return filtered.map((h) => {
                        const isActiveHeading = Boolean(
                          (activeHeadingText && activeHeadingText.toLowerCase() === h.text.toLowerCase()) ||
                          (activeHeadingId && activeHeadingId === h.id)
                        );

                        if (h.level === 2) {
                          lastH2Id = h.id;
                          const isCollapsed = collapsedH2Ids.has(h.id);
                          return (
                            <div
                              key={h.id}
                              className={`w-full text-left flex items-center justify-between gap-1.5 p-1.5 rounded-lg transition-all group ${
                                isActiveHeading 
                                  ? 'bg-purple-100/90 dark:bg-purple-900/40 ring-1 ring-purple-500/50 shadow-2xs' 
                                  : 'hover:bg-[#f0f4f9] dark:hover:bg-[#252934]'
                              }`}
                              style={{ paddingLeft: '8px' }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onJumpToHeading(h.text, h.index);
                                  setIsSidebarOpen(false);
                                }}
                                className="flex-1 flex items-center gap-1.5 border-0 bg-transparent text-left cursor-pointer p-0 min-w-0"
                              >
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                  H2
                                </span>
                                <span className="truncate text-xs font-bold text-purple-950 dark:text-purple-200">
                                  {h.text}
                                </span>
                              </button>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[9.5px] font-extrabold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
                                  Pg {h.pageIndex || 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => toggleH2Collapse(h.id, e)}
                                  title={isCollapsed ? 'Expand H3 Subheadings' : 'Collapse H3 Subheadings'}
                                  className="p-1 rounded-md hover:bg-purple-200/50 dark:hover:bg-purple-800/40 text-purple-600 dark:text-purple-300 border-0 cursor-pointer shrink-0 transition-colors"
                                >
                                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (h.level === 3) {
                          if (lastH2Id && collapsedH2Ids.has(lastH2Id)) {
                            return null;
                          }
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                onJumpToHeading(h.text, h.index);
                                setIsSidebarOpen(false);
                              }}
                              className={`w-full text-left flex items-center justify-between gap-1.5 p-1.5 rounded-lg border-0 transition-all cursor-pointer group ${
                                isActiveHeading
                                  ? 'bg-blue-100/90 dark:bg-blue-950/60 ring-1 ring-blue-500/50 shadow-2xs'
                                  : 'hover:bg-[#f0f4f9] dark:hover:bg-[#252934]'
                              }`}
                              style={{ paddingLeft: '20px' }}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight bg-slate-100 dark:bg-[#252934] text-slate-600 dark:text-zinc-300">
                                  H3
                                </span>
                                <span className="truncate text-xs font-medium text-slate-700 dark:text-zinc-300">
                                  {h.text}
                                </span>
                              </div>
                              <span className="text-[9.5px] font-semibold text-slate-400 dark:text-zinc-400 bg-slate-100/80 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded-md shrink-0">
                                Pg {h.pageIndex || 1}
                              </span>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => {
                              onJumpToHeading(h.text, h.index);
                              setIsSidebarOpen(false);
                            }}
                            className={`w-full text-left flex items-center justify-between gap-1.5 p-1.5 rounded-lg border-0 transition-all cursor-pointer group ${
                              isActiveHeading
                                ? 'bg-blue-100/90 dark:bg-blue-950/60 ring-1 ring-blue-500/50 shadow-2xs'
                                : 'hover:bg-[#f0f4f9] dark:hover:bg-[#252934]'
                            }`}
                            style={{
                              paddingLeft: `${Math.max(6, (h.level - 1) * 10 + 6)}px`
                            }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight ${
                                h.level === 1
                                  ? 'bg-blue-100 dark:bg-blue-900/40 text-[#0b57d0] dark:text-[#a8c7fa]'
                                  : 'bg-slate-100 dark:bg-[#252934] text-slate-600 dark:text-zinc-300'
                              }`}>
                                H{h.level}
                              </span>
                              <span className={`truncate text-xs ${h.level === 1 ? 'font-bold text-blue-950 dark:text-blue-100' : 'font-medium text-slate-700 dark:text-zinc-300'}`}>
                                {h.text}
                              </span>
                            </div>
                            <span className="text-[9.5px] font-semibold text-slate-400 dark:text-zinc-400 bg-slate-100/80 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded-md shrink-0">
                              Pg {h.pageIndex || 1}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: CUSTOM MARGIN DRAGGERS */}
            {activeSidebarTab === 'margins' && (
              <div className="space-y-4 text-xs">
                {/* Default Margins Info Banner */}
                <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700/60 space-y-1.5 text-[11px] leading-relaxed text-slate-700 dark:text-zinc-300">
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span>Preview Defaults: 0mm 0mm</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSideMarginMm(0);
                        setVerticalMarginMm(0);
                        setLeftBindingGutterMm(0);
                      }}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-extrabold cursor-pointer"
                    >
                      Reset (0mm)
                    </button>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-zinc-400">
                    Print defaults: <strong>13mm vertical</strong> & <strong>9mm side</strong> (applied automatically when printing).
                  </p>
                </div>

                {/* Left Binding Gutter Section */}
                <div className="p-3 rounded-2xl border-0 ring-1 ring-blue-200 dark:ring-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <BookMarked className="w-3.5 h-3.5" />
                      <span>Left Binding Gutter ({leftBindingGutterMm}mm)</span>
                    </span>
                    <span className="text-[10.5px] font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1b1e27] px-2 py-0.5 rounded-full shadow-2xs">
                      Total Left: {totalLeftMarginMm}mm
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    value={leftBindingGutterMm}
                    onChange={(e) => setLeftBindingGutterMm(parseInt(e.target.value, 10))}
                    className="w-full accent-[#0b57d0] cursor-pointer"
                  />

                  <button
                    onClick={() => setLeftBindingGutterMm(leftBindingGutterMm === 15 ? 0 : 15)}
                    className={`w-full text-[11px] font-bold py-1.5 px-3 rounded-xl border-0 transition-all cursor-pointer shadow-2xs ${
                      leftBindingGutterMm === 15 
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]' 
                        : 'bg-white dark:bg-[#222631] text-[#1f1f1f] dark:text-[#e8eaed] hover:bg-blue-100/60 dark:hover:bg-[#2c313f]'
                    }`}
                  >
                    📖 {leftBindingGutterMm === 15 ? 'Remove Gutter (0mm)' : '+15mm Booklet Gutter'}
                  </button>
                </div>

                {/* Side Margins */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#222631] ring-1 ring-slate-200/80 dark:ring-[#2f3542] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-300">
                      Side Margins
                    </span>
                    <span className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-[#f0f4f9] dark:bg-[#1b1e27] px-2 py-0.5 rounded-full">
                      {sideMarginMm}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={sideMarginMm}
                    onChange={(e) => setSideMarginMm(parseInt(e.target.value, 10))}
                    className="w-full accent-[#0b57d0] cursor-pointer"
                  />
                </div>

                {/* Vertical Margins */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#222631] ring-1 ring-slate-200/80 dark:ring-[#2f3542] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-300">
                      Vertical Margins
                    </span>
                    <span className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-[#f0f4f9] dark:bg-[#1b1e27] px-2 py-0.5 rounded-full">
                      {verticalMarginMm}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={verticalMarginMm}
                    onChange={(e) => setVerticalMarginMm(parseInt(e.target.value, 10))}
                    className="w-full accent-[#0b57d0] cursor-pointer"
                  />
                </div>

                {/* Font Size */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#222631] ring-1 ring-slate-200/80 dark:ring-[#2f3542] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-300">
                      Font Size
                    </span>
                    <span className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-[#f0f4f9] dark:bg-[#1b1e27] px-2 py-0.5 rounded-full">
                      {fontSizePx}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    value={fontSizePx}
                    onChange={(e) => setFontSizePx(parseInt(e.target.value, 10))}
                    className="w-full accent-[#0b57d0] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
