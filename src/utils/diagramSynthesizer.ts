/**
 * Scientific Procedural Exam Vector Graphics Synthesis Engine
 * Generates publication-grade, high-contrast, scalable SVG diagrams
 * specifically tailored to STEM exam questions, options, and derivations.
 */

export interface DiagramSynthesisOptions {
  promptText?: string;
  questionText?: string;
  options?: string[];
  explanation?: string;
  targetType?: 'question' | 'option' | 'explanation';
  optionIndex?: number;
  targetContextText?: string;
}

export function generateProceduralExamSvg(
  opts: DiagramSynthesisOptions | string,
  posQuestionText?: string,
  posOptions?: string[],
  posExplanation?: string,
  posTargetType?: 'question' | 'option' | 'explanation',
  posOptionIndex?: number,
  posTargetContextText?: string
): string {
  let promptText = '';
  let questionText = '';
  let options: string[] = [];
  let explanation = '';
  let targetType: 'question' | 'option' | 'explanation' = 'question';
  let optionIndex: number | undefined;
  let targetContextText = '';

  if (typeof opts === 'object' && opts !== null) {
    promptText = opts.promptText || '';
    questionText = opts.questionText || '';
    options = opts.options || [];
    explanation = opts.explanation || '';
    targetType = opts.targetType || 'question';
    optionIndex = opts.optionIndex;
    targetContextText = opts.targetContextText || '';
  } else {
    promptText = String(opts || '');
    questionText = posQuestionText || '';
    options = posOptions || [];
    explanation = posExplanation || '';
    targetType = posTargetType || 'question';
    optionIndex = posOptionIndex;
    targetContextText = posTargetContextText || '';
  }

  const combined = `${promptText} ${questionText} ${options.join(' ')} ${explanation} ${targetContextText}`.toLowerCase();
  const isExplanation = targetType === 'explanation';
  const isOption = targetType === 'option';

  // Extract dynamic values and labels from user text
  const angleMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees)/i);
  const angleValue = angleMatch ? angleMatch[1] : '30';

  const massMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:kg|g)\b/i);
  const massValue = massMatch ? `${massMatch[1]} kg` : 'm';

  const voltMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:v|volts|voltage)\b/i);
  const voltValue = voltMatch ? `${voltMatch[1]} V` : 'V';

  const ohmMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:Ω|ohm|ohms)\b/i);
  const ohmValue = ohmMatch ? `${ohmMatch[1]} Ω` : 'R';

  const forceMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:n|newton|newtons)\b/i);
  const forceValue = forceMatch ? `${forceMatch[1]} N` : 'F';

  // 1. Bar Chart / Histogram / Data & Statistics
  if (combined.includes('bar chart') || combined.includes('histogram') || combined.includes('frequency') || combined.includes('statistics') || combined.includes('mean') || combined.includes('median') || combined.includes('data distribution')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Frequency Distribution Analysis & Mean' : 'Frequency Histogram & Data Plot'}
  </text>
  <!-- Axes -->
  <line x1="60" y1="280" x2="450" y2="280" stroke="#0f172a" stroke-width="2.5" />
  <line x1="60" y1="280" x2="60" y2="70" stroke="#0f172a" stroke-width="2.5" />
  <text x="455" y="285" fill="#0f172a" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">Class</text>
  <text x="50" y="60" fill="#0f172a" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">Freq</text>
  <!-- Bars -->
  <rect x="80" y="180" width="50" height="100" fill="#3b82f6" fill-opacity="0.8" stroke="#1d4ed8" stroke-width="2" />
  <text x="105" y="170" fill="#1d4ed8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">10</text>
  <text x="105" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">0-10</text>

  <rect x="150" y="120" width="50" height="160" fill="#3b82f6" fill-opacity="0.8" stroke="#1d4ed8" stroke-width="2" />
  <text x="175" y="110" fill="#1d4ed8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">25</text>
  <text x="175" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">10-20</text>

  <rect x="220" y="90" width="50" height="190" fill="#2563eb" fill-opacity="0.9" stroke="#1e40af" stroke-width="2" />
  <text x="245" y="80" fill="#1e40af" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">35</text>
  <text x="245" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">20-30</text>

  <rect x="290" y="150" width="50" height="130" fill="#3b82f6" fill-opacity="0.8" stroke="#1d4ed8" stroke-width="2" />
  <text x="315" y="140" fill="#1d4ed8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">18</text>
  <text x="315" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">30-40</text>

  <rect x="360" y="210" width="50" height="70" fill="#3b82f6" fill-opacity="0.8" stroke="#1d4ed8" stroke-width="2" />
  <text x="385" y="200" fill="#1d4ed8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">8</text>
  <text x="385" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">40-50</text>
  ${isExplanation ? `<line x1="245" y1="70" x2="245" y2="280" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="4,2" />
  <text x="250" y="65" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">Mode / Mean Peak</text>` : ''}
</svg>`;
  }

  // 2. Wave Motion / Oscillations & Sine Wave
  if (combined.includes('wave') || combined.includes('sine') || combined.includes('cosine') || combined.includes('shm') || combined.includes('oscillation') || combined.includes('amplitude') || combined.includes('wavelength')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrB" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
  </defs>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Wave Equation: y(x,t) = A·sin(kx − ωt)' : 'Harmonic Wave Motion & Wavelength Setup'}
  </text>
  <!-- Axes -->
  <line x1="40" y1="180" x2="460" y2="180" stroke="#475569" stroke-width="2" />
  <line x1="70" y1="50" x2="70" y2="310" stroke="#475569" stroke-width="2" />
  <text x="465" y="185" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">x</text>
  <text x="65" y="40" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">y</text>

  <!-- Sine Wave Path -->
  <path d="M 70 180 Q 120 70 170 180 T 270 180 T 370 180 T 450 180" fill="none" stroke="#2563eb" stroke-width="3.5" />

  <!-- Amplitude Indicator -->
  <line x1="120" y1="180" x2="120" y2="70" stroke="#ef4444" stroke-width="2" stroke-dasharray="3,2" />
  <text x="130" y="130" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">Amplitude (A)</text>

  <!-- Wavelength Indicator -->
  <line x1="70" y1="210" x2="270" y2="210" stroke="#059669" stroke-width="2" marker-end="url(#arrB)" />
  <text x="170" y="230" fill="#059669" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Wavelength (λ)</text>
</svg>`;
  }

  // 3. Chemistry / Molecules & Benzene Ring
  if (combined.includes('benzene') || combined.includes('chemistry') || combined.includes('molecule') || combined.includes('organic') || combined.includes('bond') || combined.includes('atom') || combined.includes('reaction')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Aromatic Ring Delocalization & Bond Order' : 'Chemical Molecular Structure (Benzene Core)'}
  </text>
  <!-- Hexagon Outer -->
  <polygon points="250,70 330,115 330,205 250,250 170,205 170,115" fill="#f8fafc" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" />
  <!-- Inner Delocalized Circle -->
  <circle cx="250" cy="160" r="55" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="6,3" />
  <!-- Double bond accents -->
  <line x1="242" y1="88" x2="312" y2="128" stroke="#0f172a" stroke-width="2" />
  <line x1="318" y1="132" x2="318" y2="192" stroke="#0f172a" stroke-width="2" />
  <line x1="242" y1="232" x2="182" y2="198" stroke="#0f172a" stroke-width="2" />
  <text x="250" y="165" fill="#2563eb" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">C₆H₆</text>
  <text x="250" y="295" fill="#475569" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Resonance Hybrid: sp² Hybridization & 6π Electrons' : 'Aromatic Benzene Ring Architecture'}
  </text>
</svg>`;
  }

  // 4. Matrix & Determinants
  if (combined.includes('matrix') || combined.includes('determinant') || combined.includes('bmatrix') || combined.includes('pmatrix') || combined.includes('eigen')) {
    const is3x3 = combined.includes('3x3') || combined.includes('3 by 3') || combined.includes('order 3');
    if (is3x3) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">Matrix Representation (3×3)</text>
  <path d="M 140 65 L 120 65 L 120 275 L 140 275" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round" />
  <path d="M 360 65 L 380 65 L 380 275 L 360 275" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round" />
  <text x="165" y="115" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₁₁</text>
  <text x="250" y="115" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₁₂</text>
  <text x="335" y="115" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₁₃</text>
  <text x="165" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₂₁</text>
  <text x="250" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₂₂</text>
  <text x="335" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₂₃</text>
  <text x="165" y="245" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₃₁</text>
  <text x="250" y="245" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₃₂</text>
  <text x="335" y="245" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">a₃₃</text>
  ${isExplanation 
    ? `<text x="250" y="315" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">det(A) = a₁₁(a₂₂a₃₃ − a₂₃a₃₂) − a₁₂(a₂₁a₃₃ − a₂₃a₃₁) + a₁₃(a₂₁a₃₂ − a₂₂a₃₁)</text>`
    : `<text x="250" y="315" fill="#475569" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Matrix A of dimension 3 × 3</text>`
  }
