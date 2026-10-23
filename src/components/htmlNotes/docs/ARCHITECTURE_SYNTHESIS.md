# Node Studio: AI Read-Then-Apply Architecture

## Overview
The **Read-Then-Apply** strategy is a context-aware synthesis engine designed to transform high-level natural language prompts into surgical, non-destructive document modifications. It eliminates "full-file overwriting" and prevents data duplication by dynamically slicing document context before transmitting it to the AI.

---

## 1. The Core Flow
The system follows a strict 4-stage execution pipeline:

### Stage A: Intelligence Gathering (The "Read")
When a prompt is received, the system gathers local and global state:
- **Active Cursor**: Character index and line number.
- **Selection**: Any text currently highlighted by the user.
- **Structural Map**: A generated `DocumentOutline` (AST-lite) of the current file.
- **Project Manifest**: A summary of all filenames, IDs, and heading hierarchies in the workspace.

### Stage B: Scope Resolution
The backend (`server.ts`) performs **Intent Detection** to determine the minimal necessary context payload:
1. **BLOCK_SCOPE**: If the user mentions a specific section (e.g., "Update Section 2"), the engine extracts only the raw HTML of that section using `extractSectionByHeading`.
2. **CURSOR_SCOPE**: If the user right-clicked to insert, the context focus shifts to the text surrounding the pointer.
3. **FULL_SCOPE**: If keywords like "entire document" or "all formulas" are detected, the full raw file is sent.
4. **OUTLINE_SCOPE**: For general questions, only the structural map is sent to save tokens while maintaining situational awareness.

### Stage C: Command Generation
Gemini AI is instructed to return **Modular Patches** rather than full documents. Responses follow a command-driven protocol:
- **Modular Snippets**: HTML code blocks intended for surgical insertion.
- **File Commands**: System-level directives:
    - `NEW_FILE_TITLE: [Title]`
    - `DELETE_FILE: [Title/ID]`
    - `[[UPDATE: FileID]]`: Proposes changes to a file not currently active.

### Stage D: Synthesis & Patching (The "Apply")
The `docSynthesizerEngine` performs the final merge:
- **Heading Matching**: Replaces content between `<h...>` tags if a match is found in the snippet.
- **Pointer Insertion**: Injects code at the exact captured `targetPointerIndex`.
- **Structural Frame Preservation**: Ensures new content is inserted before `</body>` to prevent breaking styles or scripts.

---

## 2. Key Components

| Component | Responsibility |
| :--- | :--- |
| **`docStructureMap.ts`** | Parsers and AST-lite generators; calculates char offsets for sections. |
| **`server.ts`** | Intent detection, scope resolution, and system-prompt orchestration. |
| **`docSynthesizerEngine.ts`** | The "Surgical Patch" logic that merges AI output into existing source code. |
| **`HtmlNotesAiPanel.tsx`** | Frontend command parser and state manager for multi-file operations. |

---

## 3. Data Structures

### DocumentOutline
```ts
interface DocumentOutline {
  sections: {
    id: string;
    level: number;
    headingText: string;
    startCharIndex: number;
    endCharIndex: number;
  }[];
  outlineText: string; // Token-efficient text map
}
```

### Synthesis Intent
```ts
enum SynthesisScope {
  GLOBAL,    // Full file replacement/audit
  SECTION,   // Surgical update of a specific heading block
  POINTER,   // Insertion at cursor
  PROJECT    // Multi-file cross-referencing
}
```

---

## 4. Guiding Principles
1. **Never Overwrite**: Default to synthesis; full document replacement is an exception.
2. **Zero Duplication**: AI must use the Outline Map to avoid creating duplicate headers or topics.
3. **Token Efficiency**: Send slices, not blobs. Only provide what is relevant to the active scope.
4. **History Preservation**: All synthesis operations must respect the Undo/Redo stack.
