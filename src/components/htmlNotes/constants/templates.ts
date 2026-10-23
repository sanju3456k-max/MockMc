// Built-in starter template: Matrices & Linear Algebra
export const TEMPLATE_MATRICES = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chapter Notes: Matrices & Determinants</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
    <style>
        :root {
            --primary: #2563eb;
            --primary-light: #eff6ff;
            --primary-border: #dbeafe;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --bg-card: #ffffff;
            --bg-body: #ffffff;
            --success: #10b981;
            --warning: #f59e0b;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 12px;
            background-color: var(--bg-body);
            color: var(--text-main);
            line-height: 1.6;
        }

        header {
            text-align: center;
            margin-top: 0;
            margin-bottom: 16px;
            border-bottom: 2px solid var(--primary-border);
            padding-bottom: 10px;
        }

        h1 {
            color: var(--primary);
            font-size: 1.8rem;
            margin-top: 0;
            margin-bottom: 4px;
            font-weight: 800;
        }

        .subtitle {
            color: var(--text-muted);
            font-size: 0.9rem;
            font-weight: 500;
        }

        h2 {
            color: #0f172a;
            border-bottom: 1px solid var(--primary-border);
            padding-bottom: 4px;
            margin-top: 20px;
            font-size: 1.3rem;
        }

        h3 {
            color: var(--primary);
            margin-top: 14px;
            font-size: 1.05rem;
        }

        .panel {
            background: var(--bg-card);
            border: 1px solid var(--primary-border);
            border-left: 4px solid var(--primary);
            border-radius: 8px;
            padding: 12px;
            margin: 12px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            box-sizing: border-box;
            width: 100%;
            max-width: 100%;
            display: flow-root;
        }

        .panel-success {
            border-left-color: var(--success);
            background-color: #f0fdf4;
        }

        .panel-warning {
            border-left-color: var(--warning);
            background-color: #fffbeb;
        }

        details, .dropdown-box {
            border: 1px solid var(--primary-border);
            border-radius: 8px;
            padding: 10px 14px;
            margin: 12px 0;
            background: #f8fafc;
            box-sizing: border-box;
            width: 100%;
            max-width: 100%;
            transition: all 0.2s ease;
        }

        details[open], .dropdown-box[open] {
            background: #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        summary {
            font-weight: 700;
            color: var(--primary);
            cursor: pointer;
            user-select: none;
            outline: none;
        }

        summary:hover {
            color: #1d4ed8;
        }

        table {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            border-collapse: collapse;
            margin: 14px 0;
            background: var(--bg-card);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        th, td {
            border: 1px solid var(--primary-border);
            padding: 8px 12px;
            text-align: left;
            font-size: 0.9rem;
        }

        th {
            background-color: var(--primary-light);
            color: var(--primary);
            font-weight: 700;
        }

        @page {
            size: A4;
            margin: 10mm;
        }

        @media print {
            body {
                background: #ffffff !important;
                color: #000000 !important;
                font-size: 11pt;
                line-height: 1.5;
                padding: 0 !important;
            }
            h1, h2, h3 {
                break-after: avoid;
                page-break-after: avoid;
            }
            img, table, blockquote, pre, .panel {
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>Matrices & Determinants</h1>
        <p class="subtitle">Comprehensive Revision Notes for Sanju</p>
    </header>

    <!-- Section 1 -->
    <section>
        <h2>1. Introduction to Matrices</h2>
        <div class="panel">
            <p>A matrix is an ordered rectangular array of numbers or functions arranged in rows and columns. It is usually enclosed in brackets or parentheses.</p>
            <p><strong>Order of a Matrix:</strong> If a matrix has $m$ rows and $n$ columns, its order is given by <span style="display:inline-block; padding: 2px 6px; margin: 0; background: #f1f5f9; border-radius: 4px;">$m \times n$</span> (read as "$m$ by $n$").</p>
        </div>
    </section>

    <!-- Section 2 -->
    <section>
        <h2>2. Types of Matrices</h2>
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Definition</th>
                    <th>Example</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Row Matrix</strong></td>
                    <td>Has only one row ($m = 1$)</td>
                    <td>[ 1 &nbsp; 2 &nbsp; 5 ]</td>
                </tr>
                <tr>
                    <td><strong>Column Matrix</strong></td>
                    <td>Has only one column ($n = 1$)</td>
                    <td>[3]<br>[4]</td>
                </tr>
                <tr>
                    <td><strong>Square Matrix</strong></td>
                    <td>Number of rows equals columns ($m = n$)</td>
                    <td>2 × 2 or 3 × 3 matrix</td>
                </tr>
                <tr>
                    <td><strong>Diagonal Matrix</strong></td>
                    <td>All non-diagonal elements are zero</td>
                    <td>Diag(2, 5, -1)</td>
                </tr>
                <tr>
                    <td><strong>Identity Matrix ($I$)</strong></td>
                    <td>All diagonal elements are 1</td>
                    <td><div style="font-family: monospace;">[1 0]<br>[0 1]</div></td>
                </tr>
            </tbody>
        </table>
    </section>

    <!-- Section 3 -->
    <section>
        <h2>3. Operations on Matrices</h2>
        
        <div class="panel panel-success">
            <h3>Addition & Subtraction</h3>
            <p>Two matrices can be added or subtracted only if they are of the <strong>same order</strong>.</p>
            <ul>
                <li>Commutative: $A + B = B + A$</li>
                <li>Associative: $(A + B) + C = A + (B + C)$</li>
            </ul>
        </div>

        <div class="panel panel-warning">
            <h3>Multiplication of Matrices</h3>
            <p>Two matrices $A$ ($m \\times n$) and $B$ ($p \\times q$) can be multiplied if $n = p$.</p>
        </div>
    </section>

    <!-- Section 4 -->
    <section>
        <h2>4. Inverse of a Matrix</h2>
        <div class="panel">
            <p>The inverse of a square matrix $A$ is denoted by $A^{-1}$:</p>
            <p style="text-align: center; font-size: 1.2rem; margin: 10px 0;">
                <strong>$$A^{-1} = \\frac{1}{|A|} \\cdot \\text{adj}(A)$$</strong>
            </p>
        </div>
    </section>

    <!-- Section 5 -->
    <section>
        <h2>5. Quick Reference & Proofs (Expandable)</h2>
        <details class="dropdown-box" open>
            <summary><strong>Expand / Collapse: Key Properties of Inverses</strong></summary>
            <div style="margin-top: 10px; padding-left: 6px;">
                <ul>
                    <li>$(A^{-1})^{-1} = A$</li>
                    <li>$(AB)^{-1} = B^{-1}A^{-1}$</li>
                    <li>$(A^T)^{-1} = (A^{-1})^T$</li>
                    <li>$|A^{-1}| = \\frac{1}{|A|}$</li>
                </ul>
            </div>
        </details>
    </section>

  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '\\\\[', right: '\\\\]', display: true}
          ],
          throwOnError: false
        });
      }
    });
  </script>
