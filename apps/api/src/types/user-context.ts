/**
 * UserContext - Fonte 2, Registro de Tenants e Usuários
 * Injected by TenantMiddleware into request.state.context.
 * Gemas de negócio consomem este contexto; não precisam perguntar "quem é você?".
 */
export interface UserContext {
  user_id: string;
  tenant_id: string;
  role: 'OWNER' | 'REVISOR' | 'OPERATIONAL';
  ip_address: string | undefined;
}
