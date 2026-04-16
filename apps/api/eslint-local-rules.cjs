/**
 * Local ESLint rules — Spec §12 / Divergência #12
 * Warns when db.query() calls use SQL that references multi-tenant tables
 * but does NOT include a tenant_id filter.
 *
 * Usage in .eslintrc.json:
 *   "plugins": ["local-rules"],
 *   "rules": { "local-rules/require-tenant-id-in-query": "warn" }
 *
 * Requires: npm i -D eslint-plugin-local-rules
 */

'use strict';

// Tables that MUST be filtered by tenant_id
const TENANT_SCOPED_TABLES = [
  'documents',
  'legal_cases',
  'real_estate_assets',
  'financial_transactions',
  'auction_assets',
  'auction_bids',
  'document_facts',
  'quality_gate_results',
  'asset_listings',
  'override_events',
  'knowledge_entries',
  'quality_gates',
  'gate_checks',
  'accounts_payable',
  'accounts_receivable',
  'expense_capture',
  'investors',
  'investor_preferences',
  'crm_contacts',
  'crm_proposals',
  'asset_works',
  'asset_liabilities',
];

const TENANT_PATTERNS = [
  /tenant_id\s*=\s*\$\d+/i,   // tenant_id = $1
  /tenant_id\s*=\s*'[^']+'/i, // tenant_id = 'literal' (rare, should warn anyway)
  /AND\s+tenant_id/i,
  /WHERE\s+tenant_id/i,
];

function hasTenantId(sql) {
  return TENANT_PATTERNS.some((re) => re.test(sql));
}

function referencesTenantTable(sql) {
  const lower = sql.toLowerCase();
  return TENANT_SCOPED_TABLES.some((t) => lower.includes(t));
}

/** Extracts a static string value from an AST node, or null if dynamic. */
function extractStaticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') {
    // Concatenate only static quasis
    return node.quasis.map((q) => q.value.raw).join('');
  }
  return null;
}

module.exports = {
  rules: {
    'require-tenant-id-in-query': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'db.query() calls that reference tenant-scoped tables must include a tenant_id filter (Spec §12)',
          recommended: true,
        },
        schema: [],
        messages: {
          missingTenantId:
            'db.query() references tenant-scoped table "{{table}}" but SQL has no tenant_id filter. ' +
            'Add WHERE tenant_id = $N or AND tenant_id = $N (Spec §12 / multi-tenant isolation).',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            // Match: db.query(...)
            if (
              node.callee.type !== 'MemberExpression' ||
              node.callee.property.name !== 'query' ||
              !['db', 'pool', 'client'].includes(node.callee.object.name)
            ) {
              return;
            }

            const firstArg = node.arguments[0];
            const sql = extractStaticString(firstArg);
            if (!sql) return; // Can't statically analyse dynamic SQL

            if (!referencesTenantTable(sql)) return;
            if (hasTenantId(sql)) return;

            // Find which table triggered
            const lower = sql.toLowerCase();
            const table = TENANT_SCOPED_TABLES.find((t) => lower.includes(t)) ?? 'unknown';

            context.report({
              node: firstArg,
              messageId: 'missingTenantId',
              data: { table },
            });
          },
        };
      },
    },
  },
};