</body>
</html>`;

export const TEMPLATE_LANDSCAPE_SLIDES = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A4 Widescreen Slide Deck Reference</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
    <style>
        :root {
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --primary-light: #eff6ff;
            --primary-border: #bfdbfe;
            --accent: #0f172a;
            --success: #10b981;
            --warning: #f59e0b;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --bg-body: #f8fafc;
            --bg-card: #ffffff;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--bg-body);
            color: var(--text-main);
            line-height: 1.5;
            padding: 12px;
        }

        /* Slide Deck Container */
        .slide {
            background: var(--bg-card);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px 28px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.06);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 675px;
            aspect-ratio: 16 / 9;
            page-break-after: always;
            break-after: page;
        }

        .slide-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid var(--primary-border);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }

        .slide-header h1 {
            color: var(--primary);
            font-size: 1.6rem;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .slide-badge {
            background: var(--primary-light);
            color: var(--primary-dark);
            border: 1px solid var(--primary-border);
            font-size: 0.75rem;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            text-transform: uppercase;
        }

        .slide-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .slide-footer {
            margin-top: 16px;
            padding-top: 10px;
            border-top: 1px dashed #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        /* Grid Layouts */
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
        }

        /* Cards & Metric Panels */
        .metric-card {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 14px;
            text-align: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }

        .metric-val {
            font-size: 1.8rem;
            font-weight: 800;
            color: var(--primary);
            line-height: 1.1;
        }

        .metric-lbl {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-muted);
            margin-top: 4px;
            text-transform: uppercase;
        }

        .panel {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-left: 4px solid var(--primary);
            border-radius: 8px;
            padding: 14px;
            display: flow-root;
        }

        .panel-success { border-left-color: var(--success); background-color: #f0fdf4; }
        .panel-warning { border-left-color: var(--warning); background-color: #fffbeb; }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            font-size: 0.88rem;
        }

        th, td {
            padding: 10px 14px;
            border: 1px solid #e2e8f0;
            text-align: left;
        }

        th {
            background-color: var(--primary-light);
            color: var(--primary-dark);
            font-weight: 700;
        }

        tr:nth-child(even) {
            background-color: #f8fafc;
        }

        /* Code Blocks */
        pre {
            background: #0f172a;
            color: #f8fafc;
            padding: 14px;
            border-radius: 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.85rem;
            overflow-x: auto;
            border: 1px solid #334155;
        }

        .tag-pill {
            display: inline-block;
            background: #e2e8f0;
            color: #334155;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-right: 4px;
        }

        /* Checklists */
        .task-list {
            list-style: none;
            padding: 0;
        }

        .task-list li {
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            margin-bottom: 6px;
            background: #ffffff;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
        }

        .task-list input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--primary);
        }

        @page { size: A4 landscape; margin: 0; }
        @media print {
            body { background: white !important; padding: 0 !important; }
            .slide {
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                padding: 18mm 20mm !important;
                break-after: page !important;
                page-break-after: always !important;
            }
        }
    </style>
</head>
<body>

    <!-- SLIDE 1 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>A4 Widescreen Slide Deck Reference</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Interactive 16:9 Landscape Note Template for Notes Studio</p>
            </div>
            <span class="slide-badge">Slide 01 / 04</span>
        </div>

        <div class="slide-body">
            <div class="grid-3">
                <div class="metric-card">
                    <div class="metric-val">100%</div>
                    <div class="metric-lbl">A4 Landscape Match</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val">16 : 9</div>
                    <div class="metric-lbl">Widescreen Layout</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val">0 Cutoff</div>
                    <div class="metric-lbl">Zero Content Clipping</div>
                </div>
            </div>

            <div class="grid-2" style="margin-top: 8px;">
                <div class="panel">
                    <h3 style="color: #2563eb; font-size: 1rem; margin-bottom: 6px;">Key Strategic Advantages</h3>
                    <ul style="padding-left: 18px; font-size: 0.88rem; color: #334155; line-height: 1.6;">
                        <li><strong>Full Width Utilization:</strong> Utilizes full 297mm width of A4 paper in landscape mode.</li>
                        <li><strong>Structured Elements:</strong> Resizable tables, callouts, and code blocks fit without awkward line wrapping.</li>
                        <li><strong>Zero Overflow:</strong> Each slide is rendered as a clean, self-contained presentation card.</li>
                    </ul>
                </div>

                <div class="panel panel-success">
                    <h3 style="color: #059669; font-size: 1rem; margin-bottom: 6px;">Interactive Editing Features</h3>
                    <ul style="padding-left: 18px; font-size: 0.88rem; color: #334155; line-height: 1.6;">
                        <li><strong>Font Scaling (A+ / A-):</strong> Select any element to scale font size up or down.</li>
                        <li><strong>Slide Transport:</strong> Instantly move tables or blocks to the Next or Previous slide.</li>
                        <li><strong>Drag-to-Resize:</strong> Live handles for adjusting table columns and callout boxes.</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · 16:9 Landscape Reference</span>
            <span>Page 1 of 4</span>
        </div>
    </div>

    <!-- SLIDE 2 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Data Matrix & Operational Metrics</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Formatted performance table and highlights</p>
            </div>
            <span class="slide-badge">Slide 02 / 04</span>
        </div>

        <div class="slide-body">
            <table>
                <thead>
                    <tr>
                        <th>Performance Metric</th>
                        <th>Target Q1</th>
                        <th>Actual Q1</th>
                        <th>Variance</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Page Load Velocity</strong></td>
                        <td>&lt; 300 ms</td>
                        <td>180 ms</td>
                        <td style="color: #059669; font-weight: 700;">+40% Fast</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Optimal</span></td>
                    </tr>
                    <tr>
                        <td><strong>Print Accuracy Score</strong></td>
                        <td>98.0%</td>
                        <td>99.9%</td>
                        <td style="color: #059669; font-weight: 700;">+1.9%</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Verified</span></td>
                    </tr>
                    <tr>
                        <td><strong>Slide Alignment Ratio</strong></td>
                        <td>16:9 Ratio</td>
                        <td>16:9 Widescreen</td>
                        <td style="color: #2563eb; font-weight: 700;">Exact</td>
                        <td><span class="tag-pill" style="background: #dbeafe; color: #1e40af;">Standard</span></td>
                    </tr>
                    <tr>
                        <td><strong>Export Render Time</strong></td>
                        <td>&lt; 1.5s</td>
                        <td>0.8s</td>
                        <td style="color: #059669; font-weight: 700;">-0.7s</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Instant</span></td>
                    </tr>
                </tbody>
            </table>

            <div class="panel panel-warning" style="margin-top: 10px;">
                <strong style="color: #d97706; font-size: 0.95rem;">Operational Summary:</strong>
                <p style="font-size: 0.88rem; color: #451a03; margin-top: 4px;">
                    All 16:9 slides automatically maintain landscape page boundary compliance during PDF print generation. Click table cells to edit or drag edge handles to adjust column widths.
                </p>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · Performance Audit</span>
            <span>Page 2 of 4</span>
        </div>
    </div>

    <!-- SLIDE 3 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Technical Architecture & Code Snippets</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Implementation code and formulas</p>
            </div>
            <span class="slide-badge">Slide 03 / 04</span>
        </div>

        <div class="slide-body">
            <div class="grid-2">
                <div>
                    <h3 style="font-size: 0.95rem; color: #0f172a; margin-bottom: 8px;">CSS Print Engine Configuration</h3>
                    <pre><code>@page {
  size: A4 landscape !important;
  margin: 0 !important;
}

@media print {
  .slide {
    width: 297mm !important;
    height: 210mm !important;
    break-after: page !important;
    page-break-after: always !important;
  }
}</code></pre>
                </div>

                <div class="panel">
                    <h3 style="font-size: 0.95rem; color: #2563eb; margin-bottom: 6px;">KaTeX Mathematical Proofs</h3>
                    <p style="font-size: 0.85rem; color: #334155;">Matrix Transformations for 16:9 scaling:</p>
                    <p style="text-align: center; margin: 12px 0; font-size: 1.1rem;">
                        $$\mathbf{S} = \begin{pmatrix} s_x & 0 \\ 0 & s_y \end{pmatrix}, \quad \text{where } \frac{s_x}{s_y} = \frac{16}{9}$$
                    </p>
                    <p style="font-size: 0.82rem; color: #64748b;">
                        Ensures aspect ratio preservation across both screen display and landscape A4 print outputs.
                    </p>
                </div>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · System Design</span>
            <span>Page 3 of 4</span>
        </div>
    </div>

    <!-- SLIDE 4 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Execution Roadmap & Verification Checklist</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Action items for slide deck completion</p>
            </div>
            <span class="slide-badge">Slide 04 / 04</span>
        </div>

        <div class="slide-body">
            <ul class="task-list">
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>16:9 Slide Deck Viewport:</strong> Default mode activated across Notes Studio workspace.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>A4 Landscape Print Engine:</strong> Standard @page setup configured for full 297mm x 210mm pages.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>Interactive Element Editing:</strong> Floating toolbar added for font scaling (A+/A-) and slide transport.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>Reference Sample Template:</strong> Rich, perfectly filled 4-slide note loaded for instant reference.</span>
                </li>
            </ul>

            <div class="panel panel-success" style="margin-top: 10px;">
                <strong style="color: #059669;">Ready for Export:</strong>
                <p style="font-size: 0.88rem; color: #064e3b; margin-top: 2px;">
                    Click the <strong>Print / Export PDF</strong> button in the top toolbar to output these slides as an exact A4 Landscape document!
                </p>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · Final Summary</span>
            <span>Page 4 of 4</span>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>
    <script>
      document.addEventListener("DOMContentLoaded", function() {
        if (window.renderMathInElement) {
          renderMathInElement(document.body, {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false},
              {left: '\\\\(', right: '\\\\)', display: false},
              {left: '\\\\[', right: '\\\\]', display: true}
            ],
            throwOnError: false
          });
        }
      });
    </script>
</body>
</html>`;

