import { 
  GraduationCap, 
  Brain, 
  Zap, 
  Lightbulb,
  Sparkles
} from 'lucide-react';
import { GeminiModelTier, PresetRole } from '../types';

export const PRESET_ROLES: PresetRole[] = [
  {
    id: 'general_tutor',
    name: 'Theta AI Tutor',
    tag: 'Balanced',
    description: 'Step-by-step math derivations, thorough derivations in LaTeX & test review',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: GraduationCap,
    badgeColor: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
  },
  {
    id: 'complex_researcher',
    name: 'Research & Proof Master',
    tag: 'Deep Reasoning',
    description: 'Theoretical proofs, higher mathematics, theorems & complex STEM analysis',
    recommendedModel: 'gemini-3.1-pro-preview' as GeminiModelTier,
    icon: Brain,
    badgeColor: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
  },
  {
    id: 'fast_solver',
    name: 'Fast Solver & Evaluator',
    tag: 'High Speed',
    description: 'Direct computations, instant formulas, quick calculations with zero preamble',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: Zap,
    badgeColor: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
  },
  {
    id: 'socratic_coach',
    name: 'Socratic Coach',
    tag: 'Guided Learning',
    description: 'Probing questions, hints, and guided thought steps to build understanding',
    recommendedModel: 'gemini-3.1-flash-lite' as GeminiModelTier,
    icon: Lightbulb,
    badgeColor: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
  }
];

export const MODEL_OPTIONS: { id: GeminiModelTier; label: string; tag: string; description: string; icon: any; color: string }[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite (Recommended)',
    tag: 'Instant & Reliable',
    description: 'High-speed reliable model for instant mathematical derivations, LaTeX formulas, and tutoring',
    icon: Zap,
    color: 'text-amber-500'
  },
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    tag: 'Balanced & Adaptive',
    description: 'Standard production flash model with broad reasoning and multimodal support',
    icon: Sparkles,
    color: 'text-indigo-500'
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    tag: 'Next-Gen Speed',
    description: 'Next-gen flash model for complex mathematical derivations and multi-turn tutoring',
    icon: Sparkles,
    color: 'text-blue-500'
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tag: 'Advanced Reasoning',
    description: 'Highest capability for complex theoretical proofs & university math',
    icon: Brain,
    color: 'text-purple-500'
  }
];

export const DEFAULT_SYSTEM_INSTRUCTION = `You are Theta AI, an expert AI mathematics tutor and scientific assistant embedded inside Notes Studio. 
You specialize in step-by-step math derivations, LaTeX formatting, test generation, data table synthesis, diagram analysis, and deep reasoning.
Always provide clean, beautifully formatted math with LaTeX using inline ($...$) or block ($$...$$) notation.`;
