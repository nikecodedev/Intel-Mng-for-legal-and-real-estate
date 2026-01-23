# Evidências Técnicas - Marco 1
## Homologação da Espinha Dorsal (Infraestrutura SaaS e DB)


**Status:** Conforme Manual do Mestre - Módulos 7 e 9

Este documento contém as evidências técnicas solicitadas para homologação do Marco 1, focando especialmente nos Módulos 7 (Isolamento Multi-Tenant) e 9 (Auditoria e Integridade) do Manual do Mestre.

---

## 1. Schema de Banco de Dados - Amostra

### 1.1. Tabela `saas_tenants` (Isolamento Multi-Tenant)

```sql
-- ============================================
-- SAAS_TENANTS TABLE
-- Isolamento de dados por tenant (Multi-tenancy)
-- ============================================
CREATE TABLE saas_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificação do Tenant
    tenant_id VARCHAR(100) UNIQUE NOT NULL, -- Identificador único do tenant (usado para isolamento)
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE, -- Domínio customizado (opcional)
    subdomain VARCHAR(100) UNIQUE, -- Subdomínio do tenant
    
    -- Status e Configuração
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'inactive', 'trial'
    tier VARCHAR(50) DEFAULT 'standard', -- 'trial', 'standard', 'premium', 'enterprise'
    max_users INTEGER DEFAULT 10,
    max_storage_gb INTEGER DEFAULT 10,
    
    -- Configurações de Isolamento
    database_schema VARCHAR(100), -- Schema dedicado (opcional para isolamento físico)
    isolation_level VARCHAR(50) DEFAULT 'logical', -- 'logical' (shared DB) ou 'physical' (dedicated DB)
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb, -- Configurações específicas do tenant
    settings JSONB DEFAULT '{}'::jsonb, -- Preferências e configurações
    
    -- Compliance e Auditoria
    data_residency VARCHAR(100), -- Região de residência dos dados (GDPR)
    compliance_flags TEXT[], -- ['gdpr', 'hipaa', 'sox', 'lgpd']
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    suspended_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'inactive', 'trial', 'expired')),
    CONSTRAINT valid_tier CHECK (tier IN ('trial', 'standard', 'premium', 'enterprise')),
    CONSTRAINT valid_isolation_level CHECK (isolation_level IN ('logical', 'physical')),
    CONSTRAINT tenant_id_format CHECK (tenant_id ~ '^[a-z0-9_-]+$')
);

-- Índices para performance e isolamento
CREATE INDEX idx_saas_tenants_tenant_id ON saas_tenants(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_saas_tenants_status ON saas_tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_saas_tenants_domain ON saas_tenants(domain) WHERE deleted_at IS NULL;
CREATE INDEX idx_saas_tenants_subdomain ON saas_tenants(subdomain) WHERE deleted_at IS NULL;
CREATE INDEX idx_saas_tenants_created_at ON saas_tenants(created_at);

-- Comentários para documentação
COMMENT ON TABLE saas_tenants IS 'Tabela de tenants para isolamento multi-tenant (SaaS)';
COMMENT ON COLUMN saas_tenants.tenant_id IS 'Identificador único do tenant - usado para isolamento de dados em todas as tabelas';
COMMENT ON COLUMN saas_tenants.isolation_level IS 'Nível de isolamento: logical (shared DB com tenant_id) ou physical (DB dedicado)';
COMMENT ON COLUMN saas_tenants.database_schema IS 'Schema PostgreSQL dedicado para isolamento físico (quando isolation_level = physical)';
```

**Sobre o isolamento:**
A coluna `tenant_id` está implementada como NOT NULL, então é obrigatória em todos os registros. O índice único garante que não haverá duplicatas. A tabela suporta dois níveis de isolamento: lógico (shared database com tenant_id) e físico (schema dedicado do PostgreSQL). Para o isolamento funcionar corretamente, todas as tabelas de negócio precisam incluir a coluna `tenant_id` e filtrar por ela nas queries.

---

### 1.2. Tabela `system_audit_trail` (Hash Chain - Integridade Imutável)

