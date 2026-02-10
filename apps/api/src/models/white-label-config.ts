import { db } from './database';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors';

export interface WhiteLabelConfig {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  logo_file_id: string | null;
  favicon_url: string | null;
  company_name: string | null;
  company_website: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  link_color: string | null;
  font_family: string | null;
  heading_font: string | null;
  custom_css: string | null;
  email_template_header_image_url: string | null;
  email_signature: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

export interface CreateWhiteLabelConfigInput {
  tenant_id: string;
  logo_url?: string;
  logo_file_id?: string;
  favicon_url?: string;
  company_name?: string;
  company_website?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  link_color?: string;
  font_family?: string;
  heading_font?: string;
  custom_css?: string;
  email_template_header_image_url?: string;
  email_signature?: string;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: Record<string, unknown>): WhiteLabelConfig {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    logo_url: (row.logo_url as string) ?? null,
    logo_file_id: (row.logo_file_id as string) ?? null,
    favicon_url: (row.favicon_url as string) ?? null,
    company_name: (row.company_name as string) ?? null,
    company_website: (row.company_website as string) ?? null,
    primary_color: (row.primary_color as string) ?? null,
    secondary_color: (row.secondary_color as string) ?? null,
    accent_color: (row.accent_color as string) ?? null,
    background_color: (row.background_color as string) ?? null,
    text_color: (row.text_color as string) ?? null,
    link_color: (row.link_color as string) ?? null,
    font_family: (row.font_family as string) ?? null,
    heading_font: (row.heading_font as string) ?? null,
    custom_css: (row.custom_css as string) ?? null,
    email_template_header_image_url: (row.email_template_header_image_url as string) ?? null,
    email_signature: (row.email_signature as string) ?? null,
    is_active: Boolean(row.is_active),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    updated_by: (row.updated_by as string) ?? null,
  };
}

/**
 * White Label Config Model
 * Manages white-label configuration per tenant
 */
export class WhiteLabelConfigModel {
  /**
   * Find config by tenant ID
   */
  static async findByTenantId(tenantId: string): Promise<WhiteLabelConfig | null> {
    requireTenantId(tenantId, 'WhiteLabelConfigModel.findByTenantId');
    
    const result: QueryResult<WhiteLabelConfig> = await db.query<WhiteLabelConfig>(
      `SELECT * FROM white_label_config 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Create or update white-label config
   */
  static async createOrUpdate(input: CreateWhiteLabelConfigInput, userId: string): Promise<WhiteLabelConfig> {
    requireTenantId(input.tenant_id, 'WhiteLabelConfigModel.createOrUpdate');
    
    // Check if config exists
    const existing = await this.findByTenantId(input.tenant_id);
    
    if (existing) {
      // Update existing config
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.logo_url !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(input.logo_url);
      }
      if (input.logo_file_id !== undefined) {
        updates.push(`logo_file_id = $${paramCount++}`);
        values.push(input.logo_file_id);
      }
      if (input.favicon_url !== undefined) {
        updates.push(`favicon_url = $${paramCount++}`);
        values.push(input.favicon_url);
      }
      if (input.company_name !== undefined) {
        updates.push(`company_name = $${paramCount++}`);
        values.push(input.company_name);
      }
      if (input.company_website !== undefined) {
        updates.push(`company_website = $${paramCount++}`);
        values.push(input.company_website);
      }
      if (input.primary_color !== undefined) {
        updates.push(`primary_color = $${paramCount++}`);
        values.push(input.primary_color);
      }
      if (input.secondary_color !== undefined) {
        updates.push(`secondary_color = $${paramCount++}`);
        values.push(input.secondary_color);
      }
      if (input.accent_color !== undefined) {
        updates.push(`accent_color = $${paramCount++}`);
        values.push(input.accent_color);
      }
      if (input.background_color !== undefined) {
        updates.push(`background_color = $${paramCount++}`);
        values.push(input.background_color);
      }
      if (input.text_color !== undefined) {
        updates.push(`text_color = $${paramCount++}`);
        values.push(input.text_color);
      }
      if (input.link_color !== undefined) {
        updates.push(`link_color = $${paramCount++}`);
        values.push(input.link_color);
      }
      if (input.font_family !== undefined) {
        updates.push(`font_family = $${paramCount++}`);
        values.push(input.font_family);
      }
      if (input.heading_font !== undefined) {
        updates.push(`heading_font = $${paramCount++}`);
        values.push(input.heading_font);
      }
      if (input.custom_css !== undefined) {
        updates.push(`custom_css = $${paramCount++}`);
        values.push(input.custom_css);
      }
      if (input.email_template_header_image_url !== undefined) {
        updates.push(`email_template_header_image_url = $${paramCount++}`);
        values.push(input.email_template_header_image_url);
      }
      if (input.email_signature !== undefined) {
        updates.push(`email_signature = $${paramCount++}`);
        values.push(input.email_signature);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${paramCount++}`);
      values.push(userId, existing.id, input.tenant_id);

      const result: QueryResult<WhiteLabelConfig> = await db.query<WhiteLabelConfig>(
        `UPDATE white_label_config 
         SET ${updates.join(', ')}
         WHERE id = $${paramCount++} AND tenant_id = $${paramCount++}
         RETURNING *`,
        values
      );

      return mapRow(result.rows[0]);
    } else {
      // Create new config
      const result: QueryResult<WhiteLabelConfig> = await db.query<WhiteLabelConfig>(
        `INSERT INTO white_label_config 
         (tenant_id, logo_url, logo_file_id, favicon_url, company_name, company_website,
          primary_color, secondary_color, accent_color, background_color, text_color,
          link_color, font_family, heading_font, custom_css, email_template_header_image_url,
          email_signature, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          input.tenant_id,
          input.logo_url || null,
          input.logo_file_id || null,
          input.favicon_url || null,
          input.company_name || null,
          input.company_website || null,
          input.primary_color || null,
          input.secondary_color || null,
          input.accent_color || null,
          input.background_color || null,
          input.text_color || null,
          input.link_color || null,
          input.font_family || null,
          input.heading_font || null,
          input.custom_css || null,
          input.email_template_header_image_url || null,
          input.email_signature || null,
          userId,
        ]
      );
      return mapRow(result.rows[0]);
    }
  }
}
