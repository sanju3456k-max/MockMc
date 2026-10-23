import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import { 
  X, 
  Sigma, 
  Copy, 
  Check, 
  Plus, 
  Grid3X3, 
  Layers, 
  Sparkles, 
  BookOpen, 
  Zap,
  HelpCircle,
  Maximize2
} from 'lucide-react';

interface HtmlNotesMathEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertLatex: (latexCode: string, isBlockMode: boolean) => void;
  initialLatex?: string;
}

// Preset Formula Definitions
interface PresetFormula {
  id: string;
  name: string;
  category: string;
  latex: string;
  description: string;
}

const PRESET_FORMULAS: PresetFormula[] = [
  {
    id: 'quadratic',
    name: 'Quadratic Formula',
    category: 'Algebra',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    description: 'Solutions for quadratic equations ax² + bx + c = 0'
  },
  {
    id: 'euler-identity',
    name: "Euler's Identity",
    category: 'Analysis',
    latex: 'e^{i\\pi} + 1 = 0',
    description: 'Connects five fundamental mathematical constants'
  },
  {
    id: 'pythagoras',
    name: 'Pythagorean Theorem',
    category: 'Geometry',
    latex: 'a^2 + b^2 = c^2',
    description: 'Relationship among the three sides of a right triangle'
  },
  {
    id: 'gauss-law',
    name: "Gauss's Law for Electricity",
    category: 'Physics',
    latex: '\\oint \\mathbf{E} \\cdot d\\mathbf{A} = \\frac{Q_{\\text{enc}}}{\\varepsilon_0}',
    description: 'Relates electric field flux through a closed surface to charge'
  },
  {
    id: 'schrodinger',
    name: 'Time-Dependent Schrödinger Equation',
    category: 'Physics',
    latex: 'i\\hbar \\frac{\\partial}{\\partial t}\\Psi(\\mathbf{r},t) = \\hat{H}\\Psi(\\mathbf{r},t)',
    description: 'Fundamental equation of quantum mechanics'
  },
  {
    id: 'taylor',
    name: 'Taylor Series Expansion',
    category: 'Calculus',
    latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n',
    description: 'Representation of a function as an infinite sum of terms'
  },
  {
    id: 'fourier',
    name: 'Continuous Fourier Transform',
    category: 'Analysis',
    latex: '\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx',
    description: 'Decomposes a function of time into frequency components'
  },
  {
    id: 'gaussian',
    name: 'Normal (Gaussian) Distribution',
    category: 'Statistics',
    latex: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}',
    description: 'Probability density function of a continuous normal variable'
  },
  {
    id: 'einstein',
    name: 'Mass-Energy Equivalence',
    category: 'Physics',
    latex: 'E = mc^2',
    description: 'Relates energy and mass in special relativity'
  },
  {
    id: 'bayes',
    name: "Bayes' Theorem",
    category: 'Probability',
    latex: 'P(A|B) = \\frac{P(B|A)P(A)}{P(B)}',
    description: 'Probability of an event based on prior knowledge'
  },
  {
    id: 'derivative-limit',
    name: 'Limit Definition of Derivative',
    category: 'Calculus',
    latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
    description: 'Instantaneous rate of change of a function'
  },
  {
    id: 'cauchy-schwarz',
    name: 'Cauchy-Schwarz Inequality',
    category: 'Linear Algebra',
    latex: '\\left( \\sum_{i=1}^n a_i b_i \\right)^2 \\leq \\left( \\sum_{i=1}^n a_i^2 \\right) \\left( \\sum_{i=1}^n b_i^2 \\right)',
    description: 'Fundamental inequality in inner product spaces'
  },
  {
    id: 'water-reaction',
    name: 'Chemical Formation of Water',
    category: 'Chemistry',
    latex: '2\\text{H}_2 + \\text{O}_2 \\longrightarrow 2\\text{H}_2\\text{O}',
    description: 'Synthesis of water molecules'
  },
  {
    id: 'nuclear-decay',
    name: 'Uranium Alpha Decay',
    category: 'Chemistry / Nuclear',
    latex: '{}_{92}^{238}\\text{U} \\longrightarrow {}_{90}^{234}\\text{Th} + {}_2^4\\alpha',
    description: 'Nuclear radioactive alpha decay equation'
  }
];

// Symbol Palette Definitions
interface SymbolItem {
  code: string;
  label: string;
  display?: string;
}