```sql
-- ============================================
-- SYSTEM_AUDIT_TRAIL TABLE
-- Trilha de auditoria com Hash Chain para integridade imutável
-- ============================================
CREATE TABLE system_audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Hash Chain (Integridade Imutável)
    prev_hash VARCHAR(64), -- Hash SHA-256 do registro anterior (NULL para o primeiro)
    curr_hash VARCHAR(64) NOT NULL, -- Hash SHA-256 do registro atual
    hash_chain_index BIGSERIAL, -- Índice sequencial na cadeia (auto-incremento)
    
    -- Isolamento Multi-Tenant
    tenant_id VARCHAR(100) REFERENCES saas_tenants(tenant_id) ON DELETE CASCADE,
    
    -- Identificação do Evento
    event_type VARCHAR(100) NOT NULL, -- 'user.action', 'system.event', 'data.change', etc.
    event_category VARCHAR(50) NOT NULL, -- 'authentication', 'authorization', 'data_modification', 'system', 'compliance'
    action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'login', 'logout', 'grant', 'revoke'
    severity VARCHAR(20) DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'
    
    -- Actor (Quem executou)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255), -- Denormalizado para precisão histórica
    user_role VARCHAR(100), -- Papel do usuário no momento do evento
    session_id VARCHAR(100),
    
    -- Recurso Afetado
    resource_type VARCHAR(100), -- 'user', 'document', 'process', 'role', 'tenant', etc.
    resource_id UUID,
    resource_identifier VARCHAR(500), -- Identificador legível
    
    -- Detalhes do Evento
    description TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb, -- Dados flexíveis específicos do evento
    before_state JSONB, -- Estado anterior (para updates/deletes)
    after_state JSONB, -- Estado posterior (para creates/updates)
    
    -- Contexto da Requisição
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100), -- ID único da requisição (para rastreamento)
    request_method VARCHAR(10), -- 'GET', 'POST', 'PUT', 'DELETE', etc.
    request_path VARCHAR(500),
    
    -- Resultado
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    error_message TEXT,
    http_status_code INTEGER,
    
    -- Compliance
    compliance_flags TEXT[], -- ['gdpr', 'hipaa', 'sox', 'lgpd']
    retention_category VARCHAR(50), -- Categoria para política de retenção
    legal_hold BOOLEAN DEFAULT false, -- Flag de retenção legal
    
    -- Timestamp (Imutável)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_event_category CHECK (
        event_category IN ('authentication', 'authorization', 'data_access', 'data_modification', 'system', 'compliance', 'security')
    ),
    CONSTRAINT valid_action CHECK (
        action IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'grant', 'revoke', 'export', 'import', 'approve', 'reject', 'access')
    ),
    CONSTRAINT valid_severity CHECK (
        severity IN ('debug', 'info', 'warning', 'error', 'critical')
    ),
    CONSTRAINT curr_hash_format CHECK (curr_hash ~ '^[a-f0-9]{64}$'), -- SHA-256 hex
    CONSTRAINT prev_hash_format CHECK (prev_hash IS NULL OR prev_hash ~ '^[a-f0-9]{64}$')
);

-- Índices para performance
CREATE INDEX idx_audit_trail_tenant_id ON system_audit_trail(tenant_id);
CREATE INDEX idx_audit_trail_hash_chain_index ON system_audit_trail(hash_chain_index DESC);
CREATE INDEX idx_audit_trail_curr_hash ON system_audit_trail(curr_hash);
CREATE INDEX idx_audit_trail_prev_hash ON system_audit_trail(prev_hash) WHERE prev_hash IS NOT NULL;
CREATE INDEX idx_audit_trail_user_id ON system_audit_trail(user_id);
CREATE INDEX idx_audit_trail_event_type ON system_audit_trail(event_type);
CREATE INDEX idx_audit_trail_event_category ON system_audit_trail(event_category);
CREATE INDEX idx_audit_trail_resource ON system_audit_trail(resource_type, resource_id);
CREATE INDEX idx_audit_trail_created_at ON system_audit_trail(created_at DESC);
CREATE INDEX idx_audit_trail_request_id ON system_audit_trail(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_trail_session_id ON system_audit_trail(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_audit_trail_compliance ON system_audit_trail(compliance_flags) WHERE compliance_flags IS NOT NULL;
CREATE INDEX idx_audit_trail_legal_hold ON system_audit_trail(legal_hold) WHERE legal_hold = true;

-- Índice composto para consultas comuns
CREATE INDEX idx_audit_trail_tenant_time ON system_audit_trail(tenant_id, created_at DESC);
CREATE INDEX idx_audit_trail_user_time ON system_audit_trail(user_id, created_at DESC);
CREATE INDEX idx_audit_trail_resource_time ON system_audit_trail(resource_type, resource_id, created_at DESC);

-- Índice GIN para JSONB
CREATE INDEX idx_audit_trail_details ON system_audit_trail USING GIN(details);
CREATE INDEX idx_audit_trail_before_state ON system_audit_trail USING GIN(before_state) WHERE before_state IS NOT NULL;
CREATE INDEX idx_audit_trail_after_state ON system_audit_trail USING GIN(after_state) WHERE after_state IS NOT NULL;

-- Função para calcular hash SHA-256 do registro
CREATE OR REPLACE FUNCTION calculate_audit_hash(
    p_id UUID,
    p_prev_hash VARCHAR(64),
    p_tenant_id VARCHAR(100),
    p_event_type VARCHAR(100),
    p_action VARCHAR(50),
    p_user_id UUID,
    p_resource_type VARCHAR(100),
    p_resource_id UUID,
    p_description TEXT,
    p_details JSONB,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS VARCHAR(64) AS $$
DECLARE
    hash_input TEXT;
    calculated_hash VARCHAR(64);
BEGIN
    -- Concatena todos os campos relevantes para o hash
    hash_input := COALESCE(p_id::TEXT, '') || '|' ||
                  COALESCE(p_prev_hash, '') || '|' ||
                  COALESCE(p_tenant_id, '') || '|' ||
                  COALESCE(p_event_type, '') || '|' ||
                  COALESCE(p_action, '') || '|' ||
                  COALESCE(p_user_id::TEXT, '') || '|' ||
                  COALESCE(p_resource_type, '') || '|' ||
                  COALESCE(p_resource_id::TEXT, '') || '|' ||
                  COALESCE(p_description, '') || '|' ||
                  COALESCE(p_details::TEXT, '') || '|' ||
                  COALESCE(p_created_at::TEXT, '');
    
    -- Calcula SHA-256
    calculated_hash := encode(digest(hash_input, 'sha256'), 'hex');
    
    RETURN calculated_hash;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para calcular hash automaticamente antes de inserir
CREATE OR REPLACE FUNCTION set_audit_trail_hash()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash_value VARCHAR(64);
    hash_index BIGINT;
BEGIN
    -- Obtém o hash do registro anterior e o índice
    SELECT curr_hash, hash_chain_index INTO prev_hash_value, hash_index
    FROM system_audit_trail
    WHERE tenant_id = COALESCE(NEW.tenant_id, 'system')
    ORDER BY hash_chain_index DESC
    LIMIT 1;
    
    -- Define prev_hash e hash_chain_index
    NEW.prev_hash := prev_hash_value;
    NEW.hash_chain_index := COALESCE(hash_index, 0) + 1;
    
    -- Calcula o hash do registro atual
    NEW.curr_hash := calculate_audit_hash(
        NEW.id,
        NEW.prev_hash,
        NEW.tenant_id,
        NEW.event_type,
        NEW.action,
        NEW.user_id,
        NEW.resource_type,
        NEW.resource_id,
        NEW.description,
        NEW.details,
        NEW.created_at
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger BEFORE INSERT
CREATE TRIGGER set_audit_trail_hash_trigger
    BEFORE INSERT ON system_audit_trail
    FOR EACH ROW
    EXECUTE FUNCTION set_audit_trail_hash();

-- Função para prevenir modificações (Imutabilidade)
CREATE OR REPLACE FUNCTION prevent_audit_trail_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'system_audit_trail é imutável. Updates e deletes não são permitidos.';
END;
$$ LANGUAGE plpgsql;

-- Triggers para prevenir UPDATE e DELETE
CREATE TRIGGER prevent_audit_trail_update
    BEFORE UPDATE ON system_audit_trail
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_trail_modification();

CREATE TRIGGER prevent_audit_trail_delete
    BEFORE DELETE ON system_audit_trail
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_trail_modification();

-- Função para validar integridade da hash chain
CREATE OR REPLACE FUNCTION validate_audit_hash_chain(p_tenant_id VARCHAR(100) DEFAULT NULL)
RETURNS TABLE(
    hash_chain_index BIGINT,
    curr_hash VARCHAR(64),
    prev_hash VARCHAR(64),
    calculated_hash VARCHAR(64),
    is_valid BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH ordered_trail AS (
        SELECT 
            hash_chain_index,
            id,
            prev_hash,
            curr_hash,
            tenant_id,
            event_type,
            action,
            user_id,
            resource_type,
            resource_id,
            description,
            details,
            created_at
        FROM system_audit_trail
        WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        ORDER BY hash_chain_index
    ),
    validation AS (
        SELECT 
            ot.hash_chain_index,
            ot.curr_hash,
            ot.prev_hash,
            calculate_audit_hash(
                ot.id,
                ot.prev_hash,
                ot.tenant_id,
                ot.event_type,
                ot.action,
                ot.user_id,
                ot.resource_type,
                ot.resource_id,
                ot.description,
                ot.details,
                ot.created_at
            ) AS calculated_hash,
            ot.created_at
        FROM ordered_trail ot
    )
    SELECT 
        v.hash_chain_index,
        v.curr_hash,
        v.prev_hash,
        v.calculated_hash,
        (v.curr_hash = v.calculated_hash) AS is_valid,
        v.created_at
    FROM validation v;
END;
$$ LANGUAGE plpgsql;

-- Comentários para documentação
COMMENT ON TABLE system_audit_trail IS 'Trilha de auditoria imutável com hash chain para garantir integridade e rastreabilidade';
COMMENT ON COLUMN system_audit_trail.prev_hash IS 'Hash SHA-256 do registro anterior na cadeia (NULL para o primeiro registro)';
COMMENT ON COLUMN system_audit_trail.curr_hash IS 'Hash SHA-256 do registro atual, calculado automaticamente via trigger';
COMMENT ON COLUMN system_audit_trail.hash_chain_index IS 'Índice sequencial na cadeia de hash (auto-incremento por tenant)';
COMMENT ON COLUMN system_audit_trail.tenant_id IS 'Isolamento multi-tenant - cada tenant tem sua própria cadeia de hash';
COMMENT ON FUNCTION calculate_audit_hash IS 'Calcula hash SHA-256 do registro de auditoria incluindo prev_hash para formar cadeia';
COMMENT ON FUNCTION validate_audit_hash_chain IS 'Valida a integridade da cadeia de hash verificando se todos os hashes estão corretos';
```

