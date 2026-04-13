import { DocumentFactModel, type DocumentFact } from '../models/document-fact.js';
import { GeneratedDocumentModel } from '../models/generated-document.js';
import { DocumentModel } from '../models/document.js';
import { KnowledgeEntryModel } from '../models/knowledge-entry.js';
import { TenantRequiredError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class GeneratedDocumentValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING_FACT' | 'SOURCE_NOT_CPO_APPROVED'
  ) {
    super(message);
    this.name = 'GeneratedDocumentValidationError';
  }
}

/**
 * Validate that all required fact IDs exist and that every source document
 * is CPO-approved. Use req.context.tenant_id only.
 */
export async function validateFactsForGeneration(
  tenantId: string,
  sourceFactIds: string[]
): Promise<{ valid: boolean; missingFactIds: string[]; nonApprovedDocumentIds: string[] }> {
  if (!tenantId) {
    throw new TenantRequiredError('validateFactsForGeneration');
  }
  const missingFactIds: string[] = [];
  const nonApprovedDocumentIds: string[] = [];

  if (sourceFactIds.length === 0) {
    return { valid: false, missingFactIds: [], nonApprovedDocumentIds: [] };
  }

  const facts = await DocumentFactModel.findByIds(sourceFactIds, tenantId);
  const foundIds = new Set(facts.map((f) => f.id));
  for (const id of sourceFactIds) {
    if (!foundIds.has(id)) {
      missingFactIds.push(id);
    }
  }

  const documentIds = [...new Set(facts.map((f) => f.document_id))];
  for (const docId of documentIds) {
    const doc = await DocumentModel.findById(docId, tenantId);
    if (!doc) {
      nonApprovedDocumentIds.push(docId);
      continue;
    }
    const isCpoApproved = doc.status_cpo === 'VERDE' || doc.cpo_approved_at != null;
    if (!isCpoApproved) {
      nonApprovedDocumentIds.push(docId);
    }
  }

  const valid = missingFactIds.length === 0 && nonApprovedDocumentIds.length === 0;
  return { valid, missingFactIds, nonApprovedDocumentIds };
}

/**
 * Create a generated document. Blocks if any required fact is missing or
 * any source document is not CPO-approved. Use req.context.tenant_id only.
 */
export async function createGeneratedDocument(
  tenantId: string,
  content: string,
  generatedBy: string,
  sourceFactIds: string[]
): Promise<{ id: string }> {
  if (!tenantId) {
    throw new TenantRequiredError('createGeneratedDocument');
  }

  const validation = await validateFactsForGeneration(tenantId, sourceFactIds);
  if (!validation.valid) {
    if (validation.missingFactIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate document: required facts not found: ${validation.missingFactIds.join(', ')}`,
        'MISSING_FACT'
      );
    }
    if (validation.nonApprovedDocumentIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate document: source documents are not CPO-approved: ${validation.nonApprovedDocumentIds.join(', ')}`,
        'SOURCE_NOT_CPO_APPROVED'
      );
    }
  }

  const gen = await GeneratedDocumentModel.create({
    tenant_id: tenantId,
    content,
    generated_by: generatedBy,
    source_fact_ids: sourceFactIds,
  });
  return { id: gen.id };
}

// ---------------------------------------------------------------------------
// 04-PECA: AI-powered petition generation using Gemini
// ---------------------------------------------------------------------------

export type PetitionType = 'initial_petition' | 'defense' | 'appeal';

export interface GeneratePetitionInput {
  tenantId: string;
  sourceFactIds: string[];
  petitionType: PetitionType;
  generatedBy: string;
  /** Optional additional instructions for the AI (e.g. court name, case number). */
  additionalContext?: string;
}

export interface GeneratePetitionResult {
  id: string;
  content: string;
  factsUsed: number;
  knowledgeEntriesUsed: number;
}

const PETITION_TYPE_LABELS: Record<PetitionType, string> = {
  initial_petition: 'Petição Inicial',
  defense: 'Contestação / Defesa',
  appeal: 'Recurso / Apelação',
};

/**
 * Group facts by their fact_type (maps to FPDN categories: fatos, provas, direito, nexo_causal).
 */
function groupFactsByType(facts: DocumentFact[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const f of facts) {
    const key = f.fact_type.toLowerCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f.fact_value);
  }
  return grouped;
}

/**
 * Build the Gemini prompt for petition generation.
 */