const PALETTE_CATEGORIES: { id: string; name: string; items: SymbolItem[] }[] = [
  {
    id: 'basic',
    name: 'Basic & Operators',
    items: [
      { code: '+', label: 'Plus' },
      { code: '-', label: 'Minus' },
      { code: '\\times', label: 'Multiply' },
      { code: '\\div', label: 'Divide' },
      { code: '\\pm', label: 'Plus-Minus' },
      { code: '\\mp', label: 'Minus-Plus' },
      { code: '\\cdot', label: 'Dot Multiply' },
      { code: '\\ast', label: 'Asterisk' },
      { code: '\\circ', label: 'Composition' },
      { code: '\\neq', label: 'Not Equal' },
      { code: '\\leq', label: 'Less Equal' },
      { code: '\\geq', label: 'Greater Equal' },
      { code: '\\approx', label: 'Approx' },
      { code: '\\equiv', label: 'Equivalent' },
      { code: '\\propto', label: 'Proportional' },
      { code: '\\infty', label: 'Infinity' },
      { code: '\\angle', label: 'Angle' },
      { code: '\\parallel', label: 'Parallel' },
      { code: '\\perp', label: 'Perpendicular' }
    ]
  },
  {
    id: 'frac_roots',
    name: 'Fractions & Roots',
    items: [
      { code: '\\frac{a}{b}', label: 'Fraction' },
      { code: '\\dfrac{a}{b}', label: 'Display Fraction' },
      { code: 'x^{n}', label: 'Power / Superscript' },
      { code: 'x_{n}', label: 'Subscript' },
      { code: 'x_{n}^{m}', label: 'Sub/Superscript' },
      { code: '\\sqrt{x}', label: 'Square Root' },
      { code: '\\sqrt[n]{x}', label: 'Nth Root' },
      { code: '\\left( x \\right)', label: 'Parentheses' },
      { code: '\\left[ x \\right]', label: 'Brackets' },
      { code: '\\left\\{ x \\right\\}', label: 'Braces' },
      { code: '\\left| x \\right|', label: 'Absolute Value' },
      { code: '\\left\\| x \\right\\|', label: 'Norm' },
      { code: '\\overbrace{a + b}^{n}', label: 'Overbrace' },
      { code: '\\underbrace{a + b}_{n}', label: 'Underbrace' }
    ]
  },
  {
    id: 'calculus',
    name: 'Calculus & Limits',
    items: [
      { code: '\\frac{d}{dx}', label: 'Derivative' },
      { code: '\\frac{\\partial y}{\\partial x}', label: 'Partial Derivative' },
      { code: '\\int', label: 'Integral' },
      { code: '\\int_{a}^{b} x \\, dx', label: 'Definite Integral' },
      { code: '\\iint_{D}', label: 'Double Integral' },
      { code: '\\iiint_{V}', label: 'Triple Integral' },
      { code: '\\oint_{C}', label: 'Contour Integral' },
      { code: '\\sum_{i=1}^{n}', label: 'Summation' },
      { code: '\\prod_{i=1}^{n}', label: 'Product' },
      { code: '\\lim_{x \\to \\infty}', label: 'Limit Inf' },
      { code: '\\lim_{x \\to 0}', label: 'Limit Zero' },
      { code: '\\nabla', label: 'Nabla / Grad' },
      { code: '\\Delta', label: 'Delta' }
    ]
  },
  {
    id: 'greek_lower',
    name: 'Greek (Lower)',
    items: [
      { code: '\\alpha', label: 'alpha' },
      { code: '\\beta', label: 'beta' },
      { code: '\\gamma', label: 'gamma' },
      { code: '\\delta', label: 'delta' },
      { code: '\\epsilon', label: 'epsilon' },
      { code: '\\varepsilon', label: 'varepsilon' },
      { code: '\\zeta', label: 'zeta' },
      { code: '\\eta', label: 'eta' },
      { code: '\\theta', label: 'theta' },
      { code: '\\iota', label: 'iota' },
      { code: '\\kappa', label: 'kappa' },
      { code: '\\lambda', label: 'lambda' },
      { code: '\\mu', label: 'mu' },
      { code: '\\nu', label: 'nu' },
      { code: '\\xi', label: 'xi' },
      { code: '\\pi', label: 'pi' },
      { code: '\\rho', label: 'rho' },
      { code: '\\sigma', label: 'sigma' },
      { code: '\\tau', label: 'tau' },
      { code: '\\upsilon', label: 'upsilon' },
      { code: '\\phi', label: 'phi' },
      { code: '\\varphi', label: 'varphi' },
      { code: '\\chi', label: 'chi' },
      { code: '\\psi', label: 'psi' },
      { code: '\\omega', label: 'omega' }
    ]
  },
  {
    id: 'greek_upper',
    name: 'Greek (Upper)',
    items: [
      { code: '\\Gamma', label: 'Gamma' },
      { code: '\\Delta', label: 'Delta' },
      { code: '\\Theta', label: 'Theta' },
      { code: '\\Lambda', label: 'Lambda' },
      { code: '\\Xi', label: 'Xi' },
      { code: '\\Pi', label: 'Pi' },
      { code: '\\Sigma', label: 'Sigma' },
      { code: '\\Upsilon', label: 'Upsilon' },
      { code: '\\Phi', label: 'Phi' },
      { code: '\\Psi', label: 'Psi' },
      { code: '\\Omega', label: 'Omega' }
    ]
  },
  {
    id: 'vectors_accents',
    name: 'Vectors & Accents',
    items: [
      { code: '\\vec{v}', label: 'Vector' },
      { code: '\\hat{a}', label: 'Hat' },
      { code: '\\bar{x}', label: 'Bar' },
      { code: '\\dot{x}', label: 'Dot' },
      { code: '\\ddot{x}', label: 'Double Dot' },
      { code: '\\tilde{x}', label: 'Tilde' },
      { code: '\\mathbf{v}', label: 'Bold Vector' },
      { code: '\\overrightarrow{AB}', label: 'Ray Vector' },
      { code: '\\mathbf{A}^T', label: 'Transpose' },
      { code: '\\mathbf{A}^{-1}', label: 'Inverse' }
    ]
  },
  {
    id: 'trig',
    name: 'Trig & Functions',
    items: [
      { code: '\\sin(x)', label: 'Sin' },
      { code: '\\cos(x)', label: 'Cos' },
      { code: '\\tan(x)', label: 'Tan' },
      { code: '\\csc(x)', label: 'Csc' },
      { code: '\\sec(x)', label: 'Sec' },
      { code: '\\cot(x)', label: 'Cot' },
      { code: '\\arcsin(x)', label: 'Arcsin' },
      { code: '\\arccos(x)', label: 'Arccos' },
      { code: '\\arctan(x)', label: 'Arctan' },
      { code: '\\sinh(x)', label: 'Sinh' },
      { code: '\\cosh(x)', label: 'Cosh' },
      { code: '\\tanh(x)', label: 'Tanh' },
      { code: '\\ln(x)', label: 'Ln' },
      { code: '\\log_{b}(x)', label: 'Log' }
    ]
  },
  {
    id: 'sets_logic',
    name: 'Sets & Logic',
    items: [
      { code: '\\in', label: 'Element Of' },
      { code: '\\notin', label: 'Not Element' },
      { code: '\\subset', label: 'Subset' },
      { code: '\\subseteq', label: 'Subset Equal' },
      { code: '\\cap', label: 'Intersection' },
      { code: '\\cup', label: 'Union' },
      { code: '\\emptyset', label: 'Empty Set' },
      { code: '\\forall', label: 'For All' },
      { code: '\\exists', label: 'Exists' },
      { code: '\\implies', label: 'Implies' },
      { code: '\\iff', label: 'If and Only If' },
      { code: '\\land', label: 'And' },
      { code: '\\lor', label: 'Or' },
      { code: '\\neg', label: 'Not' },
      { code: '\\mathbb{R}', label: 'Real Numbers' },
      { code: '\\mathbb{N}', label: 'Natural Numbers' },
      { code: '\\mathbb{Z}', label: 'Integers' },
      { code: '\\mathbb{C}', label: 'Complex Numbers' }
    ]
  },
  {
    id: 'chem_physics',
    name: 'Chemistry & Physics',
    items: [
      { code: '\\text{H}_2\\text{O}', label: 'Water' },
      { code: '\\text{CO}_2', label: 'Carbon Dioxide' },
      { code: '\\text{C}_6\\text{H}_{12}\\text{O}_6', label: 'Glucose' },
      { code: '\\longrightarrow', label: 'Reaction Arrow' },
      { code: '\\rightleftharpoons', label: 'Equilibrium' },
      { code: '{}_{Z}^{A}\\text{X}', label: 'Isotope' },
      { code: '\\hbar', label: 'h-bar' },
      { code: '\\varepsilon_0', label: 'Epsilon 0' },
      { code: '\\mu_0', label: 'Mu 0' },
      { code: 'P(A|B)', label: 'Conditional Prob' },
      { code: '\\sigma^2', label: 'Variance' },
      { code: '\\bar{X}', label: 'Sample Mean' }
    ]
  }
];