</svg>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrowBlue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
    <marker id="arrowRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
    </marker>
  </defs>
  <text x="250" y="42" fill="#0f172a" font-family="system-ui, sans-serif" font-size="17" font-weight="bold" text-anchor="middle">${isExplanation ? 'Matrix Determinant Expansion' : 'Matrix Structure (2×2)'}</text>
  <path d="M 160 80 L 135 80 L 135 250 L 160 250" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
  <path d="M 340 80 L 365 80 L 365 250 L 340 250" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
  <text x="185" y="140" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">a<tspan font-size="16" dy="5">11</tspan></text>
  <text x="315" y="140" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">a<tspan font-size="16" dy="5">12</tspan></text>
  <text x="185" y="220" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">a<tspan font-size="16" dy="5">21</tspan></text>
  <text x="315" y="220" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">a<tspan font-size="16" dy="5">22</tspan></text>
  ${isExplanation ? `
  <line x1="175" y1="120" x2="325" y2="225" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="6,3" marker-end="url(#arrowBlue)" />
  <text x="330" y="260" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">(+) a₁₁·a₂₂</text>
  <line x1="325" y1="120" x2="175" y2="225" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="6,3" marker-end="url(#arrowRed)" />
  <text x="100" y="260" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">(-) a₁₂·a₂₁</text>
  <rect x="100" y="290" width="300" height="38" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="250" y="315" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">det(A) = (a₁₁·a₂₂) − (a₁₂·a₂₁)</text>
  ` : `
  <text x="250" y="300" fill="#475569" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Matrix A = [a_ij] (Order 2 × 2)</text>
  `}
