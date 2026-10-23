/**
 * GeminiChatbotView Entry Point
 * 
 * Modular Architecture for Gemini Chatbot (Theta AI):
 * - src/components/geminiChat/types.ts                   (Data models, ChatSession, ChatbotMessage, attachments)
 * - src/components/geminiChat/constants/rolesAndPresets.ts (Preset tutor roles & model tier options)
 * - src/components/geminiChat/utils/chatHelpers.ts        (Test action parsing, app action parsing, question extraction)
 * - src/components/geminiChat/components/
 *     - PythonCodeDrawer.tsx                              (Executable code block drawer)
 *     - GeminiChatHeader.tsx                             (Top bar with model dropdown & cloud sync)
 *     - GeminiChatSidebar.tsx                            (Drawer for chat history & search)
 * - src/components/geminiChat/GeminiChatbotView.tsx       (Main orchestrator component)
 */

export { GeminiChatbotView } from './geminiChat/GeminiChatbotView';
export * from './geminiChat/types';
export { extractTestAction, extractAppAction, extractQuestionsFromText } from './geminiChat/utils/chatHelpers';
export { PythonCodeDrawer } from './geminiChat/components/PythonCodeDrawer';