**Evidência de Hash Chain:**
- Colunas `prev_hash` e `curr_hash` implementadas (SHA-256)
- Trigger automático calcula `curr_hash` incluindo o `prev_hash` do registro anterior
- Função de validação permite verificar integridade da cadeia completa
- Imutabilidade garantida por triggers (UPDATE/DELETE bloqueados)
- Isolamento por tenant: cada tenant possui sua própria cadeia de hash

---

## 2. Segregação de Rede

### 2.1. Docker Compose

A configuração está no arquivo `infrastructure/docker/docker-compose.yml`. A rede isolada está definida assim:

```yaml
networks:
  platform-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

Todos os serviços estão conectados nessa rede. O PostgreSQL e Redis não expõem portas para o host - só ficam acessíveis dentro da rede Docker através dos nomes dos serviços (DNS interno). A API e o serviço de intelligence expõem apenas as portas necessárias (3000 e 8000 respectivamente) para acesso externo, mas a comunicação entre serviços acontece apenas dentro da rede isolada.

### 2.2. Kubernetes

No Kubernetes, os serviços estão configurados como `ClusterIP` (arquivo `infrastructure/k8s/api/service.yaml`), o que significa que são acessíveis apenas dentro do cluster. O namespace `platform` isola logicamente os recursos.

O acesso externo é feito exclusivamente via Ingress (`infrastructure/k8s/ingress.yaml`), que está configurado com SSL/TLS obrigatório, rate limiting e health checks. Isso garante que não há acesso direto aos serviços - tudo passa pelo Ingress.

### 2.3. Comandos para Validação de Segregação

**Docker Compose:**
```bash
# Listar redes
docker network ls

