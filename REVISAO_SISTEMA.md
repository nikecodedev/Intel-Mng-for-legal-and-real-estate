# Revisão Geral do Sistema — Intel Management Platform
**Data:** 16 de Abril de 2026  
**Versão:** pré-auditoria  
**Preparado por:** Equipe de Desenvolvimento

---

## 1. Visão Geral

Plataforma SaaS multi-tenant para gestão jurídica e de ativos imobiliários. Arquitetura:

- **Backend:** Express.js + TypeScript (ESM) — 150+ endpoints, 17 módulos de rotas, 31 serviços
- **Frontend:** Next.js 14 (App Router) — 81 páginas verificadas, 79 funcionais
- **Banco de dados:** PostgreSQL com RLS multi-tenant — 57 migrations aplicadas
- **Infra:** Redis (cache + filas), Bull (jobs assíncronos), PM2, Docker, Nginx

---

## 2. Estado dos Módulos

### ✅ 2.1 Autenticação e Segurança
| Funcionalidade | Estado | Observação |
|---|---|---|
| Login / Logout / Refresh token | ✅ Funcional | JWT 15min access + 7d refresh |
| Registro de utilizador | ✅ Funcional | Vinculado ao tenant |
| Recuperação de password | ✅ Funcional | Token por email |
| MFA TOTP (app autenticadora) | ✅ Funcional | Setup + verificação |
| MFA SMS (OTP 6 dígitos) | ✅ Funcional | Provider Twilio / stub |
| Sessão MFA obrigatória 8h | ✅ Funcional | Middleware bloqueia se expirado |
| RBAC (OWNER / REVISOR / OPERATIONAL) | ✅ Funcional | Permissões granulares por rota |
| Rate limiting (Redis) | ✅ Funcional | Por IP e por utilizador |
| Auditoria de todas as ações | ✅ Funcional | Hash chain imutável |

---

