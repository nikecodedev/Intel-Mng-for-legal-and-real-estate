/**
 * Document Processor (QG1 – Hard Gates Segurança e Qualidade)
 *
 * - OCR Fallback: Se pdf-parse retornar pouco ou nenhum texto (PDF de imagem/escaneado),
 *   aciona o motor de OCR (Gemini Vision) para garantir documento legível no motor jurídico.
 * - Schema FPDN estrito: JSON de saída com chaves obrigatórias fatos, provas (com referência
 *   de página), direito (citações de lei) e nexo_causal. Não utiliza o termo genérico
 *   "Argumentação".
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

/** Mínimo de caracteres para considerar o texto extraído válido (evita PDF só de imagem). */
const MIN_TEXT_LENGTH = 200;
/** Mínimo de palavras para considerar o texto extraído válido. */
const MIN_WORDS = 50;

/** Resultado da extração de texto (com indicação de uso de OCR fallback). */
export interface ExtractedTextResult {
  text: string;
  usedOcrFallback: boolean;
  pageCount?: number;
}

/** Prova com referência de página (schema FPDN). */
export interface ProvaFPDN {
  texto: string;
  pagina?: number;
}

/** Estrutura FPDN obrigatória para auditoria (QG1). */
export interface FPDNOutput {
  fatos: string[];
  provas: ProvaFPDN[];
  direito: string;
  nexo_causal: string;
}

type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

let cachedPdfParse: PdfParseFn | null = null;

/** Carrega e cacheia pdf-parse (CommonJS) para evitar import repetido. */
async function getPdfParse(): Promise<PdfParseFn> {
  if (cachedPdfParse) return cachedPdfParse;
  const mod = await import('pdf-parse');
  cachedPdfParse = mod.default ?? (mod as unknown as PdfParseFn);
  return cachedPdfParse;
}

/**
 * Extrai texto do PDF via pdf-parse. Se o texto for insuficiente (PDF de imagem/escaneado),
 * aciona o motor de OCR (Gemini Vision) para garantir leitura.
 */
export async function extractTextFromPdf(filePath: string): Promise<ExtractedTextResult> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const buffer = fs.readFileSync(absolutePath);

  const pdfParse = await getPdfParse();
  const { text: rawText, numpages } = await pdfParse(buffer);

  const trimmed = (rawText ?? '').trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length;
  const hasEnoughText =
    trimmed.length >= MIN_TEXT_LENGTH && wordCount >= MIN_WORDS;

  if (hasEnoughText) {
    logger.info('Document processor: text from pdf-parse sufficient', {
      path: absolutePath,
      length: trimmed.length,
      words: wordCount,
    });
    return { text: trimmed, usedOcrFallback: false, pageCount: numpages };
  }

  logger.info('Document processor: little or no text from pdf-parse, triggering OCR (Vision) fallback', {
    path: absolutePath,
    length: trimmed.length,
    words: wordCount,
    minLength: MIN_TEXT_LENGTH,
    minWords: MIN_WORDS,
  });

  const visionText = await extractTextWithGeminiVision(absolutePath, buffer);
  const fallbackText = (visionText ?? trimmed).trim() || trimmed;

  return {
    text: fallbackText,
    usedOcrFallback: true,
    pageCount: numpages,
  };
}

/**
 * Usa Gemini Vision para extrair texto do PDF (OCR fallback para documentos escaneados).
 */
async function extractTextWithGeminiVision(filePath: string, pdfBuffer: Buffer): Promise<string | null> {
  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    logger.warn('Document processor: GEMINI_API_KEY not set; OCR Vision fallback skipped');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const base64 = pdfBuffer.toString('base64');

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64,
        },
      },
      {
        text: 'Extraia todo o texto deste documento PDF, preservando parágrafos e quebras de linha. ' +
          'Retorne apenas o texto extraído, sem comentários ou explicações. ' +
          'Se o documento for escaneado ou em imagem, transcreva o conteúdo legível.',
      },
    ]);

    const response = result.response;
    const text = response.text?.()?.trim() ?? null;
    if (text) {
      logger.info('Document processor: OCR Vision fallback succeeded', { path: filePath, length: text.length });
    }
    return text;
  } catch (err) {
    logger.error('Document processor: OCR Vision fallback failed', { path: filePath, error: err });
    return null;
  }
}

/** System prompt para schema FPDN estrito (QG1). Não usar "Argumentação". */
const FPDN_SYSTEM_PROMPT = `Você é um assistente jurídico. Sua tarefa é analisar o texto do documento e produzir um ÚNICO objeto JSON, sem texto adicional antes ou depois, com exatamente as seguintes chaves obrigatórias:

1. "fatos": array de strings. Cada elemento é um fato relevante extraído do documento.
2. "provas": array de objetos. Cada objeto deve ter:
   - "texto": string (trecho ou descrição da prova)
   - "pagina": number (número da página de referência, quando aplicável)
3. "direito": string. Citações de lei, artigos e fundamentação jurídica aplicável.
4. "nexo_causal": string. Exposição do nexo causal entre fatos, provas e direito.

NÃO use a chave "Argumentação" nem termos genéricos que substituam as chaves acima. O JSON deve conter somente: fatos, provas, direito e nexo_causal.`;

/**
 * Estrutura o texto do documento no schema FPDN (fatos, provas com página, direito, nexo_causal).
 * Atende ao padrão de auditoria QG1; não utiliza "Argumentação".
 */
export async function structureAsFPDN(documentText: string): Promise<FPDNOutput | null> {
  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    logger.warn('Document processor: GEMINI_API_KEY not set; FPDN structuring skipped');
    return null;
  }

  if (!documentText?.trim()) {
    logger.warn('Document processor: empty document text; cannot structure FPDN');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: FPDN_SYSTEM_PROMPT,
    });

    const result = await model.generateContent(
      'Analise o texto abaixo e retorne um único objeto JSON com as chaves obrigatórias: fatos (array), provas (array de objetos com "texto" e "pagina"), direito (string), nexo_causal (string). Nada mais.\n\n' +
      '---\n' +
      documentText.slice(0, 100000)
    );

    const raw = result.response.text?.()?.trim() ?? '';
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const fatos = Array.isArray(parsed.fatos) ? (parsed.fatos as string[]) : [];
    const provasRaw = Array.isArray(parsed.provas) ? parsed.provas : [];
    const provas: ProvaFPDN[] = provasRaw.map((p: unknown) => {
      const o = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
      return {
        texto: String(o.texto ?? o.text ?? ''),
        pagina: typeof o.pagina === 'number' ? o.pagina : undefined,
      };
    });
    const direito = String(parsed.direito ?? '');
    const nexo_causal = String(parsed.nexo_causal ?? '');

    const output: FPDNOutput = { fatos, provas, direito, nexo_causal };
    logger.info('Document processor: FPDN structure generated', {
      fatosCount: fatos.length,
      provasCount: provas.length,
    });
    return output;
  } catch (err) {
    logger.error('Document processor: FPDN structuring failed', { error: err });
    return null;
  }
}
