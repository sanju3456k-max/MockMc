import React, { useState } from 'react';
import { 
  X, 
  Maximize2, 
  Minimize2, 
  Download, 
  Sparkles, 
  Sliders, 
  Copy, 
  Check, 
  BrainCircuit, 
  BarChart3, 
  FileCode2, 
  Play, 
  Edit3, 
  FileText,
  ChevronRight,
  ChevronDown,
  Layers,
  Table as TableIcon,
  GitFork,
  Image as ImageIcon,
  Loader2,
  BookmarkPlus
} from 'lucide-react';
import { InteractiveGraphWidget, FunctionPlotConfig, ChartDataSeries } from './InteractiveGraphWidget';
import { InteractiveTableWidget, TableConfig } from './InteractiveTableWidget';
import { MindMapVisualizer, MindMapNode } from './MindMapVisualizer';
import { MathRenderer } from './MathRenderer';
import type { MathTest } from '../types';

export type { MindMapNode };

export interface CanvasArtifact {
  id: string;
  type: 'graph' | 'chart' | 'test' | 'markdown' | 'reasoning' | 'table' | 'mindmap' | 'image';
  title: string;
  description?: string;
  imageUrl?: string;
  functionConfig?: FunctionPlotConfig;
  chartConfig?: ChartDataSeries;
  tableConfig?: TableConfig;
  testData?: MathTest;
  content?: string;
  mindMapData?: MindMapNode;
  reasoningSteps?: Array<{ step: number; title: string; detail: string; latex?: string }>;
}

