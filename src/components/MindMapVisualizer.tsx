import React, { useState, useRef, useMemo } from 'react';
import { 
  GitFork, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Maximize2, 
  Minimize2, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Layers, 
  Plus, 
  FileText,
  Eye,
  ListTree,
  Network,
  Tag,
  BookOpen
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { APP_STYLES } from './ui/AppStyles';

export interface MindMapNode {
  id: string;
  label: string;
  detail?: string;
  latex?: string;
  color?: string;
  tag?: string;
  children?: MindMapNode[];
}

interface MindMapVisualizerProps {
  data?: MindMapNode | null;
  title?: string;
  description?: string;
  isDarkMode?: boolean;
  onUpdateMindMap?: (updated: MindMapNode) => void;
  onRequestAIExtension?: (nodeLabel: string) => void;
}

interface FlatNodePosition {
  id: string;
  label: string;
  detail?: string;
  latex?: string;
  tag?: string;
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  level: number;
  node: MindMapNode;
}

export const MindMapVisualizer: React.FC<MindMapVisualizerProps> = ({
  data,
  title = 'Interactive Math Mind Map',
  description = 'Hierarchical concept breakdown with mathematical foundations and LaTeX proofs',
  isDarkMode = false,
  onUpdateMindMap,
  onRequestAIExtension,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'canvas'>('canvas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set(['root']));
  const [canvasZoom, setCanvasZoom] = useState<number>(1);
  const [canvasOffset, setCanvasOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Default fallback data if empty
  const rootData: MindMapNode = useMemo(() => {
    if (data && data.label) return data;
    return {
      id: 'root',
      label: 'Calculus & Mathematical Analysis',
      detail: 'The study of continuous change, encompassing derivatives, integrals, and limits.',
      tag: 'Core Discipline',
      children: [
        {
          id: 'limits',
          label: 'Limits & Continuity',
          detail: 'Foundation of analysis defining instantaneous rate of change and area limits.',
          latex: '\\lim_{x \\to c} f(x) = L \\iff \\forall \\varepsilon > 0, \\exists \\delta > 0 \\text{ s.t. } 0 < |x - c| < \\delta \\implies |f(x) - L| < \\varepsilon',
          tag: 'Foundation',
          children: [
            {
              id: 'epsilon-delta',
              label: '(\\varepsilon, \\delta)-Definition',
              detail: 'Rigorous analytical criterion for Cauchy limits.',
              latex: '|f(x) - L| < \\varepsilon',
            },
            {
              id: 'lhopital',
              label: "L'Hôpital's Rule",
              detail: 'Calculates indeterminate forms 0/0 and ∞/∞ by differentiating numerator and denominator.',
              latex: '\\lim_{x \\to c} \\frac{f(x)}{g(x)} = \\lim_{x \\to c} \\frac{f\'(x)}{g\'(x)}',
            }
          ]
        },
        {
          id: 'derivatives',
          label: 'Differential Calculus',
          detail: 'Rates of change, tangent slopes, optimization, and linear approximations.',
          latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
          tag: 'Rates of Change',
          children: [
            {
              id: 'chain-rule',
              label: 'Chain Rule',
              detail: 'Derivative of composite function composition.',
              latex: '\\frac{d}{dx}[f(g(x))] = f\'(g(x)) \\cdot g\'(x)',
            },
            {
              id: 'taylor-series',
              label: 'Taylor & Maclaurin Series',
              detail: 'Polynomial series approximation around expansion point $x=a$.',
              latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n',
            }
          ]
        },
        {
          id: 'integrals',
          label: 'Integral Calculus',
          detail: 'Accumulation of quantities, areas under curves, volumes of solids.',
          latex: '\\int_a^b f(x) \\, dx = F(b) - F(a)',
          tag: 'Accumulation',
          children: [
            {
              id: 'ftc',
              label: 'Fundamental Theorem of Calculus',
              detail: 'Unifies differentiation and integration as inverse operations.',
              latex: '\\frac{d}{dx} \\left[ \\int_a^x f(t) \\, dt \\right] = f(x)',
            },
            {
              id: 'integration-by-parts',
              label: 'Integration by Parts',
              detail: 'Transforms the integral of a product into a simpler integral.',
              latex: '\\int u \\, dv = uv - \\int v \\, du',
            }
          ]
        }
      ]
    };
  }, [data]);

  // Expand all or collapse all
  const handleToggleExpandAll = (expand: boolean) => {
    if (!expand) {
      setExpandedNodeIds(new Set(['root']));
    } else {
      const allIds = new Set<string>();
      const collect = (n: MindMapNode) => {
        allIds.add(n.id || n.label);
        n.children?.forEach(collect);
      };
      collect(rootData);
      setExpandedNodeIds(allIds);
    }
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Copy JSON
  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rootData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Layout calculation for Interactive SVG Canvas
  const layoutData = useMemo(() => {
    const nodes: FlatNodePosition[] = [];
    const nodeWidth = 240;
    const nodeHeight = 90;
    const horizontalGap = 160;
    const verticalGap = 30;

    let currentY = 50;

    const computePositions = (
      node: MindMapNode, 
      depth: number, 
      parentId: string | null
    ): number => {
      const nodeId = node.id || `node_${depth}_${Math.random().toString(36).substring(2, 6)}`;
      const x = 50 + depth * (nodeWidth + horizontalGap);

      let nodeY: number;

      if (!node.children || node.children.length === 0) {
        nodeY = currentY;
        currentY += nodeHeight + verticalGap;
      } else {
        const childYs: number[] = [];
        node.children.forEach((child) => {
          const cy = computePositions(child, depth + 1, nodeId);
          childYs.push(cy);
        });
        const minChildY = Math.min(...childYs);
        const maxChildY = Math.max(...childYs);
        nodeY = (minChildY + maxChildY) / 2;
      }

      nodes.push({
        id: nodeId,
        label: node.label,
        detail: node.detail,
        latex: node.latex,
        tag: node.tag,
        color: node.color,
        x,
        y: nodeY,
        width: nodeWidth,
        height: nodeHeight,
        parentId,
        level: depth,
        node,
      });

      return nodeY;
    };

    computePositions(rootData, 0, null);

    // Calculate canvas bounds
    const maxX = Math.max(...nodes.map((n) => n.x + n.width), 800) + 100;
    const maxY = Math.max(...nodes.map((n) => n.y + n.height), 600) + 100;

    return { nodes, width: maxX, height: maxY };
  }, [rootData]);

  // Mouse pan handlers for SVG Canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCanvasOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Color schemes for depth levels
  const levelThemes = [
    {
      bg: 'bg-blue-600 dark:bg-blue-600 text-white',
      border: 'border-blue-700 dark:border-blue-500',
      badge: 'bg-white/20 text-white',
      ring: 'ring-blue-400',
      line: '#2563eb'
    },
    {
      bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100',
      border: 'border-emerald-300 dark:border-emerald-700',
      badge: 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200',
      ring: 'ring-emerald-400',
      line: '#059669'
    },
    {
      bg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-100',
      border: 'border-indigo-300 dark:border-indigo-700',
      badge: 'bg-indigo-200 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200',
      ring: 'ring-indigo-400',
      line: '#6366f1'
    },
    {
      bg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-950 dark:text-purple-100',
      border: 'border-purple-300 dark:border-purple-700',
      badge: 'bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
      ring: 'ring-purple-400',
      line: '#9333ea'
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header & View Controls */}
      <div className={`${APP_STYLES.widgets.container} p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                {title}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                  Interactive Engine
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-black border border-slate-200 dark:border-[#1c1c1e]">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'canvas'
                  ? 'bg-white dark:bg-[#202330] text-[#0084ff] shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Canvas Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-white dark:bg-[#202330] text-[#0084ff] shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Tree View</span>
            </button>
          </div>

          {/* Copy JSON */}
          <button
            type="button"
            onClick={handleCopyJson}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1f222e] dark:hover:bg-[#282b3a] text-slate-700 dark:text-zinc-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200/80 dark:border-[#2a2d3d]"
            title="Copy Mind Map JSON"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Mind Map Viewer Area */}
      {viewMode === 'canvas' ? (
        <div className={`${APP_STYLES.widgets.container} relative overflow-hidden min-h-[500px] h-[550px] select-none bg-slate-50 dark:bg-black`}>
          {/* Canvas Floating Controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-white/90 dark:bg-black/95 backdrop-blur-md border border-slate-200/80 dark:border-[#2b2e3d] shadow-md">
            <button
              type="button"
              onClick={() => setCanvasZoom((z) => Math.min(z + 0.15, 2))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252836] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono font-bold px-1 text-slate-600 dark:text-zinc-400">
              {Math.round(canvasZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setCanvasZoom((z) => Math.max(z - 0.15, 0.4))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252836] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />
            <button
              type="button"
              onClick={() => {
                setCanvasZoom(1);
                setCanvasOffset({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252836] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Canvas Instruction Hint */}
          <div className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-full bg-white/80 dark:bg-black/85 backdrop-blur-md border border-slate-200 dark:border-[#2b2e3d] text-[11px] text-slate-600 dark:text-zinc-400 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span>Drag canvas to pan • Click node to inspect details</span>
          </div>

          {/* Pan/Zoom Interactive Workspace */}
          <div
            className="w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              style={{
                transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`,
                transformOrigin: '0 0',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                width: `${layoutData.width}px`,
                height: `${layoutData.height}px`,
                position: 'relative',
              }}
            >
              {/* SVG Connecting Branches */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ width: layoutData.width, height: layoutData.height }}
              >
                <defs>
                  <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
                  </linearGradient>
                </defs>

                {layoutData.nodes.map((n) => {
                  if (!n.parentId) return null;
                  const parent = layoutData.nodes.find((p) => p.id === n.parentId);
                  if (!parent) return null;

                  const startX = parent.x + parent.width;
                  const startY = parent.y + parent.height / 2;
                  const endX = n.x;
                  const endY = n.y + n.height / 2;

                  const dx = endX - startX;
                  const cp1x = startX + dx * 0.45;
                  const cp1y = startY;
                  const cp2x = startX + dx * 0.55;
                  const cp2y = endY;

                  const theme = levelThemes[n.level % levelThemes.length];

                  return (
                    <path
                      key={`path_${parent.id}_${n.id}`}
                      d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                      fill="none"
                      stroke={isDarkMode ? '#475569' : '#94a3b8'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="transition-all duration-300 hover:stroke-indigo-500"
                    />
                  );
                })}
              </svg>

              {/* Node Cards on Canvas */}
              {layoutData.nodes.map((n) => {
                const theme = levelThemes[n.level % levelThemes.length];
                const isSelected = selectedNode?.id === n.id;

                return (
                  <div
                    key={n.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(n.node);
                    }}
                    style={{
                      left: `${n.x}px`,
                      top: `${n.y}px`,
                      width: `${n.width}px`,
                    }}
                    className={`absolute p-3 rounded-2xl border ${theme.border} ${theme.bg} shadow-md transition-all duration-200 cursor-pointer hover:scale-103 hover:shadow-lg ${
                      isSelected ? `ring-3 ${theme.ring} scale-103 z-30` : 'z-10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <MathRenderer
                          content={n.label}
                          className="text-xs font-extrabold truncate leading-tight"
                        />
                      </div>
                      {n.tag && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${theme.badge}`}>
                          {n.tag}
                        </span>
                      )}
                    </div>

                    {n.detail && (
                      <p className="text-[10px] opacity-85 line-clamp-2 mt-1 leading-snug">
                        {n.detail}
                      </p>
                    )}

                    {n.latex && (
                      <div className="mt-1.5 p-1 rounded-lg bg-black/10 dark:bg-black/40 text-[10px] truncate">
                        <MathRenderer content={`$${n.latex.slice(0, 35)}...$`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Tree Breakdown View */
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-black border border-slate-200 dark:border-zinc-800/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search concepts or formulas..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0084ff]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={() => handleToggleExpandAll(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-[#1f222e] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => handleToggleExpandAll(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-[#1f222e] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Recursive Tree Structure */}
          <div className="space-y-3">
            <TreeItemView
              node={rootData}
              level={0}
              expandedIds={expandedNodeIds}
              onToggle={toggleNodeExpanded}
              onSelectNode={setSelectedNode}
              selectedNodeId={selectedNode?.id}
              searchQuery={searchQuery}
            />
          </div>
        </div>
      )}

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h4 className="text-sm font-extrabold text-indigo-950 dark:text-indigo-100">
                Concept Deep-Dive: <MathRenderer content={selectedNode.label} className="inline" />
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white px-2 py-1"
            >
              Close
            </button>
          </div>

          {selectedNode.detail && (
            <p className="text-xs text-indigo-900/90 dark:text-indigo-200 leading-relaxed">
              {selectedNode.detail}
            </p>
          )}

          {selectedNode.latex && (
            <div className="p-3 rounded-xl bg-white dark:bg-[#12141a] border border-indigo-200/80 dark:border-indigo-900/50 space-y-1">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                Mathematical Formula & Proof Statement:
              </span>
              <MathRenderer content={selectedNode.latex} className="text-xs font-mono" />
            </div>
          )}

          {onRequestAIExtension && (
            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onRequestAIExtension(selectedNode.label)}
                className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Expand concept with Gemini AI</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* Recursive Tree Item Renderer */
const TreeItemView: React.FC<{
  node: MindMapNode;
  level: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectNode: (node: MindMapNode) => void;
  selectedNodeId?: string;
  searchQuery?: string;
}> = ({ node, level, expandedIds, onToggle, onSelectNode, selectedNodeId, searchQuery = '' }) => {
  const nodeId = node.id || node.label;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(nodeId);
  const isSelected = selectedNodeId === nodeId;

  // Filter match check
  const isMatch = !searchQuery || 
    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (node.detail && node.detail.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (node.latex && node.latex.toLowerCase().includes(searchQuery.toLowerCase()));

  const colorStyles = [
    'border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-950 dark:text-blue-100',
    'border-l-4 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
    'border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-100',
    'border-l-4 border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 text-purple-950 dark:text-purple-100',
  ];
  const colorClass = colorStyles[level % colorStyles.length];

  if (!isMatch && hasChildren && !node.children?.some(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))) {
    return null;
  }

  return (
    <div className="space-y-2 my-1">
      <div 
        onClick={() => onSelectNode(node)}
        className={`p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800/60 shadow-2xs cursor-pointer transition-all hover:scale-[1.01] ${colorClass} ${
          isSelected ? 'ring-2 ring-indigo-500 shadow-md' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(nodeId);
                }}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}
            <div className="min-w-0">
              <MathRenderer content={node.label} className="text-xs sm:text-sm font-bold truncate" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {node.tag && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 dark:bg-black/40 border border-slate-200 dark:border-zinc-700">
                {node.tag}
              </span>
            )}
            {node.latex && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                Formula
              </span>
            )}
          </div>
        </div>

        {node.detail && (
          <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1.5 pl-6">
            {node.detail}
          </p>
        )}

        {node.latex && (
          <div className="mt-2 pl-6">
            <MathRenderer content={node.latex} className="p-2 rounded-xl bg-white/90 dark:bg-black text-xs font-mono" />
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="pl-4 sm:pl-6 border-l-2 border-slate-200 dark:border-zinc-800 space-y-2">
          {node.children!.map((child) => (
            <TreeItemView
              key={child.id || child.label}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
};