function buildPetitionPrompt(
  petitionType: PetitionType,
  groupedFacts: Record<string, string[]>,
  knowledgeTexts: string[],
  additionalContext?: string
): string {
  const label = PETITION_TYPE_LABELS[petitionType];

  const factsSection = Object.entries(groupedFacts)
    .map(([type, values]) => `### ${type.toUpperCase()}\n${values.map((v, i) => `${i + 1}. ${v}`).join('\n')}`)
    .join('\n\n');

  const knowledgeSection =
    knowledgeTexts.length > 0
      ? `\n\n## JURISPRUDÊNCIA E TESES JURÍDICAS DE REFERÊNCIA\n${knowledgeTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n\n')}`
      : '';

  const extraContext = additionalContext ? `\n\nCONTEXTO ADICIONAL DO OPERADOR:\n${additionalContext}` : '';

  return `Você é um advogado especialista em direito imobiliário e civil brasileiro.
Gere uma ${label} completa e profissional em português brasileiro, seguindo rigorosamente as normas do CPC (Código de Processo Civil).

## FATOS, PROVAS, DIREITO E NEXO CAUSAL (FPDN) EXTRAÍDOS DOS DOCUMENTOS

${factsSection}
${knowledgeSection}
${extraContext}

## INSTRUÇÕES DE FORMATAÇÃO

1. Use a estrutura formal de uma ${label}:
   - Endereçamento ao juízo competente
   - Qualificação das partes (use placeholders [NOME DO AUTOR], [CPF/CNPJ], etc.)
   - Dos Fatos
   - Do Direito (com citação de artigos de lei, jurisprudência e doutrina)
   - Do Nexo Causal (quando aplicável)
   - Dos Pedidos
   - Valor da causa
   - Requerimentos finais
2. Cite explicitamente os artigos de lei relevantes (CC, CPC, CF, leis especiais).
3. Quando houver jurisprudência de referência fornecida, cite-a de forma técnica.
4. Mantenha tom formal, técnico e objetivo.
5. NÃO invente fatos. Use SOMENTE os fatos e provas fornecidos acima.
6. Retorne APENAS o texto da peça, sem comentários ou explicações adicionais.`;
}

/**
 * Generate a legal petition (04-PECA) using Gemini AI.
 *
 * 1. Validates and fetches the source facts (FPDN).
 * 2. Optionally fetches related knowledge entries for jurisprudence context.
 * 3. Sends a structured prompt to Gemini.
 * 4. Saves the generated document and returns it.
 */
export async function generatePetition(
  input: GeneratePetitionInput
): Promise<GeneratePetitionResult> {
  const { tenantId, sourceFactIds, petitionType, generatedBy, additionalContext } = input;

  if (!tenantId) {
    throw new TenantRequiredError('generatePetition');
  }

  // --- 1. Validate facts (reuse existing validation) ---
  const validation = await validateFactsForGeneration(tenantId, sourceFactIds);
  if (!validation.valid) {
    if (validation.missingFactIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate petition: required facts not found: ${validation.missingFactIds.join(', ')}`,
        'MISSING_FACT'
      );
    }
    if (validation.nonApprovedDocumentIds.length > 0) {
      throw new GeneratedDocumentValidationError(
        `Cannot generate petition: source documents are not CPO-approved: ${validation.nonApprovedDocumentIds.join(', ')}`,
        'SOURCE_NOT_CPO_APPROVED'
      );
    }
  }

  // --- 2. Fetch facts ---
  const facts = await DocumentFactModel.findByIds(sourceFactIds, tenantId);
  const groupedFacts = groupFactsByType(facts);

  // --- 3. Fetch related knowledge entries (best-effort, non-blocking) ---
  let knowledgeTexts: string[] = [];
  let knowledgeCount = 0;
  try {
    const { entries } = await KnowledgeEntryModel.list(tenantId, {
      is_verified: true,
      limit: 5,
    });
    knowledgeCount = entries.length;
    knowledgeTexts = entries.map((e) => {
      const parts = [e.title];
      if (e.summary) parts.push(e.summary);
      if (e.key_legal_points.length > 0) parts.push(`Pontos-chave: ${e.key_legal_points.join('; ')}`);
      if (e.case_number) parts.push(`Processo: ${e.case_number}`);
      if (e.jurisdiction) parts.push(`Jurisdição: ${e.jurisdiction}`);
      return parts.join(' — ');
    });
  } catch (err) {
    logger.warn('Failed to fetch knowledge entries for petition generation; proceeding without them', { error: err });
  }

  // --- 4. Call Gemini AI ---
  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Cannot generate petition.');
  }

  const prompt = buildPetitionPrompt(petitionType, groupedFacts, knowledgeTexts, additionalContext);

  logger.info('Generating petition via Gemini AI', {
    petitionType,
    factCount: facts.length,
    knowledgeCount,
  });

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const petitionContent = response.text();

  if (!petitionContent || petitionContent.trim().length === 0) {
    throw new Error('Gemini returned empty content for petition generation.');
  }

  // --- 5. Save generated document ---
  const gen = await GeneratedDocumentModel.create({
    tenant_id: tenantId,
    content: petitionContent,
    generated_by: generatedBy,
    source_fact_ids: sourceFactIds,
  });

  logger.info('Petition generated successfully', {
    documentId: gen.id,
    petitionType,
    contentLength: petitionContent.length,
  });

  return {
    id: gen.id,
    content: petitionContent,
    factsUsed: facts.length,
    knowledgeEntriesUsed: knowledgeCount,
  };
}
