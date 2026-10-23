/**
 * SVG-based standard mathematical diagrams for Statics, Dynamics, and Conic Sections.
 * Self-contained vector Data-URIs: crisp, lightweight (<2KB), and 100% offline-ready.
 */

export interface DiagramPreset {
  id: string;
  category: 'Statics' | 'Dynamics' | 'Conic Sections';
  title: string;
  description: string;
  dataUrl: string;
}

/**
 * Normalizes any diagram URL (especially SVG Data URLs) to ensure that:
 * 1. MIME charset is valid (data:image/svg+xml;charset=utf-8,)
 * 2. SVG has explicit width and height derived from viewBox if width="100%" or missing
 * This prevents the browser from collapsing SVG <img> elements to 0x0 (rendering as a white dot).
 */
export function normalizeDiagramUrl(url?: string): string {
  if (!url) return '';
  const cleanUrl = url.trim();

  // If it's a data URL with svg+xml
  if (cleanUrl.startsWith('data:image/svg+xml')) {
    try {
      let decodedSvg = '';
      if (cleanUrl.includes(';base64,')) {
        const base64Index = cleanUrl.indexOf(';base64,') + 8;
        decodedSvg = atob(cleanUrl.slice(base64Index));
      } else {
        const commaIndex = cleanUrl.indexOf(',');
        if (commaIndex !== -1) {
          const rawPart = cleanUrl.slice(commaIndex + 1);
          try {
            decodedSvg = decodeURIComponent(rawPart);
          } catch {
            decodedSvg = rawPart;
          }
        }
      }

      if (decodedSvg && decodedSvg.includes('<svg')) {
        let repaired = decodedSvg.trim();
        const viewBoxMatch = repaired.match(/viewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/);
        if (viewBoxMatch) {
          const vbW = viewBoxMatch[3];
          const vbH = viewBoxMatch[4];
          // Replace percentage width/height with physical viewBox dimensions
          repaired = repaired.replace(/width=["']100%["']/g, `width="${vbW}"`);
          repaired = repaired.replace(/height=["']100%["']/g, `height="${vbH}"`);
          
          if (!/width=["']\s*\d+/.test(repaired)) {
            repaired = repaired.replace(/<svg\b/, `<svg width="${vbW}" height="${vbH}"`);
          }
        }

        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(repaired)}`;
      }
    } catch {
      const commaIndex = cleanUrl.indexOf(',');
      if (commaIndex !== -1) {
        const rawPart = cleanUrl.slice(commaIndex + 1);
        if (rawPart.includes('<svg')) {
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawPart)}`;
        }
      }
    }
  }

  return cleanUrl;
}

export function svgToDataUrl(svg: string): string {
  let processed = svg.trim();
  const viewBoxMatch = processed.match(/viewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/);
  if (viewBoxMatch) {
    const vbW = viewBoxMatch[3];
    const vbH = viewBoxMatch[4];
    processed = processed.replace(/width=["']100%["']/g, `width="${vbW}"`);
    processed = processed.replace(/height=["']100%["']/g, `height="${vbH}"`);
    if (!/width=["']\s*\d+/.test(processed)) {
      processed = processed.replace(/<svg\b/, `<svg width="${vbW}" height="${vbH}"`);
    }
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(processed)}`;
}

// 1. STATICS: Block on Inclined Plane with Forces
const svgStaticsInclinedPlane = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280">
  <rect width="400" height="280" fill="#ffffff"/>
  <!-- Ground -->
  <line x1="40" y1="240" x2="360" y2="240" stroke="#1e293b" stroke-width="2.5"/>
  <line x1="40" y1="240" x2="330" y2="90" stroke="#1e293b" stroke-width="2.5"/>
  <line x1="330" y1="90" x2="330" y2="240" stroke="#1e293b" stroke-width="2" stroke-dasharray="4,4"/>
  <!-- Angle theta arc -->
  <path d="M 100,240 A 60,60 0 0,0 93,212" fill="none" stroke="#2563eb" stroke-width="2"/>
  <text x="106" y="228" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2563eb">θ</text>
  <!-- Block on incline -->
  <g transform="translate(180, 168) rotate(-27.5)">
    <rect x="-30" y="-35" width="60" height="35" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" rx="3"/>
    <!-- Normal force R -->
    <line x1="0" y1="-35" x2="0" y2="-95" stroke="#2563eb" stroke-width="2.5"/>
    <polygon points="0,-102 -5,-92 5,-92" fill="#2563eb"/>
    <text x="8" y="-75" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2563eb">R</text>
    <!-- Friction force f_s -->
    <line x1="30" y1="0" x2="90" y2="0" stroke="#059669" stroke-width="2.5"/>
    <polygon points="97,0 87,-5 87,5" fill="#059669"/>
    <text x="60" y="-8" font-family="sans-serif" font-size="14" font-weight="bold" fill="#059669">f</text>
  </g>
  <!-- Weight W downward -->
  <line x1="180" y1="168" x2="180" y2="248" stroke="#dc2626" stroke-width="2.5"/>
  <polygon points="180,256 175,244 185,244" fill="#dc2626"/>
  <text x="190" y="225" font-family="sans-serif" font-size="14" font-weight="bold" fill="#dc2626">W = mg</text>
</svg>
`;

// 2. STATICS: Concurrent Coplanar Forces (Lami's Theorem)
const svgStaticsLami = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280">
  <rect width="400" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="50" y1="140" x2="350" y2="140" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3,3"/>
  <line x1="200" y1="30" x2="200" y2="250" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3,3"/>
  <!-- Origin -->
  <circle cx="200" cy="140" r="4" fill="#0f172a"/>
  <text x="206" y="156" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">O</text>
  <!-- Force P (up-right) -->
  <line x1="200" y1="140" x2="310" y2="60" stroke="#2563eb" stroke-width="2.5"/>
  <polygon points="316,56 303,61 308,70" fill="#2563eb"/>
  <text x="322" y="65" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2563eb">P</text>
  <!-- Force Q (up-left) -->
  <line x1="200" y1="140" x2="90" y2="70" stroke="#059669" stroke-width="2.5"/>
  <polygon points="84,66 97,71 93,80" fill="#059669"/>
  <text x="65" y="75" font-family="sans-serif" font-size="15" font-weight="bold" fill="#059669">Q</text>
  <!-- Force R (straight down) -->
  <line x1="200" y1="140" x2="200" y2="245" stroke="#dc2626" stroke-width="2.5"/>
  <polygon points="200,253 195,241 205,241" fill="#dc2626"/>
  <text x="210" y="235" font-family="sans-serif" font-size="15" font-weight="bold" fill="#dc2626">R</text>
  <!-- Angle arcs -->
  <path d="M 230,118 A 40,40 0 0,0 170,121" fill="none" stroke="#64748b" stroke-width="1.5"/>
  <text x="195" y="105" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">γ</text>
  <path d="M 180,158 A 40,40 0 0,0 200,180" fill="none" stroke="#64748b" stroke-width="1.5"/>
  <text x="165" y="185" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">α</text>
  <path d="M 200,180 A 40,40 0 0,0 226,155" fill="none" stroke="#64748b" stroke-width="1.5"/>
  <text x="220" y="185" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">β</text>
</svg>
`;

// 3. STATICS: Simply Supported Beam with Point Load
const svgStaticsBeam = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="420" height="260">
  <rect width="420" height="260" fill="#ffffff"/>
  <!-- Beam -->
  <rect x="60" y="120" width="300" height="18" fill="#cbd5e1" stroke="#0f172a" stroke-width="2" rx="2"/>
  <!-- Left Support A (Pin) -->
  <polygon points="80,138 65,175 95,175" fill="#f1f5f9" stroke="#0f172a" stroke-width="2"/>
  <line x1="55" y1="175" x2="105" y2="175" stroke="#0f172a" stroke-width="2"/>
  <text x="50" y="145" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">A</text>
  <line x1="80" y1="215" x2="80" y2="182" stroke="#2563eb" stroke-width="2.5"/>
  <polygon points="80,175 75,187 85,187" fill="#2563eb"/>
  <text x="90" y="210" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">R_A</text>
  <!-- Right Support B (Roller) -->
  <polygon points="340,138 325,165 355,165" fill="#f1f5f9" stroke="#0f172a" stroke-width="2"/>
  <circle cx="332" cy="172" r="5" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.5"/>
  <circle cx="348" cy="172" r="5" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.5"/>
  <line x1="320" y1="178" x2="360" y2="178" stroke="#0f172a" stroke-width="2"/>
  <text x="360" y="145" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">B</text>
  <line x1="340" y1="215" x2="340" y2="185" stroke="#2563eb" stroke-width="2.5"/>
  <polygon points="340,178 335,190 345,190" fill="#2563eb"/>
  <text x="350" y="210" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">R_B</text>
  <!-- Point Load W at C -->
  <line x1="180" y1="45" x2="180" y2="112" stroke="#dc2626" stroke-width="3"/>
  <polygon points="180,120 174,106 186,106" fill="#dc2626"/>
  <text x="190" y="65" font-family="sans-serif" font-size="15" font-weight="bold" fill="#dc2626">W</text>
  <text x="175" y="145" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a">C</text>
  <!-- Dimensions -->
  <line x1="80" y1="95" x2="180" y2="95" stroke="#64748b" stroke-width="1.5"/>
  <text x="125" y="88" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">a</text>
  <line x1="180" y1="95" x2="340" y2="95" stroke="#64748b" stroke-width="1.5"/>
  <text x="255" y="88" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">b</text>
</svg>
`;

// 4. DYNAMICS: Velocity-Time Graph (Uniform Motion - Constant Velocity)
const svgDynamicsUniformMotion = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="420" height="280">
  <rect width="420" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="50" y1="240" x2="380" y2="240" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="386,240 376,236 376,244" fill="#0f172a"/>
  <text x="345" y="262" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a">Time (t)</text>
  <line x1="60" y1="250" x2="60" y2="30" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="60,24 56,34 64,34" fill="#0f172a"/>
  <text x="25" y="34" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">v (m/s)</text>
  
  <!-- Shaded Area for Displacement -->
  <rect x="60" y="110" width="230" height="130" fill="#3b82f6" fill-opacity="0.14"/>
  <line x1="290" y1="110" x2="290" y2="240" stroke="#64748b" stroke-width="1.8" stroke-dasharray="4,4"/>
  <text x="285" y="258" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">t₁</text>
  
  <!-- Constant Velocity Horizontal Line -->
  <line x1="60" y1="110" x2="350" y2="110" stroke="#2563eb" stroke-width="3.5"/>
  <circle cx="60" cy="110" r="4" fill="#2563eb"/>
  <text x="32" y="115" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2563eb">v₀</text>
  
  <!-- Labels -->
  <text x="130" y="180" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1d4ed8">Displacement s = v₀ · t₁</text>
  <rect x="110" y="70" width="240" height="26" rx="6" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
  <text x="120" y="88" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1d4ed8">v = constant  (Slope a = 0)</text>
</svg>
`;

// 5. DYNAMICS: Velocity-Time Graph (Uniform Acceleration)
const svgDynamicsUniformAcceleration = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="420" height="280">
  <rect width="420" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="50" y1="240" x2="380" y2="240" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="386,240 376,236 376,244" fill="#0f172a"/>
  <text x="345" y="262" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a">Time (t)</text>
  <line x1="60" y1="250" x2="60" y2="30" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="60,24 56,34 64,34" fill="#0f172a"/>
  <text x="25" y="34" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">v (m/s)</text>
  
  <!-- Slanted Line with Initial Velocity u -->
  <line x1="60" y1="180" x2="320" y2="70" stroke="#059669" stroke-width="3"/>
  <circle cx="60" cy="180" r="4.5" fill="#059669"/>
  <text x="42" y="185" font-family="sans-serif" font-size="14" font-weight="bold" fill="#059669">u</text>
  <circle cx="320" cy="70" r="4.5" fill="#059669"/>
  <text x="330" y="75" font-family="sans-serif" font-size="14" font-weight="bold" fill="#059669">v</text>
  
  <!-- Dashed Triangle for Slope -->
  <line x1="60" y1="180" x2="320" y2="180" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3"/>
  <line x1="320" y1="70" x2="320" y2="240" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3"/>
  <text x="315" y="258" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">t</text>
  <text x="160" y="140" font-family="sans-serif" font-size="13" font-weight="bold" fill="#059669">Slope = Acceleration a</text>
</svg>
`;

// 6. DYNAMICS: Atwood Machine / Pulley System
const svgDynamicsPulley = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 290" width="380" height="290">
  <rect width="380" height="290" fill="#ffffff"/>
  <!-- Ceiling -->
  <line x1="120" y1="20" x2="260" y2="20" stroke="#0f172a" stroke-width="3"/>
  <line x1="190" y1="20" x2="190" y2="55" stroke="#475569" stroke-width="2.5"/>
  <!-- Pulley wheel -->
  <circle cx="190" cy="75" r="24" fill="#e2e8f0" stroke="#0f172a" stroke-width="2.5"/>
  <circle cx="190" cy="75" r="4" fill="#0f172a"/>
  <!-- Left String & Mass m1 -->
  <line x1="166" y1="75" x2="166" y2="170" stroke="#0f172a" stroke-width="2"/>
  <rect x="144" y="170" width="44" height="44" fill="#dbeafe" stroke="#1e40af" stroke-width="2" rx="3"/>
  <text x="156" y="198" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1e40af">m₁</text>
  <line x1="166" y1="140" x2="166" y2="115" stroke="#2563eb" stroke-width="2"/>
  <polygon points="166,110 162,120 170,120" fill="#2563eb"/>
  <text x="174" y="130" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">T</text>
  <!-- Acceleration a for m1 (downwards) -->
  <line x1="130" y1="180" x2="130" y2="210" stroke="#dc2626" stroke-width="2"/>
  <polygon points="130,215 126,205 134,205" fill="#dc2626"/>
  <text x="118" y="200" font-family="sans-serif" font-size="13" font-weight="bold" fill="#dc2626">a</text>
  <!-- Right String & Mass m2 -->
  <line x1="214" y1="75" x2="214" y2="130" stroke="#0f172a" stroke-width="2"/>
  <rect x="194" y="130" width="40" height="40" fill="#fef3c7" stroke="#b45309" stroke-width="2" rx="3"/>
  <text x="204" y="155" font-family="sans-serif" font-size="15" font-weight="bold" fill="#b45309">m₂</text>
  <line x1="214" y1="110" x2="214" y2="90" stroke="#2563eb" stroke-width="2"/>
  <polygon points="214,85 210,95 218,95" fill="#2563eb"/>
  <text x="222" y="105" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">T</text>
  <!-- Acceleration a for m2 (upwards) -->
  <line x1="248" y1="160" x2="248" y2="135" stroke="#dc2626" stroke-width="2"/>
  <polygon points="248,130 244,140 252,140" fill="#dc2626"/>
  <text x="254" y="150" font-family="sans-serif" font-size="13" font-weight="bold" fill="#dc2626">a</text>
</svg>
`;

// 7. DYNAMICS: Projectile Motion Trajectory
const svgDynamicsProjectile = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="420" height="280">
  <rect width="420" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="40" y1="240" x2="380" y2="240" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="386,240 376,236 376,244" fill="#0f172a"/>
  <text x="390" y="244" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">x</text>
  <line x1="50" y1="250" x2="50" y2="30" stroke="#0f172a" stroke-width="2.5"/>
  <polygon points="50,24 46,34 54,34" fill="#0f172a"/>
  <text x="46" y="20" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">y</text>
  <!-- Parabolic Trajectory -->
  <path d="M 50,240 Q 200,40 350,240" fill="none" stroke="#2563eb" stroke-width="2.5"/>
  <!-- Initial Velocity Vector u -->
  <line x1="50" y1="240" x2="120" y2="150" stroke="#dc2626" stroke-width="2.5"/>
  <polygon points="125,144 114,150 121,157" fill="#dc2626"/>
  <text x="125" y="140" font-family="sans-serif" font-size="15" font-weight="bold" fill="#dc2626">u</text>
  <!-- Angle θ -->
  <path d="M 85,240 A 35,35 0 0,0 74,210" fill="none" stroke="#059669" stroke-width="2"/>
  <text x="88" y="228" font-family="sans-serif" font-size="14" font-weight="bold" fill="#059669">θ</text>
  <!-- Maximum Height H -->
  <line x1="200" y1="140" x2="200" y2="240" stroke="#b45309" stroke-width="1.8" stroke-dasharray="4,4"/>
  <circle cx="200" cy="140" r="4" fill="#b45309"/>
  <text x="206" y="190" font-family="sans-serif" font-size="14" font-weight="bold" fill="#b45309">H_max</text>
  <!-- Range R -->
  <line x1="50" y1="262" x2="350" y2="262" stroke="#475569" stroke-width="1.5"/>
  <text x="195" y="276" font-family="sans-serif" font-size="14" font-weight="bold" fill="#475569">R</text>
</svg>
`;

// 8. CONIC SECTIONS: Parabola y^2 = 4ax (Focus & Directrix)
const svgConicParabola = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280">
  <rect width="400" height="280" fill="#ffffff"/>
  <!-- Coordinate Axes -->
  <line x1="40" y1="140" x2="360" y2="140" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="366,140 356,136 356,144" fill="#94a3b8"/>
  <text x="372" y="144" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">x</text>
  <line x1="160" y1="260" x2="160" y2="20" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="160,14 156,24 164,24" fill="#94a3b8"/>
  <text x="156" y="12" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">y</text>
  <!-- Directrix x = -a -->
  <line x1="90" y1="30" x2="90" y2="250" stroke="#dc2626" stroke-width="2" stroke-dasharray="4,4"/>
  <text x="50" y="50" font-family="sans-serif" font-size="12" font-weight="bold" fill="#dc2626">x = -a</text>
  <!-- Vertex V(0,0) -->
  <circle cx="160" cy="140" r="4" fill="#0f172a"/>
  <text x="145" y="156" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">V(0,0)</text>
  <!-- Focus S(a,0) -->
  <circle cx="230" cy="140" r="4" fill="#2563eb"/>
  <text x="225" y="158" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">S(a, 0)</text>
  <!-- Parabola Curve y^2 = 4ax -->
  <path d="M 330,35 Q 160,140 330,245" fill="none" stroke="#0f172a" stroke-width="3"/>
  <!-- Latus Rectum Chord through Focus -->
  <line x1="230" y1="65" x2="230" y2="215" stroke="#059669" stroke-width="2"/>
  <circle cx="230" cy="65" r="3.5" fill="#059669"/>
  <circle cx="230" cy="215" r="3.5" fill="#059669"/>
  <text x="238" y="70" font-family="sans-serif" font-size="12" font-weight="bold" fill="#059669">L(a, 2a)</text>
  <text x="238" y="222" font-family="sans-serif" font-size="12" font-weight="bold" fill="#059669">L'(a, -2a)</text>
</svg>
`;

// 9. CONIC SECTIONS: Ellipse with Foci & Major/Minor Axes
const svgConicEllipse = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280">
  <rect width="400" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="30" y1="140" x2="370" y2="140" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="376,140 366,136 366,144" fill="#94a3b8"/>
  <text x="382" y="144" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">x</text>
  <line x1="200" y1="260" x2="200" y2="20" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="200,14 196,24 204,24" fill="#94a3b8"/>
  <text x="196" y="12" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">y</text>
  <!-- Ellipse curve -->
  <ellipse cx="200" cy="140" rx="140" ry="85" fill="none" stroke="#0f172a" stroke-width="2.5"/>
  <!-- Center C -->
  <circle cx="200" cy="140" r="3.5" fill="#0f172a"/>
  <text x="190" y="156" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">C(0,0)</text>
  <!-- Foci S(ae,0) & S'(-ae,0) -->
  <circle cx="290" cy="140" r="4.5" fill="#2563eb"/>
  <text x="282" y="158" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">S(ae, 0)</text>
  <circle cx="110" cy="140" r="4.5" fill="#2563eb"/>
  <text x="85" y="158" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2563eb">S'(-ae, 0)</text>
  <!-- Vertices A(a,0) and A'(-a,0) -->
  <text x="345" y="132" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">A(a, 0)</text>
  <text x="25" y="132" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">A'(-a, 0)</text>
  <!-- Minor axis endpoints B(0,b) & B'(0,-b) -->
  <text x="206" y="60" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">B(0, b)</text>
  <text x="206" y="235" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">B'(0, -b)</text>
</svg>
`;

// 10. CONIC SECTIONS: Hyperbola with Asymptotes
const svgConicHyperbola = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280">
  <rect width="400" height="280" fill="#ffffff"/>
  <!-- Axes -->
  <line x1="30" y1="140" x2="370" y2="140" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="376,140 366,136 366,144" fill="#94a3b8"/>
  <text x="382" y="144" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">x</text>
  <line x1="200" y1="260" x2="200" y2="20" stroke="#94a3b8" stroke-width="2"/>
  <polygon points="200,14 196,24 204,24" fill="#94a3b8"/>
  <text x="196" y="12" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748b">y</text>
  <!-- Asymptotes y = ± (b/a)x -->
  <line x1="60" y1="250" x2="340" y2="30" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,4"/>
  <line x1="60" y1="30" x2="340" y2="250" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,4"/>
  <text x="300" y="25" font-family="sans-serif" font-size="11" font-weight="bold" fill="#dc2626">y = (b/a)x</text>
  <!-- Right Branch -->
  <path d="M 345,45 Q 260,140 345,235" fill="none" stroke="#0f172a" stroke-width="2.5"/>
  <!-- Left Branch -->
  <path d="M 55,45 Q 140,140 55,235" fill="none" stroke="#0f172a" stroke-width="2.5"/>
  <!-- Vertices and Foci -->
  <circle cx="260" cy="140" r="3.5" fill="#0f172a"/>
  <text x="250" y="156" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a">A(a,0)</text>
  <circle cx="300" cy="140" r="4" fill="#2563eb"/>
  <text x="295" y="158" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2563eb">S(ae,0)</text>
</svg>
`;

export const STANDARD_DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    id: 'statics-inclined-plane',
    category: 'Statics',
    title: 'Block on Inclined Plane',
    description: 'Free-body diagram of a block resting on a rough wedge with weight W, normal force R, friction f, and inclination θ.',
    dataUrl: svgToDataUrl(svgStaticsInclinedPlane),
  },
  {
    id: 'statics-lamis-theorem',
    category: 'Statics',
    title: 'Concurrent Coplanar Forces',
    description: "Equilibrium of three coplanar concurrent forces P, Q, and R acting at point O with angles α, β, γ (Lami's Theorem).",
    dataUrl: svgToDataUrl(svgStaticsLami),
  },
  {
    id: 'statics-supported-beam',
    category: 'Statics',
    title: 'Simply Supported Beam',
    description: 'Horizontal beam AB of span L with reactions R_A, R_B, carrying a concentrated point load W at distance a.',
    dataUrl: svgToDataUrl(svgStaticsBeam),
  },
  {
    id: 'dynamics-v-t-uniform',
    category: 'Dynamics',
    title: 'v-t Graph: Uniform Motion',
    description: 'Velocity-Time graph parallel to the time-axis indicating constant velocity (v = v₀, acceleration a = 0).',
    dataUrl: svgToDataUrl(svgDynamicsUniformMotion),
  },
  {
    id: 'dynamics-v-t-acceleration',
    category: 'Dynamics',
    title: 'v-t Graph: Uniform Acceleration',
    description: 'Velocity-Time graph with linear positive slope showing uniform constant acceleration a.',
    dataUrl: svgToDataUrl(svgDynamicsUniformAcceleration),
  },
  {
    id: 'dynamics-pulley-system',
    category: 'Dynamics',
    title: 'Atwood Machine / Pulley',
    description: 'Light frictionless pulley with masses m1 and m2 suspended by a light inextensible string, showing tensions T and acceleration a.',
    dataUrl: svgToDataUrl(svgDynamicsPulley),
  },
  {
    id: 'dynamics-projectile-motion',
    category: 'Dynamics',
    title: 'Projectile Trajectory',
    description: 'Parabolic flight trajectory with launch speed u at angle θ, showing Maximum Height H_max and Horizontal Range R.',
    dataUrl: svgToDataUrl(svgDynamicsProjectile),
  },
  {
    id: 'conics-parabola-focus-directrix',
    category: 'Conic Sections',
    title: 'Parabola y² = 4ax',
    description: 'Standard horizontal parabola showing Vertex V(0,0), Focus S(a,0), Directrix x = -a, and Latus Rectum chord LL\'.',
    dataUrl: svgToDataUrl(svgConicParabola),
  },
  {
    id: 'conics-ellipse-standard',
    category: 'Conic Sections',
    title: 'Standard Ellipse (x²/a² + y²/b² = 1)',
    description: 'Major and minor axes with Center C(0,0), Foci S(ae,0) & S\'(-ae,0), and Vertices A, A\', B, B\'.',
    dataUrl: svgToDataUrl(svgConicEllipse),
  },
  {
    id: 'conics-hyperbola-asymptotes',
    category: 'Conic Sections',
    title: 'Hyperbola with Asymptotes',
    description: 'Bilateral hyperbola branches with intersecting asymptotes y = ±(b/a)x, Vertices, and Foci S(ae,0).',
    dataUrl: svgToDataUrl(svgConicHyperbola),
  },
];

export const DIAGRAM_PRESETS = STANDARD_DIAGRAM_PRESETS;

/**
 * Helper to compress user-uploaded raster images into a clean, lightweight data URL (<30KB)
 * to keep Firestore and localStorage fast with zero bloat.
 */
export async function compressImageToDataUrl(file: File, maxDim = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    // For SVGs, read as text and normalize dimensions directly
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        resolve(svgToDataUrl(text));
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));

        // White background for transparent PNG/WebP conversions
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Export as WebP or JPEG
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