</svg>`;
  }

  // 5. Geometry: Triangle / Trigonometry
  if (combined.includes('triangle') || combined.includes('hypotenuse') || combined.includes('pythagor') || combined.includes('sin') || combined.includes('cos') || combined.includes('tan') || combined.includes('trigonometry') || combined.includes('angle of elevation')) {
    const angleLabel = angleValue ? `${angleValue}°` : 'θ';
    const oppLabel = isExplanation ? 'Opposite (a)' : (combined.includes('height') ? 'h' : 'a');
    const adjLabel = isExplanation ? 'Adjacent Base (b)' : 'b';
    const hypLabel = isExplanation ? 'Hypotenuse (c = √(a²+b²))' : (isOption ? 'c' : '?');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <polygon points="100,265 410,265 100,75" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
  <rect x="100" y="240" width="25" height="25" fill="none" stroke="#0f172a" stroke-width="1.5" />
  <path d="M 360,265 A 50,50 0 0,0 348,225" fill="none" stroke="#2563eb" stroke-width="2.5" />
  <text x="325" y="252" fill="#2563eb" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">${angleLabel}</text>
  <circle cx="100" cy="75" r="4.5" fill="#0f172a" />
  <circle cx="100" cy="265" r="4.5" fill="#0f172a" />
  <circle cx="410" cy="265" r="4.5" fill="#0f172a" />
  <text x="90" y="65" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">A</text>
  <text x="75" y="280" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">B (90°)</text>
  <text x="425" y="280" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">C</text>
  <text x="250" y="295" fill="#334155" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">${adjLabel}</text>
  <text x="40" y="170" fill="#334155" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${oppLabel}</text>
  <text x="275" y="155" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">${hypLabel}</text>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Trigonometric Relations: sin(θ) = a/c,  cos(θ) = b/c,  tan(θ) = a/b' : 'Right-Angled Triangle Setup (∠B = 90°)'}
  </text>
</svg>`;
  }

  // 6. Geometry: Circle, Radius, Chord, Tangent, Secant
  if (combined.includes('circle') || combined.includes('radius') || combined.includes('tangent') || combined.includes('chord') || combined.includes('secant') || combined.includes('diameter')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <circle cx="230" cy="175" r="110" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
  <circle cx="230" cy="175" r="5" fill="#0f172a" />
  <text x="240" y="170" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">O (Center)</text>
  <line x1="230" y1="175" x2="340" y2="175" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="4" />
  <text x="280" y="165" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">Radius r</text>
  <line x1="340" y1="35" x2="340" y2="315" stroke="#ef4444" stroke-width="2.5" />
  <circle cx="340" cy="175" r="5" fill="#ef4444" />
  <text x="355" y="90" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Tangent Line (L)</text>
  <text x="355" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">P (Point of Contact)</text>
  <rect x="315" y="150" width="25" height="25" fill="none" stroke="#2563eb" stroke-width="1.5" />
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Theorem: Radius is perpendicular to tangent at point of contact (OP ⊥ L)' : 'Circle Geometry &amp; Tangent Configuration'}
  </text>
</svg>`;
  }

  // 7. Physics: Mechanics & Incline Plane / Free Body Diagram
  if (combined.includes('incline') || combined.includes('friction') || combined.includes('gravity') || combined.includes('force') || combined.includes('newton') || combined.includes('acceleration') || combined.includes('pulley') || combined.includes('mass')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
    </marker>
    <marker id="arrBlue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
    <marker id="arrGreen" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669" />
    </marker>
  </defs>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Resolved Force Components on Inclined Plane' : 'Inclined Plane Mechanics Setup'}
  </text>
  <polygon points="60,280 440,280 440,110" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
  <rect x="250" y="145" width="70" height="50" rx="3" transform="rotate(-24 285 170)" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" />
  <text x="280" y="175" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${massValue}</text>
  <circle cx="285" cy="170" r="4" fill="#0f172a" />
  <line x1="285" y1="170" x2="285" y2="255" stroke="#ef4444" stroke-width="2.5" marker-end="url(#arrRed)" />
  <text x="295" y="248" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">F_g = mg</text>
  <line x1="285" y1="170" x2="255" y2="95" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrBlue)" />
  <text x="230" y="90" fill="#2563eb" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Normal Force (N)</text>
  <line x1="285" y1="170" x2="345" y2="145" stroke="#059669" stroke-width="2.5" marker-end="url(#arrGreen)" />
  <text x="355" y="145" fill="#059669" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Friction (f)</text>
  <path d="M 120,280 A 60,60 0 0,0 114,255" fill="none" stroke="#0f172a" stroke-width="1.5" />
  <text x="135" y="272" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${angleValue}°</text>
  ${isExplanation ? `<text x="250" y="325" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">N = mg·cos(${angleValue}°),  a = g(sin(${angleValue}°) − μ·cos(${angleValue}°))</text>` : ''}
</svg>`;
  }

  // 8. Electric Circuits & Current
  if (combined.includes('circuit') || combined.includes('resistor') || combined.includes('voltage') || combined.includes('current') || combined.includes('capacitor') || combined.includes('battery') || combined.includes('ohm') || combined.includes('kirchhoff')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrCur" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
  </defs>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Circuit Analysis: Ohm’s Law &amp; Current Flow' : 'Electric Circuit Diagram'}
  </text>
  <line x1="80" y1="90" x2="200" y2="90" stroke="#0f172a" stroke-width="2.5" />
  <!-- Resistor Zig Zag -->
  <path d="M 200 90 L 210 75 L 230 105 L 250 75 L 270 105 L 290 75 L 300 90" fill="none" stroke="#2563eb" stroke-width="3" />
  <text x="250" y="65" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Resistor R = ${ohmValue}</text>
  <line x1="300" y1="90" x2="420" y2="90" stroke="#0f172a" stroke-width="2.5" />
  <line x1="420" y1="90" x2="420" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <line x1="420" y1="260" x2="270" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <!-- DC Source / Battery -->
  <line x1="270" y1="245" x2="270" y2="275" stroke="#ef4444" stroke-width="4" />
  <line x1="250" y1="252" x2="250" y2="268" stroke="#0f172a" stroke-width="3" />
  <text x="278" y="240" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">+</text>
  <text x="240" y="240" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">-</text>
  <text x="260" y="305" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Voltage Source (${voltValue})</text>
  <line x1="250" y1="260" x2="80" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <line x1="80" y1="260" x2="80" y2="90" stroke="#0f172a" stroke-width="2.5" />
  <!-- Current Flow Indicator -->
  <line x1="110" y1="70" x2="160" y2="70" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrCur)" />
  <text x="135" y="60" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">${isExplanation ? 'I = V / R' : 'Current I (?)'}</text>
</svg>`;
  }

  // 9. Probability, Sets & Venn Diagram
  if (combined.includes('venn') || combined.includes('set') || combined.includes('probability') || combined.includes('union') || combined.includes('intersection')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <rect x="50" y="40" width="400" height="260" rx="12" fill="#f8fafc" stroke="#475569" stroke-width="2" />
  <text x="75" y="70" fill="#475569" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">Universal Set (U)</text>
  <circle cx="205" cy="175" r="90" fill="#3b82f6" fill-opacity="${isExplanation ? '0.35' : '0.2'}" stroke="#2563eb" stroke-width="2.5" />
  <circle cx="295" cy="175" r="90" fill="#10b981" fill-opacity="${isExplanation ? '0.35' : '0.2'}" stroke="#059669" stroke-width="2.5" />
  <text x="160" y="180" fill="#1e3a8a" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">Set A</text>
  <text x="330" y="180" fill="#064e3b" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">Set B</text>
  <text x="250" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">A ∩ B</text>
  <text x="250" y="325" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Inclusion-Exclusion: n(A ∪ B) = n(A) + n(B) − n(A ∩ B)' : 'Set Intersection &amp; Union Relations'}
  </text>
</svg>`;
  }

  // 10. Optics / Lenses & Ray Diagram
  if (combined.includes('lens') || combined.includes('mirror') || combined.includes('focal') || combined.includes('refraction') || combined.includes('ray')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="rayArr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
  </defs>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">Optics Ray Diagram (Convex Lens)</text>
  <!-- Principal Axis -->
  <line x1="30" y1="180" x2="470" y2="180" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4,2" />
  <!-- Convex Lens -->
  <path d="M 250 50 Q 230 180 250 310 Q 270 180 250 50" fill="#38bdf8" fill-opacity="0.25" stroke="#0284c7" stroke-width="2.5" />
  <!-- Optical Center -->
  <circle cx="250" cy="180" r="4" fill="#0f172a" />
  <text x="250" y="198" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">O</text>
  <!-- Focal Points -->
  <circle cx="160" cy="180" r="4" fill="#ef4444" />
  <text x="160" y="200" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">F₁</text>
  <circle cx="340" cy="180" r="4" fill="#ef4444" />
  <text x="340" y="200" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">F₂</text>
  <!-- Object Arrow -->
  <line x1="100" y1="180" x2="100" y2="100" stroke="#0f172a" stroke-width="3" marker-end="url(#rayArr)" />
  <text x="100" y="90" fill="#0f172a" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Object</text>
  <!-- Parallel Ray to Lens to Focal Point -->
  <line x1="100" y1="100" x2="250" y2="100" stroke="#2563eb" stroke-width="2" />
  <line x1="250" y1="100" x2="420" y2="230" stroke="#2563eb" stroke-width="2" marker-end="url(#rayArr)" />
  <!-- Center Ray -->
  <line x1="100" y1="100" x2="420" y2="230" stroke="#059669" stroke-width="2" marker-end="url(#rayArr)" />
  <!-- Inverted Real Image -->
  <line x1="420" y1="180" x2="420" y2="230" stroke="#ef4444" stroke-width="3" stroke-dasharray="4,2" />
  <text x="420" y="250" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Real Image</text>
  <text x="250" y="335" fill="#475569" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Lens Formula: 1/f = 1/v − 1/u</text>
</svg>`;
  }

  // 11. Calculus / Coordinate Graph with Curve and Key Points
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="axisArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
    </marker>
  </defs>
  <text x="250" y="38" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">
    ${isExplanation ? 'Function Curve &amp; Tangent Extrema Analysis' : 'Function Coordinate Curve y = f(x)'}
  </text>
  <!-- Coordinate Axes -->
  <line x1="50" y1="270" x2="465" y2="270" stroke="#475569" stroke-width="2" marker-end="url(#axisArrow)" />
  <line x1="90" y1="310" x2="90" y2="40" stroke="#475569" stroke-width="2" marker-end="url(#axisArrow)" />
  <text x="470" y="275" fill="#475569" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">x</text>
  <text x="85" y="30" fill="#475569" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">y</text>
  <text x="75" y="285" fill="#475569" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">O</text>
  <!-- Parabolic Curve -->
  <path d="M 90 250 Q 255 35 420 250" fill="none" stroke="#2563eb" stroke-width="3.5" />
  <!-- Vertex / Maxima Point -->
  <circle cx="255" cy="142" r="5.5" fill="#ef4444" />
  <text x="268" y="135" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Point (${isExplanation ? 'x₀, y₀' : '?'})</text>
  <line x1="255" y1="142" x2="255" y2="270" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4" />
  <line x1="90" y1="142" x2="255" y2="142" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4" />
  <text x="255" y="290" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">x₀</text>
  <text x="65" y="146" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold">y₀</text>
  ${isExplanation ? `
  <line x1="180" y1="142" x2="330" y2="142" stroke="#059669" stroke-width="2.5" stroke-dasharray="6,3" />
  <text x="340" y="146" fill="#059669" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">f'(x₀) = 0 (Extremum)</text>
  ` : ''}
  <text x="245" y="70" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">y = f(x)</text>
</svg>`;
}
