import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { DocumentModel } from '../models/document';
import { DocumentExtractionModel, ExtractedParty, ExtractedMonetaryValue, ExtractedDate } from '../models/document-extraction';
import { DocumentQualityFlagModel, QualityFlagType, FlagSeverity } from '../models/document-quality-flag';
import { DocumentFactModel, CreateDocumentFactInput } from '../models/document-fact';
import { extractTextFromPdf } from './document-processor';

/**
 * Quality control thresholds (GEMS compliance)
 */
const DPI_MINIMUM = 300; // Ref. Fontes 78 e 79
const OCR_CONFIDENCE_MINIMUM = 95.0; // Ref. Fonte 3

/**
 * OCR processing result from Python service
 */
interface OCRProcessingResult {
  tenant_id: string;
  arquivo: string;
  timestamp: string;
  processamento: {
    status: string;
    validacao_cpo: {
      tenant_id: string;
      arquivo: string;
      timestamp: string;
      status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO';
      validacoes: {
        dpi: {
          aprovado: boolean;
          dpi_detectado: number | null;
          dpi_minimo_requerido: number;
          mensagem: string;
        };
        ocr_confidence: {
          aprovado: boolean;
          confianca_media: number | null;
          confianca_minima_requerida: number;
          mensagem: string;
        };
      };
      erros: Array<{ tipo: string; mensagem: string }>;
      revisao_necessaria: boolean;
    };
  };
  erros: Array<{ tipo: string; mensagem: string }>;
}

/**
 * Field extraction result
 */
interface FieldExtractionResult {
  process_number: string | null;
  court: string | null;
  court_type: string | null;
  court_state: string | null;
  parties: ExtractedParty[];
  monetary_values: ExtractedMonetaryValue[];
  extracted_dates: ExtractedDate[];
  overall_confidence: number;
  field_confidences: Record<string, number>;
  warnings: string[];
}

/**
 * Document processing result
 */
export interface DocumentProcessingResult {
  success: boolean;
  document_id: string;
  extraction_id?: string;
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO';
  dpi_result: {
    passed: boolean;
    detected: number | null;
    required: number;
    message: string;
  };
  ocr_result: {
    passed: boolean;
    confidence: number | null;
    required: number;
    message: string;
  };
  extraction: FieldExtractionResult | null;
  quality_flags: string[];
  in_sanitation_queue: boolean;
  errors: string[];
}

/**
 * Document Extraction Service
 * Handles OCR processing, field extraction, and quality control
 */
export class DocumentExtractionService {
  private pythonServicePath: string;

  constructor() {
    // Path to Python document processor
    this.pythonServicePath = path.resolve(
      __dirname,
      '../../../../services/intelligence/src/services/processador_documentos_v3.py'
    );
  }

