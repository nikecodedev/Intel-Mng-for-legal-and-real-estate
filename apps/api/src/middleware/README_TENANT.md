# Tenant Middleware (Middleware de Isolamento)

**Especificação:** Middleware tenant_id_20_01_26, Registro de Tenants e Usuários_20_01_26  
**Referências:** Constituição GEMS (Fonte 73), Motor Payton (Fonte 5), UserContext (Fonte 2)

## Visão geral

O Tenant Middleware é o **"Muro de Gelo"** da aplicação. Nenhuma requisição ultrapassa este ponto sem provar **origem (Tenant)** e **intenção**. Implementa a classe `SaaSEngine` e `DatabaseGuardrail`.

## Fluxo

1. **Interceptação (nível 0)** – Antes de qualquer Controller ou Service.
2. **Extração** – `tenant_id` do JWT (`Authorization: Bearer`) ou, em rotas específicas, `X-Tenant-ID` + HMAC.
3. **Hard Gate** – Validação de existência e status do tenant (tabela `tenants`), com cache Redis (TTL 5 min).
4. **Injeção de contexto** – `UserContext` em `request.context` para Gems de negócio.

## Rotas isentas

- `GET /health`, `GET /health/ready`, `GET /health/live`, `GET /health/startup`
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`

Todas as demais rotas (incl. `GET /auth/me`, `POST /auth/logout`) exigem token com `tid` e passam pelo middleware.

## UserContext (Fonte 2)

Injetado em `req.context`:

```ts
interface UserContext {
  user_id: string;
  tenant_id: string;
  role: 'OWNER' | 'REVISOR' | 'OPERATIONAL';
  ip_address: string | undefined;
}
```

## JWT (Fonte 5)

O token deve incluir:

- `tid` – Tenant ID (UUID)
- `uid` – User ID
- `role` – OWNER | REVISOR | OPERATIONAL

Em desenvolvimento, use `DEFAULT_TENANT_ID` (env) para login/register/refresh emitirem `tid`/`role`.

## Tratamento de erros

| Cenário | Erro interno | Resposta API |
|--------|---------------|--------------|
| Token ausente | `AuthenticationError` | `401 Unauthorized` |
| Claim `tid` ausente | `AuthenticationError` | `401 Unauthorized` |
| Tenant inexistente ou UUID malformado | `AuthorizationError` | `403 Forbidden` |
| Tenant SUSPENDED | `PaymentRequiredError` | `402 Payment Required` |
| Tenant BLOCKED / não ACTIVE | `TenantAccountSuspendedError` | `403` + `{"code":"ACCOUNT_SUSPENDED","message":"Entre em contato com o financeiro."}` |

## Serviços

- **TenantService** (`services/tenant.ts`) – Busca tenant por `tenant_id`, cache Redis 5 min, `invalidateTenantCache`.
- **AuthService** – Geração de JWT com `tid`/`uid`/`role` quando `tenantId` e `role` são passados em `generateAccessToken`.

## Uso nas rotas

As Gems de negócio usam `req.context`:

```ts
router.get('/example', tenantMiddleware, (req, res) => {
  const { tenant_id, user_id, role } = req.context!;
  // ...
});
```

O middleware já é aplicado globalmente no router; rotas isentas não passam por ele.