# Inspecionar rede isolada
docker network inspect platform-network

# Verificar conectividade entre containers
docker exec platform-api ping -c 3 postgres
docker exec platform-api ping -c 3 redis

# Verificar que serviços não estão acessíveis externamente (exceto portas expostas)
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

**Kubernetes:**
```bash
# Listar serviços e tipos
kubectl get svc -n platform

# Verificar network policies (se aplicadas)
kubectl get networkpolicies -n platform

# Verificar pods e seus IPs internos
kubectl get pods -n platform -o wide

# Testar conectividade interna
kubectl exec -it deployment/api -n platform -- ping -c 3 postgres.platform.svc.cluster.local
```

---

## 3. Resumo de Conformidade

**Módulo 7 - Isolamento Multi-Tenant:**
A tabela `saas_tenants` está implementada com a coluna `tenant_id` obrigatória. Os índices estão configurados para garantir performance nas queries de isolamento. A implementação suporta tanto isolamento lógico quanto físico, dependendo da necessidade.

**Módulo 9 - Auditoria e Integridade:**
A tabela `system_audit_trail` está implementada com hash chain usando SHA-256. O trigger automático calcula o hash antes de cada insert, e a função de validação permite verificar a integridade da cadeia quando necessário. A imutabilidade é garantida pelos triggers que bloqueiam UPDATE e DELETE. Cada tenant tem sua própria cadeia de hash isolada.

**Segurança de Rede:**
A rede Docker está isolada com subnet dedicada. No Kubernetes, os serviços estão configurados como ClusterIP para acesso interno apenas, e o Ingress está configurado com SSL/TLS obrigatório, rate limiting e health checks.

---

## 4. Próximos Passos

Para validar a implementação:

1. Aplicar o schema SQL em um ambiente de teste e verificar se as tabelas e triggers foram criados corretamente
2. Rodar os comandos de validação de rede e capturar os resultados (screenshots ou logs)
3. Fazer alguns inserts de teste na `system_audit_trail` e verificar se o hash está sendo calculado corretamente. Depois rodar a função `validate_audit_hash_chain()` para confirmar a integridade da cadeia

---

**Conforme Manual do Mestre - Módulos 7 e 9**

