/**
 * Intelligence Persona — Auditor Estratégico (Spec §7.1 / Divergência #11)
 *
 * Wraps Gemini AI with:
 *  1. "Auditor Estratégico" system prompt persona — objective, evidence-based, legally grounded
 *  2. Antiloop guard — aborts if response length exceeds budget or repeating patterns detected
 *  3. CLEAR output structure — Context · Legal · Evidence · Action · Report
 *
 * This service is ADVISORY ONLY. It cannot override hard gates, CPO, risk blocks, or workflow.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

// ============================================
// Auditor Estratégico — System Prompt (Persona)
// ============================================

const AUDITOR_ESTRATEGICO_PROMPT = `
Você é o **Auditor Estratégico** do sistema de gestão jurídica e imobiliária.

Seu papel é analisar dados, documentos e transações com rigor técnico, objetividade e imparcialidade.
Você nunca inventa fatos. Você fundamenta toda conclusão em evidência concreta fornecida no contexto.
Você segue a estrutura CLEAR:

**CLEAR Framework:**
- **C – Contexto:** Resuma o que foi fornecido para análise.
- **L – Enquadramento Legal:** Indique as normas, artigos ou regulamentos aplicáveis.
- **E – Evidências:** Liste as evidências concretas que fundamentam a análise.
- **A – Ação recomendada:** Proponha ações específicas e executáveis.
- **R – Relatório de Risco:** Atribua um nível de risco (BAIXO / MÉDIO / ALTO / CRÍTICO) com justificativa.

Você NÃO pode:
- Aprovar ou bloquear transações automaticamente.
- Ignorar evidências desfavoráveis.
- Sugerir contornar gates de qualidade (CPO, QG4, MPGA).
- Fabricar jurisprudências, doutrina ou fatos.

Responda sempre em português. Seja conciso — máximo de 800 palavras por resposta.
`.trim();

// ============================================
// Antiloop Guard
// ============================================

const MAX_RESPONSE_TOKENS  = 1200;  // If Gemini returns more, something is wrong
const MAX_RESPONSE_CHARS   = 6000;
const MIN_UNIQUE_SENTENCES = 3;     // Detect copy-paste / repetition

function antiloopCheck(text: string): string {
  if (text.length > MAX_RESPONSE_CHARS) {
    logger.warn('[intelligence-persona] Antiloop: response too long, truncating', { length: text.length });
    return text.slice(0, MAX_RESPONSE_CHARS) + '\n\n⚠️ [Resposta truncada pelo Antiloop Guard]';
  }

  // Detect repeated sentences (>50% duplicates = potential loop)
  const sentences = text
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const unique = new Set(sentences);
  if (sentences.length > 4 && unique.size < MIN_UNIQUE_SENTENCES) {
    logger.warn('[intelligence-persona] Antiloop: repetitive content detected');
    return '⚠️ Antiloop Guard: resposta repetitiva detectada. Tente reformular a pergunta.';
  }

  return text;
}

// ============================================
// CLEAR wrapper
// ============================================

export interface ClearAnalysisResult {
  raw:           string;
  model_used:    string;
  persona:       'AUDITOR_ESTRATEGICO';
  antiloop_ok:   boolean;
  char_count:    number;
}

export async function runClearAnalysis(
  apiKey: string,
  userPrompt: string,
  context?: string
): Promise<ClearAnalysisResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: AUDITOR_ESTRATEGICO_PROMPT,
    generationConfig: {
      maxOutputTokens: MAX_RESPONSE_TOKENS,
      temperature: 0.2,        // Low temperature for deterministic, factual output
      topP: 0.8,
    },
  });

  const fullPrompt = context
    ? `[CONTEXTO FORNECIDO]\n${context}\n\n[PERGUNTA/TAREFA]\n${userPrompt}`
    : userPrompt;

  let raw: string;
  try {
    const result = await model.generateContent(fullPrompt);
    raw = result.response.text();
  } catch (err) {
    logger.error('[intelligence-persona] Gemini call failed', { error: err });
    throw new Error('Falha na análise AI. Verifique GEMINI_API_KEY e tente novamente.');
  }

  const guarded = antiloopCheck(raw);
  const antiloop_ok = guarded === raw;

  if (!antiloop_ok) {
    logger.warn('[intelligence-persona] Antiloop guard triggered');
  }

  return {
    raw: guarded,
    model_used: 'gemini-1.5-flash',
    persona: 'AUDITOR_ESTRATEGICO',
    antiloop_ok,
    char_count: guarded.length,
  };
}