export const HtmlNotesMathEditorModal: React.FC<HtmlNotesMathEditorModalProps> = ({
  isOpen,
  onClose,
  onInsertLatex,
  initialLatex = '\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)'
}) => {
  const [latexInput, setLatexInput] = useState<string>(initialLatex);
  const [isBlockMode, setIsBlockMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'palette' | 'matrices' | 'presets'>('palette');
  const [activePaletteCat, setActivePaletteCat] = useState<string>('basic');
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Matrix Generator State
  const [matrixRows, setMatrixRows] = useState<number>(3);
  const [matrixCols, setMatrixCols] = useState<number>(3);
  const [matrixBracket, setMatrixBracket] = useState<'p' | 'b' | 'v' | 'V' | 'plain'>('p');

  // Preview container ref
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update input when initialLatex changes
  useEffect(() => {
    if (isOpen) {
      setLatexInput(initialLatex || '\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)');
    }
  }, [isOpen, initialLatex]);

  // Render KaTeX live preview whenever latexInput or isBlockMode changes
  const mathModalMacros = {
    '\\ne': '\\mathrel{≠}',
    '\\neq': '\\mathrel{≠}',
    '\\nequal': '\\mathrel{≠}',
    '\\not=': '\\mathrel{≠}',
    '\\degree': '^\\circ',
    '\\deg': '^\\circ',
    '\\le': '\\leq',
    '\\ge': '\\geq',
    '\\cbrt': '\\sqrt[3]',
  };

  useEffect(() => {
    if (!previewRef.current || !isOpen) return;

    try {
      setRenderError(null);
      const html = katex.renderToString(latexInput || ' ', {
        displayMode: isBlockMode,
        throwOnError: true,
        output: 'html',
        macros: mathModalMacros
      });
      previewRef.current.innerHTML = html;
    } catch (err: any) {
      setRenderError(err?.message || 'Syntax error in LaTeX formula');
      // Fallback rendering with throwOnError: false
      try {
        const fallbackHtml = katex.renderToString(latexInput || ' ', {
          displayMode: isBlockMode,
          throwOnError: false,
          output: 'html',
          macros: mathModalMacros
        });
        previewRef.current.innerHTML = fallbackHtml;
      } catch {}
    }
  }, [latexInput, isBlockMode, isOpen]);

  if (!isOpen) return null;

  // Insert symbol at cursor in textarea
  const handleInsertSymbol = (code: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      const text = latexInput;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + code + after;
      setLatexInput(newText);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = start + code.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 50);
    } else {
      setLatexInput((prev) => prev + ' ' + code);
    }
  };

  // Generate Matrix LaTeX
  const handleGenerateMatrix = () => {
    const envMap = {
      p: 'pmatrix',
      b: 'bmatrix',
      v: 'vmatrix',
      V: 'Vmatrix',
      plain: 'matrix'
    };
    const env = envMap[matrixBracket];

    let matrixLatex = `\\begin{${env}}\n`;
    for (let r = 0; r < matrixRows; r++) {
      const rowVals: string[] = [];
      for (let c = 0; c < matrixCols; c++) {
        rowVals.push(`a_{${r + 1}${c + 1}}`);
      }
      matrixLatex += '  ' + rowVals.join(' & ');
      if (r < matrixRows - 1) matrixLatex += ' \\\\';
      matrixLatex += '\n';
    }
    matrixLatex += `\\end{${env}}`;

    handleInsertSymbol(matrixLatex);
  };

  // Generate Cases / System of Equations
  const handleGenerateCases = (numCases: number = 2) => {
    let casesLatex = '\\begin{cases}\n';
    for (let i = 0; i < numCases; i++) {
      casesLatex += `  2x_${i + 1} + 3y_${i + 1} = ${ (i + 1) * 5 } & \\text{if } x > 0`;
      if (i < numCases - 1) casesLatex += ' \\\\';
      casesLatex += '\n';
    }
    casesLatex += '\\end{cases}';
    handleInsertSymbol(casesLatex);
  };

  const handleCopyLatex = () => {
    const formatted = isBlockMode ? `$$\n${latexInput}\n$$` : `$${latexInput}$`;
    navigator.clipboard.writeText(formatted);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  const handleApplyInsert = () => {
    onInsertLatex(latexInput, isBlockMode);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl bg-white dark:bg-[#16181d] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150 text-slate-800 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <Sigma className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Math & KaTeX Formula Studio</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Professional LaTeX equation editor with live visual rendering</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border-0 bg-transparent"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin]">
          {/* LIVE PREVIEW BOX */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#0e0f12] p-4 flex flex-col items-center justify-center min-h-[100px] relative transition-all">
            <div className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span>Live Rendered Output</span>
            </div>

            <div 
              ref={previewRef} 
              className="mt-4 my-2 max-w-full overflow-x-auto text-lg sm:text-2xl text-center text-slate-900 dark:text-white py-2 px-4"
            />

            {renderError && (
              <div className="text-xs text-rose-500 dark:text-rose-400 font-mono mt-1 px-3 py-1 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900/50 max-w-full truncate">
                ⚠️ {renderError}
              </div>
            )}
          </div>

          {/* LATEX INPUT & MODE TOGGLE */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span>LaTeX Expression:</span>
              </label>

              {/* Mode Switcher: Inline ($) vs Block ($$) */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsBlockMode(true)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer border-0 transition-colors ${
                    isBlockMode ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                  title="Display Centered Block Math ($$ ... $$)"
                >
                  Block ($$)
                </button>
                <button
                  type="button"
                  onClick={() => setIsBlockMode(false)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer border-0 transition-colors ${
                    !isBlockMode ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                  title="Inline Text Math ($ ... $)"
                >
                  Inline ($)
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={latexInput}
              onChange={(e) => setLatexInput(e.target.value)}
              placeholder="Type LaTeX code here e.g. \int_0^1 x^2 \, dx"
              rows={3}
              className="w-full p-3 font-mono text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#121317] text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner resize-y"
            />
          </div>

          {/* PALETTE TABS & SELECTOR */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('palette')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0 transition-all ${
                  activeTab === 'palette'
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Sigma className="w-3.5 h-3.5" />
                <span>Symbol Palette</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('matrices')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0 transition-all ${
                  activeTab === 'matrices'
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Matrices & Systems</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('presets')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0 transition-all ${
                  activeTab === 'presets'
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Preset Gallery</span>
              </button>
            </div>

            {/* TAB 1: SYMBOL PALETTE */}
            {activeTab === 'palette' && (
              <div className="space-y-2">
                {/* Category sub-pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {PALETTE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActivePaletteCat(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer border-0 transition-colors ${
                        activePaletteCat === cat.id
                          ? 'bg-slate-900 text-white dark:bg-zinc-200 dark:text-zinc-900'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Symbols Grid */}
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-50 dark:bg-zinc-900/40 rounded-xl border border-slate-200 dark:border-zinc-800/80 [scrollbar-width:thin]">
                  {PALETTE_CATEGORIES.find((c) => c.id === activePaletteCat)?.items.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInsertSymbol(item.code)}
                      className="p-2 rounded-lg bg-white dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50 flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer group shadow-2xs"
                      title={`${item.label}: click to insert '${item.code}'`}
                    >
                      <span className="text-sm font-mono font-medium group-hover:scale-110 transition-transform">
                        {item.code}
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-zinc-400 truncate max-w-full">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: MATRICES & SYSTEMS BUILDER */}
            {activeTab === 'matrices' && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Rows */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 block mb-1">Rows:</label>
                    <select
                      value={matrixRows}
                      onChange={(e) => setMatrixRows(Number(e.target.value))}
                      className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-semibold"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n} rows</option>
                      ))}
                    </select>
                  </div>

                  {/* Columns */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 block mb-1">Columns:</label>
                    <select
                      value={matrixCols}
                      onChange={(e) => setMatrixCols(Number(e.target.value))}
                      className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-semibold"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n} columns</option>
                      ))}
                    </select>
                  </div>

                  {/* Bracket Style */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 block mb-1">Brackets:</label>
                    <select
                      value={matrixBracket}
                      onChange={(e) => setMatrixBracket(e.target.value as any)}
                      className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-semibold"
                    >
                      <option value="p">Parentheses ( )</option>
                      <option value="b">Square Brackets [ ]</option>
                      <option value="v">Determinant Vertical | |</option>
                      <option value="V">Double Vertical || ||</option>
                      <option value="plain">None</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleGenerateMatrix}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0"
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                    <span>Insert {matrixRows}x{matrixCols} Matrix</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGenerateCases(2)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Insert 2-Piece System</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGenerateCases(3)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Insert 3-Piece System</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: PRESET GALLERY */}
            {activeTab === 'presets' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 [scrollbar-width:thin]">
                {PRESET_FORMULAS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setLatexInput(preset.latex)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {preset.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mb-1">
                      {preset.description}
                    </p>
                    <div className="font-mono text-[11px] text-blue-700 dark:text-blue-300 truncate bg-white dark:bg-zinc-800 p-1 rounded border border-slate-200 dark:border-zinc-700">
                      {preset.latex}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleCopyLatex}
            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {copiedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied Code!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy LaTeX Code</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 cursor-pointer border-0"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApplyInsert}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer border-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Insert Into Note</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