// Default Blank Note Template
export const createNewNoteTemplate = (title: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
    <style>
        :root {
            --primary: #2563eb;
            --primary-light: #eff6ff;
            --primary-border: #dbeafe;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --bg-card: #ffffff;
            --bg-body: #ffffff;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 12px;
            background-color: var(--bg-body);
            color: var(--text-main);
            line-height: 1.6;
        }

        header {
            text-align: center;
            margin-top: 0;
            margin-bottom: 16px;
            border-bottom: 2px solid var(--primary-border);
            padding-bottom: 10px;
        }

        h1 { color: var(--primary); font-size: 1.8rem; margin-top: 0; margin-bottom: 4px; }
        .subtitle { color: var(--text-muted); font-size: 0.95rem; }
        h2 { color: #0f172a; border-bottom: 1px solid var(--primary-border); padding-bottom: 4px; margin-top: 20px; }
        
        .panel {
            background: var(--bg-card);
            border: 1px solid var(--primary-border);
            border-left: 4px solid var(--primary);
            border-radius: 8px;
            padding: 12px;
            margin: 12px 0;
            display: flow-root;
        }

        @page { size: A4 landscape; margin: 0; }
        @media print {
          body { background: #fff; color: #000; font-size: 11pt; line-height: 1.5; }
          h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
          img, table, blockquote, pre, .panel { break-inside: avoid; page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <header>
        <h1>${title}</h1>
        <p class="subtitle">Study notes created on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
    </header>

    <section>
        <h2>1. Overview & Key Points</h2>
        <p>Write your revision notes, formulas, and observations here.</p>
        
        <div class="panel">
            <strong>Key Formula:</strong>
            <p>$E = mc^2$ or $\int_{a}^{b} f(x)\,dx = F(b) - F(a)$</p>
        </div>
    </section>
</body>
</html>`;
}