  /**
   * Calculate SHA-256 hash of file
   */
  static calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Process a document: OCR, quality control, and field extraction
   */
  async processDocument(
    tenantId: string,
    documentId: string,
    filePath: string,
    processedBy?: string
  ): Promise<DocumentProcessingResult> {
    logger.info('Starting document processing', { tenantId, documentId, filePath });

    const result: DocumentProcessingResult = {
      success: false,
      document_id: documentId,
      status_cpo: 'VERMELHO',
      dpi_result: {
        passed: false,
        detected: null,
        required: DPI_MINIMUM,
        message: '',
      },
      ocr_result: {
        passed: false,
        confidence: null,
        required: OCR_CONFIDENCE_MINIMUM,
        message: '',
      },
      extraction: null,
      quality_flags: [],
      in_sanitation_queue: false,
      errors: [],
    };

    try {
      // Step 1: Run Python OCR processor
      const ocrResult = await this.runOCRProcessor(tenantId, filePath);
      
      if (!ocrResult) {
        result.errors.push('OCR processing failed');
        await this.createQualityFlag(tenantId, documentId, 'OCR_FAILED', 'ERROR', 'OCR processing failed completely');
        result.in_sanitation_queue = true;
        return result;
      }

      const cpoValidation = ocrResult.processamento?.validacao_cpo;
      
      // Step 2: Process DPI result
      if (cpoValidation?.validacoes?.dpi) {
        const dpiResult = cpoValidation.validacoes.dpi;
        result.dpi_result = {
          passed: dpiResult.aprovado,
          detected: dpiResult.dpi_detectado,
          required: dpiResult.dpi_minimo_requerido,
          message: dpiResult.mensagem,
        };

        // Update document DPI info
        await DocumentModel.updateDPI(documentId, tenantId, {
          dpi_processed: true,
          dpi_resolution: dpiResult.dpi_detectado || undefined,
        });

        // Create quality flag if DPI is low
        if (!dpiResult.aprovado) {
          const flagType: QualityFlagType = dpiResult.dpi_detectado === null ? 'DPI_UNDETECTABLE' : 'DPI_LOW';
          const severity: FlagSeverity = dpiResult.dpi_detectado === null ? 'ERROR' : 'WARNING';
          
          await this.createQualityFlag(
            tenantId,
            documentId,
            flagType,
            severity,
            dpiResult.mensagem,
            { detected_dpi: dpiResult.dpi_detectado, required_dpi: DPI_MINIMUM },
            DPI_MINIMUM,
            dpiResult.dpi_detectado || undefined
          );
          result.quality_flags.push(flagType);
          result.in_sanitation_queue = true;
        }
      }

      // Step 3: Process OCR confidence result
      if (cpoValidation?.validacoes?.ocr_confidence) {
        const ocrConfResult = cpoValidation.validacoes.ocr_confidence;
        result.ocr_result = {
          passed: ocrConfResult.aprovado,
          confidence: ocrConfResult.confianca_media,
          required: ocrConfResult.confianca_minima_requerida,
          message: ocrConfResult.mensagem,
        };

        // Update document OCR info
        await DocumentModel.updateOCR(documentId, tenantId, {
          ocr_processed: true,
          ocr_confidence: ocrConfResult.confianca_media || undefined,
          ocr_engine: 'tesseract',
        });

        // Create quality flag if OCR confidence is low
        if (!ocrConfResult.aprovado) {
          const flagType: QualityFlagType = ocrConfResult.confianca_media === null ? 'OCR_FAILED' : 'OCR_CONFIDENCE_LOW';
          const severity: FlagSeverity = ocrConfResult.confianca_media === null ? 'ERROR' : 'WARNING';
          
          await this.createQualityFlag(
            tenantId,
            documentId,
            flagType,
            severity,
            ocrConfResult.mensagem,
            { confidence: ocrConfResult.confianca_media, required_confidence: OCR_CONFIDENCE_MINIMUM },
            OCR_CONFIDENCE_MINIMUM,
            ocrConfResult.confianca_media || undefined
          );
          result.quality_flags.push(flagType);
          result.in_sanitation_queue = true;
        }
      }

      // Step 4: Determine CPO status
      result.status_cpo = cpoValidation?.status_cpo || 'VERMELHO';
      
      // Update document CPO status
      await DocumentModel.updateCPO(documentId, tenantId, {
        status_cpo: result.status_cpo,
        cpo_notes: cpoValidation?.revisao_necessaria ? 'Requires manual review' : undefined,
        cpo_approval_required: result.status_cpo !== 'VERDE',
      });

      // Step 5: Extract structured fields (only if OCR was successful)
      // QG1: use document-processor for text (pdf-parse + OCR Vision fallback for image/scanned PDFs)
      if (result.ocr_result.confidence && result.ocr_result.confidence >= 50) {
        try {
          const { text: fullText, usedOcrFallback } = await extractTextFromPdf(filePath);
          if (usedOcrFallback) {
            result.quality_flags.push('OCR_VISION_FALLBACK_USED');
          }
          const extraction = await this.extractFields(tenantId, documentId, filePath, result.ocr_result.confidence, fullText);
          result.extraction = extraction;

          // Create extraction record
          const extractionRecord = await DocumentExtractionModel.create({
            tenant_id: tenantId,
            document_id: documentId,
            process_number: extraction.process_number || undefined,
            court: extraction.court || undefined,
            court_type: extraction.court_type || undefined,
            court_state: extraction.court_state || undefined,
            parties: extraction.parties,
            monetary_values: extraction.monetary_values,
            extracted_dates: extraction.extracted_dates,
            overall_confidence: extraction.overall_confidence,
            field_confidences: extraction.field_confidences,
            extraction_warnings: extraction.warnings,
            processed_by: processedBy,
          });

          result.extraction_id = extractionRecord.id;

          // Populate document_facts for legal traceability (proof lineage)
          await this.upsertDocumentFacts(tenantId, documentId, extraction);

          // Check for extraction issues
          if (extraction.warnings.length > 0) {
            await this.createQualityFlag(
              tenantId,
              documentId,
              'EXTRACTION_INCOMPLETE',
              'INFO',
              `Extraction completed with warnings: ${extraction.warnings.join(', ')}`,
              { warnings: extraction.warnings }
            );
          }
        } catch (extractionError) {
          logger.error('Field extraction failed', { error: extractionError, documentId });
          await this.createQualityFlag(
            tenantId,
            documentId,
            'EXTRACTION_FAILED',
            'WARNING',
            `Field extraction failed: ${extractionError instanceof Error ? extractionError.message : 'Unknown error'}`
          );
          result.quality_flags.push('EXTRACTION_FAILED');
        }
      }

      result.success = result.status_cpo === 'VERDE';
      logger.info('Document processing completed', { documentId, status_cpo: result.status_cpo, success: result.success });

    } catch (error) {
      logger.error('Document processing error', { error, documentId });
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Run the Python OCR processor
   */
  private async runOCRProcessor(tenantId: string, filePath: string): Promise<OCRProcessingResult | null> {
    return new Promise((resolve) => {
      const args = [this.pythonServicePath, filePath, tenantId];
      const pythonProcess = spawn('python', args, {
        cwd: path.dirname(this.pythonServicePath),
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug('Python OCR stderr', { data: data.toString() });
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          logger.error('Python OCR process exited with error', { code, stderr });
          resolve(null);
          return;
        }

        try {
          // Parse the JSON output
          const result = JSON.parse(stdout) as OCRProcessingResult;
          resolve(result);
        } catch (parseError) {
          logger.error('Failed to parse OCR result', { error: parseError, stdout });
          resolve(null);
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Failed to spawn Python OCR process', { error });
        resolve(null);
      });
    });
  }

  /**
   * Extract structured fields from document
   */
  private async extractFields(
    tenantId: string,
    documentId: string,
    filePath: string,
    ocrConfidence: number,
    fullText: string = ''
  ): Promise<FieldExtractionResult> {
    const result: FieldExtractionResult = {
      process_number: null,
      court: null,
      court_type: null,
      court_state: null,
      parties: [],
      monetary_values: [],
      extracted_dates: [],
      overall_confidence: ocrConfidence,
      field_confidences: {},
      warnings: [],
    };

    try {
      // QG1: fullText from document-processor (pdf-parse + OCR Vision fallback when needed)
      result.process_number = this.extractProcessNumber(fullText);
      result.parties = this.extractParties(fullText);
      result.monetary_values = this.extractMonetaryValues(fullText);
      result.extracted_dates = this.extractDates(fullText);

      // Calculate field confidences based on extraction success
      result.field_confidences = {
        process_number: result.process_number ? ocrConfidence * 0.95 : 0,
        parties: result.parties.length > 0 ? ocrConfidence * 0.85 : 0,
        monetary_values: result.monetary_values.length > 0 ? ocrConfidence * 0.90 : 0,
        dates: result.extracted_dates.length > 0 ? ocrConfidence * 0.88 : 0,
      };

      if (!result.process_number) {
        result.warnings.push('Could not extract process number');
      }
      if (result.parties.length === 0) {
        result.warnings.push('Could not extract parties');
      }

    } catch (error) {
      logger.error('Field extraction error', { error, documentId });
      result.warnings.push('Field extraction encountered errors');
    }

    return result;
  }

  /**
   * Extract Brazilian process number from text
   */
  private extractProcessNumber(text: string): string | null {
    // Brazilian legal process number format: NNNNNNN-DD.AAAA.J.TR.OOOO
    const processNumberRegex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
    const matches = text.match(processNumberRegex);
    return matches ? matches[0] : null;
  }

  /**
   * Extract parties from text
   */
  private extractParties(text: string): ExtractedParty[] {
    // TODO: Implement NER-based party extraction
    // For now, return empty array
    return [];
  }

  /**
   * Extract monetary values from text
   */
  private extractMonetaryValues(text: string): ExtractedMonetaryValue[] {
    // Brazilian currency patterns: R$ X.XXX,XX or R$X.XXX,XX
    const monetaryRegex = /R\$\s*[\d.,]+/gi;
    const matches = text.match(monetaryRegex);
    
    if (!matches) return [];

    return matches.map((match, index) => {
      // Parse Brazilian number format (1.000,50 -> 1000.50)
      const valueStr = match.replace('R$', '').trim();
      const normalizedValue = valueStr.replace(/\./g, '').replace(',', '.');
      const value = parseFloat(normalizedValue);

      return {
        type: 'other' as const,
        value: isNaN(value) ? 0 : value,
        currency: 'BRL',
        description: `Value ${index + 1}`,
      };
    });
  }

  /**
   * Extract dates from text
   */
  private extractDates(text: string): ExtractedDate[] {
    // Brazilian date format: DD/MM/YYYY
    const dateRegex = /\d{2}\/\d{2}\/\d{4}/g;
    const matches = text.match(dateRegex);
    
    if (!matches) return [];

    return matches.map((match, index) => {
      // Convert DD/MM/YYYY to ISO date
      const [day, month, year] = match.split('/');
      const isoDate = `${year}-${month}-${day}`;

      return {
        type: 'other' as const,
        date: isoDate,
        description: `Date ${index + 1}`,
      };
    });
  }

  /**
   * Upsert document_facts from extraction result for proof lineage.
   * Replaces all facts for the document (delete then insert).
   */
  private async upsertDocumentFacts(
    tenantId: string,
    documentId: string,
    extraction: FieldExtractionResult
  ): Promise<void> {
    await DocumentFactModel.deleteByDocumentId(documentId, tenantId);
    const conf = extraction.field_confidences ?? {};
    const pageNumber = 1; // Default when OCR does not provide per-page
    const inputs: CreateDocumentFactInput[] = [];

    if (extraction.process_number) {
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'process_number',
        fact_value: extraction.process_number,
        page_number: pageNumber,
        confidence_score: conf.process_number ?? extraction.overall_confidence ?? null,
      });
    }
    if (extraction.court) {
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'court',
        fact_value: extraction.court,
        page_number: pageNumber,
        confidence_score: conf.court ?? extraction.overall_confidence ?? null,
      });
    }
    if (extraction.court_type) {
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'court_type',
        fact_value: extraction.court_type,
        page_number: pageNumber,
        confidence_score: extraction.overall_confidence ?? null,
      });
    }
    if (extraction.court_state) {
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'court_state',
        fact_value: extraction.court_state,
        page_number: pageNumber,
        confidence_score: extraction.overall_confidence ?? null,
      });
    }
    for (let i = 0; i < extraction.parties.length; i++) {
      const p = extraction.parties[i];
      const value = `${p.name}${p.role ? ` (${p.role})` : ''}${p.cpf_cnpj ? ` [${p.cpf_cnpj}]` : ''}`;
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'party',
        fact_value: value,
        page_number: pageNumber,
        confidence_score: conf.parties ?? extraction.overall_confidence ?? null,
      });
    }
    for (let i = 0; i < extraction.monetary_values.length; i++) {
      const m = extraction.monetary_values[i];
      const value = `${m.currency} ${m.value}${m.description ? ` - ${m.description}` : ''}`;
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'monetary_value',
        fact_value: value,
        page_number: pageNumber,
        confidence_score: conf.monetary_values ?? extraction.overall_confidence ?? null,
      });
    }
    for (let i = 0; i < extraction.extracted_dates.length; i++) {
      const d = extraction.extracted_dates[i];
      const value = `${d.date}${d.description ? ` - ${d.description}` : ''} (${d.type})`;
      inputs.push({
        tenant_id: tenantId,
        document_id: documentId,
        fact_type: 'date',
        fact_value: value,
        page_number: pageNumber,
        confidence_score: conf.dates ?? extraction.overall_confidence ?? null,
      });
    }

    if (inputs.length > 0) {
      await DocumentFactModel.createMany(inputs);
      logger.info('Document facts populated', { documentId, tenantId, count: inputs.length });
    }
  }

  /**
   * Create a quality flag for a document
   */
  private async createQualityFlag(
    tenantId: string,
    documentId: string,
    flagType: QualityFlagType,
    severity: FlagSeverity,
    message: string,
    details?: Record<string, unknown>,
    threshold?: number,
    actual?: number
  ): Promise<void> {
    try {
      await DocumentQualityFlagModel.create({
        tenant_id: tenantId,
        document_id: documentId,
        flag_type: flagType,
        flag_code: flagType.toLowerCase(),
        severity,
        flag_message: message,
        flag_details: details,
        threshold_value: threshold,
        actual_value: actual,
      });
      logger.info('Quality flag created', { tenantId, documentId, flagType, severity });
    } catch (error) {
      logger.error('Failed to create quality flag', { error, tenantId, documentId, flagType });
    }
  }

  /**
   * Reprocess a document (after resolution)
   */
  async reprocessDocument(
    tenantId: string,
    documentId: string,
    filePath: string,
    processedBy: string
  ): Promise<DocumentProcessingResult> {
    logger.info('Reprocessing document', { tenantId, documentId });

    // Delete existing extraction if any
    const existingExtraction = await DocumentExtractionModel.findByDocumentId(documentId, tenantId);
    if (existingExtraction) {
      await DocumentExtractionModel.markForReprocessing(existingExtraction.id, tenantId);
    }

    // Process document again
    return this.processDocument(tenantId, documentId, filePath, processedBy);
  }

  /**
   * Check if a document is a duplicate based on file hash
   */
  async checkDuplicate(tenantId: string, fileHash: string): Promise<{ isDuplicate: boolean; existingDocumentId?: string }> {
    const existing = await DocumentModel.findByFileHash(fileHash, tenantId);
    
    if (existing) {
      return { isDuplicate: true, existingDocumentId: existing.id };
    }
    
    return { isDuplicate: false };
  }
}

// Export singleton instance
export const documentExtractionService = new DocumentExtractionService();