### ✅ 2.2 Módulo Jurídico (Legal)
| Funcionalidade | Estado | Observação |
|---|---|---|
| Upload de documentos | ✅ Funcional | Multipart, validação DPI/OCR |
| Extração via IA (Gemini OCR) | ✅ Funcional | Job assíncrono |
| Viewer de documentos com marca d'água | ✅ Funcional | Token HMAC-SHA256, TTL 15min |
| Marca d'água: email, IP, tenant_id, timestamp | ✅ Funcional | Opacidade 0.15 (corrigida) |
| Listagem e filtros de documentos | ✅ Funcional | Status, tipo, paginação |
| Fila de saneamento de documentos | ✅ Funcional | Resolução de flags de qualidade |
| Correções manuais de extração | ✅ Funcional | |
| Geração de documentos (minutas/petições) | ✅ Funcional | Gerado a partir de factos extraídos |
| Revisão e aprovação de gerados | ✅ Funcional | Fluxo approve/reject |
| Linhagem de factos (jump-back) | ✅ Funcional | |
| **Casos jurídicos — CRUD completo** | ✅ Funcional | |
| **CPO enforcement: OCR ≥ 95%, DPI ≥ 300** | ✅ Funcional | Bloqueio no intake (Bug #4 corrigido) |
| **QG4: bloqueio ≥ 90% para transição** | ✅ Funcional | Trigger DB + app-level (Bug #5 corrigido) |
| FPDN — análise facto/prova/lei | ✅ Funcional | |
| Prazos e agenda jurídica | ✅ Funcional | |
| Redação assistida por IA | ✅ Funcional | |
| Arquivo / restauro de documentos | ✅ Funcional | Soft delete |

---

### ✅ 2.3 Módulo de Ativos Imobiliários
| Funcionalidade | Estado | Observação |
|---|---|---|
| CRUD de ativos | ✅ Funcional | |
| State machine de estados | ✅ Funcional | ADQUIRIDO → REGULARIZACAO → REFORMA → PRONTO → VENDIDO/ALUGADO |
| Gestão de custos por ativo | ✅ Funcional | |
| Resumo financeiro do ativo | ✅ Funcional | |
| Monitoramento de vacância | ✅ Funcional | |
| Obras e reformas | ✅ Funcional | |
| Passivos e encargos | ✅ Funcional | |
| Detalhes comerciais e listagem | ✅ Funcional | |
| Informações jurídicas do ativo | ✅ Funcional | |
| Encerramento do ativo | ✅ Funcional | Bloqueado se há passivos abertos |
| **legal_hold — bloqueia listagem** | ✅ Funcional | DB trigger + API endpoint (Bug #7 corrigido) |
| **trava_venda — bloqueia listagem** | ✅ Funcional | DB trigger + API endpoint (Bug #7 corrigido) |
| Matrícula: EM_ANALISE / COM_ONUS bloqueiam | ✅ Funcional | DB trigger |

---

### ✅ 2.4 Módulo Financeiro
| Funcionalidade | Estado | Observação |
|---|---|---|
| Transações (PAYABLE, RECEIVABLE, EXPENSE, INCOME, TRANSFER) | ✅ Funcional | |
| **Aprovação obrigatória acima de R$5.000 (OWNER)** | ✅ Funcional | Bug #2 corrigido |
| Assinatura digital (password ou OTP) | ✅ Funcional | Para aprovação e pagamento |
| **Transação obriga vínculo (processo ou imóvel)** | ✅ Funcional | Bug #8 corrigido |
| Contas a pagar | ✅ Funcional | |
| Contas a receber | ✅ Funcional | |
| Captura de despesas | ✅ Funcional | Com OCR de recibo |
| Despesas mobile (GPS, câmara, OCR) | ✅ Funcional | |
| Reconciliação bancária (OFX/CSV) | ✅ Funcional | Import + auto-match |
| ROI por ativo | ✅ Funcional | Cálculo versionado |
| Tesouraria (contas e saldos) | ✅ Funcional | |
| Relatórios financeiros (DRE, fluxo de caixa) | ✅ Funcional | Export PDF |

---

### ✅ 2.5 Módulo de Leilões
| Funcionalidade | Estado | Observação |
|---|---|---|
| Pipeline de estágios F0 → F9 | ✅ Funcional | |
| Due diligence checklist | ✅ Funcional | |
| **MPGA hard gate (certidões + risk score)** | ✅ Funcional | DB trigger (Bugs #3/#6 corrigidos) |
| **Campo mpga_risk_score dedicado** | ✅ Funcional | Bug #6 corrigido |
| Colocação de lances | ✅ Funcional | |
| Autorização de lance (F3) com OTP | ✅ Funcional | |
| Override de lance (OWNER + TOTP) | ✅ Funcional | Auditado |
| ROI de leilão (versões) | ✅ Funcional | |
| Radar de oportunidades | ✅ Funcional | |
| Histórico de leilões | ✅ Funcional | |
| Gestão pós-lance (F4) | ✅ Funcional | |

---

### ✅ 2.6 CRM e Matching de Investidores
| Funcionalidade | Estado | Observação |
|---|---|---|
| CRUD de investidores | ✅ Funcional | |
| Perfil KYC do investidor | ✅ Funcional | |
| Preferências de investimento | ✅ Funcional | |
| Motor de matching | ✅ Funcional | Score de compatibilidade |
| Pesquisa e scoring de investidores | ✅ Funcional | |
| Propostas de investimento | ✅ Funcional | Approve/reject |

---

### ✅ 2.7 Base de Conhecimento
| Funcionalidade | Estado | Observação |
|---|---|---|
| Artigos e entradas de conhecimento | ✅ Funcional | |
| Pesquisa full-text | ✅ Funcional | |
| Templates de documentos | ✅ Funcional | Com métricas de uso |
| Teses jurídicas | ✅ Funcional | Ativas/obsoletas |
| Import em massa | ⚠️ Parcial | API existe, frontend sem UI |
| Histórico de versões | ✅ Funcional | |

---

### ✅ 2.8 Qualidade e Compliance
| Funcionalidade | Estado | Observação |
|---|---|---|
| Quality Gates (QG1–QG4) — CRUD | ✅ Funcional | |
| Avaliação e resultados | ✅ Funcional | |
| Teste de procedibilidade | ✅ Funcional | |
| Override de QG (auditado) | ✅ Funcional | |
| Audit trail com hash chain | ✅ Funcional | Verificação de integridade |
| Override events (auditados) | ✅ Funcional | Página admin dedicada |

---

### ✅ 2.9 Inteligência Artificial
| Funcionalidade | Estado | Observação |
|---|---|---|
| Validação por IA | ✅ Funcional | |
| Sugestões por IA | ✅ Funcional | |
| **Persona Auditor Estratégico (framework CLEAR)** | ✅ Funcional | Bug #11 corrigido |
| **Antiloop — proteção contra output repetitivo** | ✅ Funcional | Bug #11 corrigido |
| Análise contextual (POST /analyze) | ✅ Funcional | |
| Override de decisão IA | ✅ Funcional | |

---

### ✅ 2.10 Workflow e Automação
| Funcionalidade | Estado | Observação |
|---|---|---|
| Instâncias de workflow | ✅ Funcional | |
| Tarefas com transições de estado | ✅ Funcional | |
| Triggers automáticos | ✅ Funcional | |
| Criar/editar triggers | ✅ Funcional | |

---

### ✅ 2.11 Portal do Investidor (separado)
| Funcionalidade | Estado | Observação |
|---|---|---|
| Login e autenticação própria | ✅ Funcional | |
| Listagem de ativos (read-only) | ✅ Funcional | |
| Detalhe de ativo | ✅ Funcional | ROI e info jurídica |
| **Dashboard do portal** | ⚠️ Placeholder | Página index sem dados |

---

### ⚠️ 2.12 Administração
| Funcionalidade | Estado | Observação |
|---|---|---|
| Gestão de utilizadores | ✅ Funcional | |
| Audit log (viewer) | ✅ Funcional | |
| Override events | ✅ Funcional | |
| Gestão de investidores | ✅ Funcional | |
| Relatórios admin | ✅ Funcional | |
| **Dashboard admin (index)** | ⚠️ Placeholder | Página index sem dados |
| Super-Admin (tenants, quotas, white-label) | ✅ Funcional | |
| Configurações do tenant | ✅ Funcional | MPGA params, thresholds |

---

## 3. Conformidade — 14 Divergências Corrigidas

| # | Divergência | Estado |
|---|---|---|
| 1 | MFA obrigatório a cada 8h | ✅ Corrigido |
| 2 | Aprovação Owner acima R$5.000 | ✅ Corrigido |
| 3 | MPGA hard gate no DB (trigger) | ✅ Corrigido |
| 4 | CPO enforcement OCR ≥ 95% / DPI ≥ 300 | ✅ Corrigido |
| 5 | QG4 bloqueia transição de status jurídico | ✅ Corrigido |
| 6 | Campo mpga_risk_score em auction_assets | ✅ Corrigido |
| 7 | legal_hold / trava_venda com DB trigger | ✅ Corrigido |
| 8 | projeto_id obrigatório em transações | ✅ Corrigido |
| 9 | Token HMAC-SHA256 TTL 15min no viewer | ✅ Corrigido |
| 10 | SMS MFA com provider abstrato (Twilio/stub) | ✅ Corrigido |
| 11 | Persona Auditor Estratégico + CLEAR + Antiloop | ✅ Corrigido |
| 12 | ESLint rule — queries SQL sem tenant_id | ✅ Corrigido |
| 13 | Watermark opacity 0.08 → 0.15 | ✅ Corrigido |
| 14 | tenant_id na marca d'água | ✅ Corrigido |

---

## 4. Inventário de Páginas Frontend

**Total de páginas:** 81  
**Funcionais:** 79 (97%)  
**Placeholder:** 2 (3%)

### Páginas Placeholder (precisam de atenção)
| Página | Problema |
|---|---|
| `/admin` | Texto estático, sem dados, sem navegação útil |
| `/investor` | Texto estático "portal read-only", sem dashboard real |

### Resumo por módulo
| Módulo | Páginas | Funcionais |
|---|---|---|
| Autenticação | 5 | 5 |
| Dashboard | 1 | 1 |
| Leilões | 8 | 8 |
| Jurídico (documentos + casos) | 14 | 14 |
| Imóveis | 8 | 8 |
| Financeiro | 14 | 14 |
| CRM / Matching | 3 | 3 |
| Base de Conhecimento | 7 | 7 |
| Compliance / QG | 4 | 4 |
| Intelligence IA | 1 | 1 |
| Workflow | 2 | 2 |
| Portal Investidor | 4 | 3 |
| Admin / Super-Admin | 8 | 7 |
| Perfil / Definições | 2 | 2 |
| **Total** | **81** | **79** |

---

## 5. Gaps Identificados para Revisão Final

### 5.1 Páginas a completar (pequenas)
| Página | O que falta |
|---|---|
| `/admin` | Dashboard com stats: nº utilizadores, nº tenants, override events recentes |
| `/investor` | Dashboard com: ativos disponíveis, proposals em curso, documentos partilhados |

### 5.2 Funcionalidades de backend sem UI frontend
| Funcionalidade | Rota API | UI |
|---|---|---|
| Import em massa — Base de Conhecimento | POST `/knowledge/import` | Sem botão/formulário |
| Linhagem visual de factos | GET `/documents/:id/lineage` | Sem visualização |
| Download de documentos gerados | POST `/generated-documents/:id/download` | Integração incompleta |
| Manutenção do sistema (super-admin) | POST `/super-admin/maintenance/:action` | Sem UI |
| Status de backup | GET `/super-admin/backup-status` | Sem UI |

### 5.3 Considerações técnicas
| Item | Estado |
|---|---|
| Deploy VPS (164.92.71.218) | ⏳ Aguardando desbloqueio de IP (fail2ban) |
| GitHub Actions CI/CD | ✅ Configurado — auto-deploy em push para main |
| Migrations 053–057 aplicadas no VPS | ⏳ Pendente após deploy |
| Testes automatizados (vitest) | ⚠️ Setup existe, cobertura a avaliar |

---

## 6. Resumo Executivo

O sistema está **substancialmente completo** para uma primeira auditoria técnica:

- 150+ endpoints de API cobrem todos os módulos de negócio definidos na especificação
- 79 de 81 páginas frontend têm integração real com a API
- Todas as 14 divergências da auditoria anterior foram corrigidas com DB triggers como backstop
- Multi-tenancy, RBAC, audit trail com hash chain, MFA, e todos os hard gates estão implementados

**Pontos a resolver antes da submissão:**
1. Completar as 2 páginas placeholder (admin index + investor index) — trabalho de 1–2 dias
2. Deploy no VPS e aplicação das migrations 053–057
3. Revisar cobertura de testes
4. Validar os 5 gaps de UI listados na secção 5.2

---

*Documento gerado para revisão interna pré-auditoria. Versão 1.0 — 16/04/2026*