const NumberSystemWidget: React.FC = () => {
  const [selectedSet, setSelectedSet] = useState<'N' | 'W' | 'Z' | 'Q' | 'I' | 'R' | 'C'>('R');
  const [testInput, setTestInput] = useState<string>('-3.14');

  const setsInfo = {
    N: {
      name: 'Natural Numbers (Counting)',
      symbol: '\\mathbb{N}',
      def: '\\{ 1, 2, 3, 4, 5, \\dots \\}',
      desc: 'Positive counting integers starting from 1.',
      examples: ['1', '2', '7', '42', '100'],
      color: 'bg-emerald-500 text-white border-emerald-600',
    },
    W: {
      name: 'Whole Numbers',
      symbol: '\\mathbb{W}',
      def: '\\{ 0, 1, 2, 3, 4, \\dots \\}',
      desc: 'Natural numbers including zero (0).',
      examples: ['0', '1', '5', '12'],
      color: 'bg-teal-500 text-white border-teal-600',
    },
    Z: {
      name: 'Integers',
      symbol: '\\mathbb{Z}',
      def: '\\{ \\dots, -3, -2, -1, 0, 1, 2, 3, \\dots \\}',
      desc: 'Whole numbers and their negative opposites.',
      examples: ['-15', '-3', '0', '4', '99'],
      color: 'bg-blue-500 text-white border-blue-600',
    },
    Q: {
      name: 'Rational Numbers',
      symbol: '\\mathbb{Q}',
      def: '\\left\\{ \\frac{p}{q} \\mid p, q \\in \\mathbb{Z}, q \\neq 0 \\right\\}',
      desc: 'Numbers that can be written as fractions of two integers. Terminating or repeating decimals.',
      examples: ['\\frac{3}{4}', '-0.75', '0.333\\dots', '5', '0'],
      color: 'bg-indigo-500 text-white border-indigo-600',
    },
    I: {
      name: 'Irrational Numbers',
      symbol: '\\mathbb{I} = \\mathbb{R} \\setminus \\mathbb{Q}',
      def: '\\text{Non-repeating, non-terminating decimals}',
      desc: 'Real numbers that CANNOT be expressed as a simple fraction of two integers.',
      examples: ['\\pi \\approx 3.14159', 'e \\approx 2.71828', '\\sqrt{2}', '\\sqrt{3}'],
      color: 'bg-amber-500 text-white border-amber-600',
    },
    R: {
      name: 'Real Numbers',
      symbol: '\\mathbb{R}',
      def: '\\mathbb{Q} \\cup \\mathbb{I}',
      desc: 'All rational and irrational numbers. Corresponds to every point on the continuous number line.',
      examples: ['-7', '0', '\\frac{1}{2}', '\\pi', '\\sqrt{5}', '3.14'],
      color: 'bg-purple-600 text-white border-purple-700',
    },
    C: {
      name: 'Complex Numbers',
      symbol: '\\mathbb{C}',
      def: '\\{ a + bi \\mid a, b \\in \\mathbb{R}, i = \\sqrt{-1} \\}',
      desc: 'Includes real numbers ($b=0$) and imaginary numbers ($b \\neq 0$).',
      examples: ['3 + 4i', '2 - i', '5i', '\\sqrt{-9} = 3i', '7'],
      color: 'bg-pink-600 text-white border-pink-700',
    },
  };

  const current = setsInfo[selectedSet];

  const getBelongingSets = (valStr: string) => {
    const clean = valStr.trim().toLowerCase();
    if (!clean) return ['R', 'C'];

    if (clean.includes('i') || clean.includes('sqrt(-')) {
      return ['C'];
    }
    if (clean.includes('pi') || clean.includes('e') || clean.includes('sqrt') || clean === '√2' || clean === 'π') {
      return ['C', 'R', 'I'];
    }
    const num = parseFloat(clean);
    if (isNaN(num)) return ['C'];

    const sets: ('N' | 'W' | 'Z' | 'Q' | 'R' | 'C')[] = ['C', 'R'];
    if (Number.isInteger(num)) {
      sets.push('Q', 'Z');
      if (num >= 0) sets.push('W');
      if (num > 0) sets.push('N');
    } else {
      sets.push('Q');
    }
    return sets;
  };

  const activeSets = getBelongingSets(testInput);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#12141a] border border-[#e5e2db] dark:border-zinc-800/60 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
        <div>
          <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-500" />
            <span>Interactive Number Systems Hierarchy (Euler Venn Diagram)</span>
          </h5>
          <p className="text-[11px] text-slate-500">
            Click any set to explore its definition, mathematical symbol, properties, and examples.
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {(['N', 'W', 'Z', 'Q', 'I', 'R', 'C'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedSet(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono transition-all cursor-pointer ${
                selectedSet === key
                  ? setsInfo[key].color
                  : 'bg-slate-100 dark:bg-[#202330] text-slate-600 dark:text-zinc-300 hover:bg-slate-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Visual Nested Concentric Venn Diagram */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#21222e] border border-slate-200 dark:border-zinc-800/60 space-y-2">
        <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center justify-between">
          <MathRenderer content="Hierarchy: $\\mathbb{N} \\subset \\mathbb{W} \\subset \\mathbb{Z} \\subset \\mathbb{Q} \\subset \\mathbb{R} \\subset \\mathbb{C}$" />
          <span className="text-[10px] text-purple-500 font-semibold">Active: {current.name}</span>
        </div>

        {/* Outer Box: Complex Numbers */}
        <div
          onClick={() => setSelectedSet('C')}
          className={`p-3 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedSet === 'C' ? 'ring-2 ring-pink-500 border-pink-500 bg-pink-50/40 dark:bg-pink-950/20' : 'border-pink-200 dark:border-pink-900/40 bg-pink-50/10'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-pink-700 dark:text-pink-300 mb-2">
            <span>Complex Numbers (C)</span>
            <span className="text-[10px] font-mono">e.g. 3+4i, 5i</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div
              onClick={(e) => { e.stopPropagation(); setSelectedSet('R'); }}
              className={`md:col-span-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                selectedSet === 'R' ? 'ring-2 ring-purple-500 border-purple-500 bg-purple-50/50 dark:bg-purple-950/30' : 'border-purple-200 dark:border-purple-900/40 bg-purple-50/20'
              }`}
            >
              <div className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-2">
                Real Numbers (R)
              </div>

              <div
                onClick={(e) => { e.stopPropagation(); setSelectedSet('Q'); }}
                className={`p-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedSet === 'Q' ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/30'
                }`}
              >
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1.5">
                  Rational Numbers (Q) <span className="text-[10px] font-normal">(Fractions p/q, 0.75)</span>
                </div>

                <div
                  onClick={(e) => { e.stopPropagation(); setSelectedSet('Z'); }}
                  className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedSet === 'Z' ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-blue-200 dark:border-blue-900/40 bg-blue-50/30'
                  }`}
                >
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">
                    Integers (Z) <span className="text-[10px] font-normal">(-3, -2, -1, 0, 1, 2)</span>
                  </div>

                  <div
                    onClick={(e) => { e.stopPropagation(); setSelectedSet('W'); }}
                    className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedSet === 'W' ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50 dark:bg-teal-950/40' : 'border-teal-200 dark:border-teal-900/40 bg-teal-50/30'
                    }`}
                  >
                    <div className="text-xs font-bold text-teal-700 dark:text-teal-300 mb-1">
                      Whole Numbers (W) <span className="text-[10px] font-normal">(0, 1, 2, 3...)</span>
                    </div>

                    <div
                      onClick={(e) => { e.stopPropagation(); setSelectedSet('N'); }}
                      className={`p-2 rounded-lg border-2 text-center transition-all cursor-pointer ${
                        selectedSet === 'N' ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500 text-white font-extrabold' : 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-bold'
                      }`}
                    >
                      Natural Numbers (N) — Counting (1, 2, 3...)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={(e) => { e.stopPropagation(); setSelectedSet('I'); }}
              className={`p-3 rounded-xl border-2 flex flex-col justify-between transition-all cursor-pointer ${
                selectedSet === 'I' ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-950/40' : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  Irrational (I)
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Non-repeating decimals
                </p>
              </div>
              <div className="text-xs font-mono font-bold text-amber-800 dark:text-amber-200 space-y-0.5">
                <div>π ≈ 3.14159</div>
                <div>e ≈ 2.718</div>
                <div>√2 ≈ 1.414</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Set Detail Card */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a1c24] border border-slate-200 dark:border-zinc-800/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono ${current.color}`}>
              {selectedSet}
            </span>
            <span>{current.name}</span>
          </span>
          <MathRenderer content={current.symbol} className="text-sm font-bold" />
        </div>

        <div className="p-2.5 rounded-lg bg-white dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 text-xs font-mono">
          <span className="text-slate-400 font-sans mr-2 text-[10px]">Definition:</span>
          <MathRenderer content={current.def} />
        </div>

        <p className="text-xs text-slate-600 dark:text-zinc-300">
          {current.desc}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-bold text-slate-500">Examples:</span>
          {current.examples.map((ex, idx) => (
            <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-[#252834] text-slate-800 dark:text-zinc-200 text-xs font-mono">
              <MathRenderer content={ex} />
            </span>
          ))}
        </div>
      </div>

      {/* Quick Interactive Number Classifier */}
      <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#21222e] border border-slate-200 dark:border-zinc-800/60 space-y-2">
        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#0084ff]" />
          Instant Number Classifier Tool
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Type any number e.g. -5, 0.75, pi, sqrt(2), 3+4i"
            className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0084ff]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-500">Belongs to:</span>
          {activeSets.map((s) => (
            <span key={s} className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${setsInfo[s as keyof typeof setsInfo]?.color || 'bg-slate-300'}`}>
              {s} ({setsInfo[s as keyof typeof setsInfo]?.name.split(' ')[0]})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const PrimeNumbersSieveWidget: React.FC = () => {
  const [selectedNum, setSelectedNum] = useState<number | null>(2);
  const [filter, setFilter] = useState<'all' | 'primes' | 'composites'>('all');

  const primesSet = new Set([
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
  ]);

  const isPrime = (n: number) => primesSet.has(n);

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-[#12141a] border border-[#e5e2db] dark:border-zinc-800/60 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
        <div>
          <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span>Interactive Prime Numbers Sieve (1 to 100 Grid)</span>
          </h5>
          <p className="text-[11px] text-slate-500">
            25 Prime numbers found between 1 and 100. Click any number to inspect factors.
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(['all', 'primes', 'composites'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize transition-all cursor-pointer ${
                filter === mode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#202330] text-slate-600 dark:text-zinc-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 max-w-full overflow-x-auto">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
          const prime = isPrime(n);
          if (filter === 'primes' && !prime) return null;
          if (filter === 'composites' && (prime || n === 1)) return null;

          const isSelected = selectedNum === n;

          return (
            <button
              key={n}
              type="button"
              onClick={() => setSelectedNum(n)}
              className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                n === 1
                  ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 text-slate-400'
                  : prime
                  ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs hover:scale-105'
                  : 'bg-slate-50 dark:bg-[#1a1c24] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800/60 hover:bg-slate-100'
              } ${isSelected ? 'ring-2 ring-[#0084ff] ring-offset-1 scale-105 font-extrabold' : ''}`}
            >
              <span>{n}</span>
              {prime && <span className="text-[8px] opacity-80 font-mono">P</span>}
            </button>
          );
        })}
      </div>

      {selectedNum !== null && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a1c24] border border-slate-200 dark:border-zinc-800/60 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center ${isPrime(selectedNum) ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-[#222634] text-slate-800 dark:text-zinc-200'}`}>
              {selectedNum}
            </span>
            <div>
              <span className="font-bold text-slate-900 dark:text-zinc-100">
                {selectedNum === 1 ? '1 is Neither Prime nor Composite' : isPrime(selectedNum) ? `PRIME NUMBER` : `COMPOSITE NUMBER`}
              </span>
              <p className="text-[11px] text-slate-500">
                {selectedNum === 1 
                  ? '1 has only one positive factor.'
                  : isPrime(selectedNum)
                  ? `${selectedNum} has exactly 2 factors: 1 and ${selectedNum}.`
                  : `${selectedNum} has more than 2 factors.`}
              </p>
            </div>
          </div>
          {isPrime(selectedNum) && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-bold">
              Prime Factor: {selectedNum}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const MultiplicationTableWidget: React.FC = () => {
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-[#12141a] border border-[#e5e2db] dark:border-zinc-800/60 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2">
        <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
          <TableIcon className="w-4 h-4 text-indigo-500" />
          <span>Interactive Multiplication Table (1 to 10 Grid)</span>
        </h5>
        {hoverCell && (
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
            {hoverCell.r} × {hoverCell.c} = {hoverCell.r * hoverCell.c}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse text-xs font-mono">
          <thead>
            <tr>
              <th className="p-1.5 bg-slate-100 dark:bg-[#1f222e] text-slate-500 rounded-tl-lg">×</th>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((col) => (
                <th key={col} className={`p-1.5 font-bold ${hoverCell?.c === col ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-[#1f222e] text-slate-700 dark:text-zinc-300'}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, rIdx) => rIdx + 1).map((row) => (
              <tr key={row}>
                <td className={`p-1.5 font-bold ${hoverCell?.r === row ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-[#1f222e] text-slate-700 dark:text-zinc-300'}`}>
                  {row}
                </td>
                {Array.from({ length: 10 }, (_, cIdx) => cIdx + 1).map((col) => {
                  const val = row * col;
                  const isDiagonal = row === col;
                  const isHighlighted = hoverCell?.r === row || hoverCell?.c === col;

                  return (
                    <td
                      key={col}
                      onMouseEnter={() => setHoverCell({ r: row, c: col })}
                      onMouseLeave={() => setHoverCell(null)}
                      className={`p-1.5 border border-slate-100 dark:border-[#222533] cursor-pointer transition-colors ${
                        isDiagonal
                          ? 'bg-purple-500 text-white font-bold'
                          : isHighlighted
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold'
                          : 'hover:bg-slate-100 dark:hover:bg-[#202330] text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MindMapTreeItem: React.FC<{ node: MindMapNode; level?: number }> = ({ node, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasChildren = node.children && node.children.length > 0;

  const colorStyles = [
    'border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200',
    'border-l-4 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200',
    'border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200',
    'border-l-4 border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200',
  ];
  const colorClass = colorStyles[level % colorStyles.length];

  return (
    <div className="space-y-2 my-1">
      <div className={`p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800/60 shadow-2xs ${colorClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}
            <div className="min-w-0">
              <MathRenderer content={node.label} className="text-xs sm:text-sm font-bold truncate" />
            </div>
          </div>
          {node.latex && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/80 dark:bg-black/30 border border-slate-200 dark:border-zinc-700 font-semibold shrink-0">
              Math Formula
            </span>
          )}
        </div>

        {node.detail && (
          <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1.5 pl-6">
            {node.detail}
          </p>
        )}

        {node.latex && (
          <div className="mt-2 pl-6">
            <MathRenderer content={node.latex} className="p-2 rounded-xl bg-white/90 dark:bg-[#12141a] text-xs font-mono" />
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="pl-4 sm:pl-6 border-l-2 border-slate-200 dark:border-zinc-800 space-y-2">
          {node.children!.map((child) => (
            <MindMapTreeItem key={child.id || child.label} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

interface GeminiCanvasPanelProps {
  artifact?: CanvasArtifact | null;
  onClose: () => void;
  isDarkMode?: boolean;
  onStartTest?: (test: MathTest, mode: 'practice' | 'timed') => void;
  onEditTest?: (test: MathTest) => void;
  onSaveCreatedTest?: (test: MathTest) => void;
  onSendCanvasCommand?: (command: string) => void;
  isUpdating?: boolean;
}

export const GeminiCanvasPanel: React.FC<GeminiCanvasPanelProps> = ({
  artifact,
  onClose,
  isDarkMode = false,
  onStartTest,
  onEditTest,
  onSaveCreatedTest,
  onSendCanvasCommand,
  isUpdating = false,
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'doc' | 'test' | 'reasoning' | 'table' | 'mindmap' | 'image'>(
    artifact?.type === 'graph' || artifact?.type === 'chart' 
      ? 'visual' 
      : artifact?.type === 'table' || artifact?.tableConfig
      ? 'table'
      : artifact?.type === 'mindmap' || artifact?.mindMapData
      ? 'mindmap'
      : artifact?.type === 'image' || artifact?.imageUrl
      ? 'image'
      : artifact?.type === 'test' 
      ? 'test' 
      : artifact?.type === 'reasoning' 
      ? 'reasoning' 
      : 'doc'
  );
  
  const [copiedContent, setCopiedContent] = useState<boolean>(false);
  const [customFormula, setCustomFormula] = useState<string>(artifact?.functionConfig?.formula || 'x^2 - 4*x + 3');
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);
  const [editableContent, setEditableContent] = useState<string>(artifact?.content || '');
  const [canvasPrompt, setCanvasPrompt] = useState<string>('');
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState<boolean>(false);
  const [isSavedInCanvas, setIsSavedInCanvas] = useState<boolean>(false);

  React.useEffect(() => {
    setIsSavedInCanvas(false);
  }, [artifact?.testData?.id]);

  // Update editable content when artifact changes
  React.useEffect(() => {
    if (artifact?.content) {
      setEditableContent(artifact.content);
    }
    setIsSubmittingPrompt(false);
  }, [artifact]);

  React.useEffect(() => {
    if (!isUpdating) {
      setIsSubmittingPrompt(false);
    }
  }, [isUpdating]);

  const handleCopyText = () => {
    const textToCopy = isEditingNote ? editableContent : (artifact?.content || '');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const handleDownloadMarkdown = () => {
    const text = isEditingNote ? editableContent : (artifact?.content || '');
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${artifact?.title || 'canvas-note'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canvasPrompt.trim() || !onSendCanvasCommand || isUpdating || isSubmittingPrompt) return;
    setIsSubmittingPrompt(true);
    onSendCanvasCommand(canvasPrompt.trim());
    setCanvasPrompt('');
  };

  if (!artifact) {
    return (
      <div className="w-full h-full bg-[#f8fafc] dark:bg-[#12141d] border-l border-[#e5e2db] dark:border-zinc-800/60 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0084ff]/10 text-[#0084ff] flex items-center justify-center mb-3">
          <Sparkles className="w-7 h-7 animate-pulse" />
        </div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100">
          Gemini AI Canvas Workspace
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1">
          Select a graph, test, or step-by-step math derivation from the chat to inspect, edit, and export it side-by-side in Canvas Mode!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#f8fafc] dark:bg-[#12141d] border-l border-[#e5e2db] dark:border-zinc-800/60 flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Canvas Top Bar */}
      <div className="px-4 py-3 bg-[#e5e9f0] dark:bg-[#21222e] border-b border-[#e5e2db] dark:border-zinc-800/60 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#0084ff] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate flex items-center gap-2">
              {artifact.title || 'Canvas Workspace'}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0084ff]/15 text-[#0084ff] dark:text-[#339dff]">
                Canvas
              </span>
            </h3>
            {artifact.description && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                {artifact.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(artifact.content || editableContent) && (
            <>
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-[#282a39] text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
                title="Download Markdown Note"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-[#282a39] text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
                title="Copy Canvas Content"
              >
                {copiedContent ? <Check className="w-4 h-4 text-[#0084ff]" /> : <Copy className="w-4 h-4" />}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-[#282a39] text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Close Canvas Side-Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Sub-Tab Bar */}
      <div className="px-4 py-2 bg-[#f8fafc] dark:bg-[#14161d] border-b border-[#e5e2db] dark:border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('visual')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
            activeTab === 'visual'
              ? 'bg-[#0084ff] text-white shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Visual Plotter</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('doc')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
            activeTab === 'doc'
              ? 'bg-[#0084ff] text-white shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>LaTeX Notes</span>
        </button>

        {(artifact.mindMapData || artifact.type === 'mindmap') && (
          <button
            type="button"
            onClick={() => setActiveTab('mindmap')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'mindmap'
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
            }`}
          >
            <GitFork className="w-3.5 h-3.5 text-indigo-400" />
            <span>Mind Map</span>
          </button>
        )}

        {(artifact.imageUrl || artifact.type === 'image') && (
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'image'
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span>Image Canvas</span>
          </button>
        )}

        {(artifact.tableConfig || artifact.type === 'table') && (
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'table'
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Table Workspace</span>
          </button>
        )}

        {artifact.testData && (
          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'test'
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Assessment</span>
          </button>
        )}

        {artifact.reasoningSteps && artifact.reasoningSteps.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('reasoning')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'reasoning'
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-[#202330]'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reasoning Tree</span>
          </button>
        )}
      </div>

      {/* Canvas Workspace View Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {activeTab === 'mindmap' && (
          <MindMapVisualizer
            data={artifact.mindMapData}
            title={artifact.title || 'Interactive Mind Map & Concept Tree'}
            description={artifact.description || 'Full LaTeX concept breakdown with hierarchical node mapping'}
            isDarkMode={isDarkMode}
            onRequestAIExtension={(concept) => {
              if (onSendCanvasCommand) {
                onSendCanvasCommand(`Expand and deepen the mind map branch for: ${concept}`);
              }
            }}
          />
        )}

        {activeTab === 'visual' && (
          <div className="space-y-4">
            {/* Custom Formula Expression Builder */}
            <div className="p-4 rounded-[20px] bg-white dark:bg-[#1a1c24] border border-[#e5e2db] dark:border-zinc-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#0084ff]" />
                  Mathematical Function Plotter
                </label>
                <span className="text-[10px] text-slate-500 font-mono">f(x)</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={customFormula}
                  onChange={(e) => setCustomFormula(e.target.value)}
                  placeholder="e.g., sin(x) + cos(2*x)"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0084ff]"
                />
              </div>

              {/* Quick Formula Preset Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 self-center font-semibold">Presets:</span>
                {[
                  { label: 'Parabola', expr: 'x^2 - 4*x + 3' },
                  { label: 'Sine Wave', expr: 'sin(x)' },
                  { label: 'Cosine Wave', expr: 'cos(x)' },
                  { label: 'Cubic Curve', expr: 'x^3 - 3*x' },
                  { label: 'Exponential', expr: 'exp(-x)' }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCustomFormula(preset.expr)}
                    className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#252834] hover:bg-slate-200 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Graph Widget */}
            <InteractiveGraphWidget
              type={artifact.type === 'chart' ? 'chart' : 'function'}
              functionConfig={{
                ...artifact.functionConfig,
                formula: customFormula || artifact.functionConfig?.formula || 'x^2 - 4*x + 3',
                title: artifact.title
              }}
              chartConfig={artifact.chartConfig}
              isDarkMode={isDarkMode}
            />
          </div>
        )}

        {activeTab === 'doc' && (
          <div className="p-4 sm:p-5 rounded-[20px] bg-white dark:bg-[#1a1c24] border border-[#e5e2db] dark:border-zinc-800/60 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-[#0084ff]" />
                LaTeX Document & Notes
              </h4>
              <button
                type="button"
                onClick={() => setIsEditingNote((prev) => !prev)}
                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors"
              >
                <Edit3 className="w-3 h-3 text-[#0084ff]" />
                <span>{isEditingNote ? 'View Mode' : 'Edit Note'}</span>
              </button>
            </div>

            {isEditingNote ? (
              <textarea
                value={editableContent}
                onChange={(e) => setEditableContent(e.target.value)}
                rows={12}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0084ff] leading-relaxed resize-y"
                placeholder="Write or edit LaTeX note content..."
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm">
                <MathRenderer content={editableContent || artifact.content || 'No document content available.'} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'table' && (
          <div className="space-y-4">
            <InteractiveTableWidget
              tableConfig={artifact.tableConfig || {
                title: artifact.title || 'Interactive Table Workspace',
                description: artifact.description || 'Google Docs style formatted table',
                headers: ['Topic', 'Definition', 'Formula / Example', 'Notes'],
                rows: [
                  ['Matrix Inverse', 'Square matrix $A^{-1}$ such that $A A^{-1} = I$', '$A^{-1} = \\frac{1}{\\det(A)} \\adj(A)$', 'Requires $\\det(A) \\neq 0$'],
                  ['Definite Integral', 'Net signed area under curve $f(x)$', '$\\int_a^b f(x)dx = F(b) - F(a)$', 'Fundamental Theorem of Calculus'],
                  ['Taylor Series', 'Infinite sum representation of function', '$\\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n$', 'Expands $f(x)$ near point $x=a$']
                ]
              }}
              isDarkMode={isDarkMode}
              isEditable={true}
            />
          </div>
        )}

        {activeTab === 'test' && artifact.testData && (
          <div className="space-y-4">
            <div className="p-4 rounded-[20px] bg-white dark:bg-[#1a1c24] border border-[#e5e2db] dark:border-zinc-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {artifact.testData.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {artifact.testData.description}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#0084ff]/10 text-[#0084ff] text-xs font-bold shrink-0">
                  {artifact.testData.questions.length} Questions
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {onSaveCreatedTest && artifact.testData && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveCreatedTest(artifact.testData!);
                      setIsSavedInCanvas(true);
                    }}
                    disabled={isSavedInCanvas}
                    className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95 ${
                      isSavedInCanvas
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 cursor-default opacity-90'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isSavedInCanvas ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Saved to My Tests</span>
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Save Test</span>
                      </>
                    )}
                  </button>
                )}

                {onStartTest && (
                  <button
                    type="button"
                    onClick={() => onStartTest(artifact.testData!, 'practice')}
                    className="px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Test</span>
                  </button>
                )}

                {onEditTest && (
                  <button
                    type="button"
                    onClick={() => onEditTest(artifact.testData!)}
                    className="px-4 py-2 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    title="Edit in Studio with AI assistance"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    <span>Edit in Studio with AI</span>
                  </button>
                )}
              </div>
            </div>

            {/* Questions list */}
            <div className="space-y-3">
              {artifact.testData.questions.map((q, idx) => (
                <div
                  key={`canvas-test-q-${artifact.id || 'artifact'}-${q.id || 'q'}-${idx}`}
                  className="p-4 rounded-[20px] bg-[#f8fafc] dark:bg-[#21222e] border border-[#e2e8f0] dark:border-zinc-800/60 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#0084ff]">
                      Question {idx + 1} ({q.points} pt)
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {q.type}
                    </span>
                  </div>

                  <MathRenderer content={q.text} className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-zinc-100" />

                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-xl text-xs transition-all ${
                            opt === q.correctAnswer
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold ring-2 ring-emerald-500/80 shadow-sm shadow-emerald-500/10'
                              : 'bg-white dark:bg-[#1a1c24] text-slate-700 dark:text-zinc-300 ring-1 ring-slate-200/80 dark:ring-[#373a46] hover:ring-slate-300 dark:hover:ring-[#52576b]'
                          }`}
                        >
                          <MathRenderer content={opt} />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#1c1f2e] text-[11px] text-slate-600 dark:text-zinc-400 space-y-1 mt-2">
                      <span className="font-bold text-[#0084ff] flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Step-by-Step Explanation:
                      </span>
                      <MathRenderer content={q.explanation} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'reasoning' && artifact.reasoningSteps && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Gemini AI Deep Reasoning Tree breakdown of mathematical proof and logic steps.
              </span>
            </div>

            {artifact.reasoningSteps.map((st) => (
              <div
                key={st.step}
                className="p-4 rounded-[20px] bg-white dark:bg-[#1a1c24] border border-[#e5e2db] dark:border-zinc-800/60 space-y-2 shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#0084ff] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {st.step}
                  </span>
                  <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {st.title}
                  </h5>
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-400 pl-8">
                  {st.detail}
                </p>
                {st.latex && (
                  <div className="pl-8 pt-1">
                    <MathRenderer content={st.latex} className="p-2 rounded-xl bg-slate-50 dark:bg-[#14161d] text-xs font-mono" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canvas Inline AI Prompt Bar (Bottom Productivity Bar) */}
      {onSendCanvasCommand && (
        <form
          onSubmit={handleSendPrompt}
          className="p-3 bg-[#e5e9f0] dark:bg-[#21222e] border-t border-[#e5e2db] dark:border-zinc-800/60 shrink-0 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={canvasPrompt}
              onChange={(e) => setCanvasPrompt(e.target.value)}
              placeholder="Ask Gemini to update or refine this canvas..."
              className="w-full pl-3.5 pr-8 py-2 rounded-full bg-white dark:bg-[#12141a] border border-[#e5e2db] dark:border-zinc-800/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0084ff]"
            />
            <Sparkles className="w-3.5 h-3.5 text-amber-500 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>

          <button
            type="submit"
            disabled={!canvasPrompt.trim() || isUpdating || isSubmittingPrompt}
            className="px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center gap-1.5 shadow-2xs"
          >
            {(isUpdating || isSubmittingPrompt) ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Updating...</span>
              </>
            ) : (
              <span>Update</span>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
