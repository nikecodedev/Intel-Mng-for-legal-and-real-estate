import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validator.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { db } from '../models/database.js';

const router = Router();

/**
 * GET /partner-offices
 * List all partner offices for the tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const { status, search } = req.query;

    let query = `
      SELECT * FROM partner_offices
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `;
    const params: (string | number)[] = [tenantId];

    if (status) {
      params.push(status as string);
      query += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR responsible_name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }

    query += ' ORDER BY name ASC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: { offices: result.rows, total: result.rowCount },
    });
  })
);

/**
 * GET /partner-offices/:id
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM partner_offices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: { message: 'Escritório não encontrado.' } });
      return;
    }

    res.json({ success: true, data: { office: result.rows[0] } });
  })
);

/**
 * POST /partner-offices
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const {
      name, cnpj, email, phone, address, city, state,
      responsible_name, responsible_email, specialty, notes,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, error: { message: 'Nome é obrigatório.' } });
      return;
    }

    const result = await db.query(
      `INSERT INTO partner_offices
         (tenant_id, name, cnpj, email, phone, address, city, state,
          responsible_name, responsible_email, specialty, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [tenantId, name.trim(), cnpj || null, email || null, phone || null,
       address || null, city || null, state || null,
       responsible_name || null, responsible_email || null,
       specialty || null, notes || null]
    );

    res.status(201).json({ success: true, data: { office: result.rows[0] } });
  })
);

/**
 * PATCH /partner-offices/:id
 */
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;
    const {
      name, cnpj, email, phone, address, city, state,
      responsible_name, responsible_email, specialty, notes, status,
    } = req.body;

    const result = await db.query(
      `UPDATE partner_offices
       SET name = COALESCE($3, name),
           cnpj = COALESCE($4, cnpj),
           email = COALESCE($5, email),
           phone = COALESCE($6, phone),
           address = COALESCE($7, address),
           city = COALESCE($8, city),
           state = COALESCE($9, state),
           responsible_name = COALESCE($10, responsible_name),
           responsible_email = COALESCE($11, responsible_email),
           specialty = COALESCE($12, specialty),
           notes = COALESCE($13, notes),
           status = COALESCE($14, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId, name, cnpj, email, phone, address, city, state,
       responsible_name, responsible_email, specialty, notes, status]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: { message: 'Escritório não encontrado.' } });
      return;
    }

    res.json({ success: true, data: { office: result.rows[0] } });
  })
);

/**
 * DELETE /partner-offices/:id  (soft delete)
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const { id } = req.params;

    await db.query(
      `UPDATE partner_offices SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );

    res.json({ success: true, message: 'Escritório removido.' });
  })
);

export default router;
