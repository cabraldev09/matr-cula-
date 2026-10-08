# Publicação

Produção sugerida: **Vercel** para o app `web/` (região `gru1`) e **Supabase** para banco, autenticação e arquivos (projeto `lkydyxlzjdyhvqmjcyof`).

## 1. Banco (Supabase)

As migrações ficam em `supabase/migrations/` e são aplicadas pela Supabase CLI, nunca pelo Prisma:

```bash
supabase link --project-ref lkydyxlzjdyhvqmjcyof
supabase db push
```

Depois de aplicar, rode os avisos de segurança no painel (Advisors) ou com `supabase db advisors --linked`.

Em **Authentication → URL Configuration**:
- Site URL: o domínio do sistema, por exemplo `https://app.seudominio.com.br`;
- Redirect URLs: `https://app.seudominio.com.br/auth/**`.

Em **Authentication → Emails**, configure um SMTP próprio. O SMTP padrão da Supabase tem limite baixo de envios.

Para virar administrador da plataforma, crie sua conta pelo site e rode, com `DATABASE_URL` de produção no ambiente:

```bash
npm --prefix web run platform:admin -- seu-email@dominio.com
```

## 2. App (Vercel)

1. Importe o repositório e defina **Root Directory = `web`**. O `web/vercel.json` já define o build, a região e as rotinas agendadas.
2. Configure as variáveis de ambiente (modelo completo em `web/.env.example`).

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | Pooler da Supabase (porta 6543, `?pgbouncer=true`). |
| `DIRECT_URL` | Conexão direta (porta 5432). Opcional; usada só pela CLI do Prisma. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Podem ir ao navegador. |
| `SUPABASE_SECRET_KEY` | **Somente servidor.** Nunca com prefixo `NEXT_PUBLIC_`. |
| `APP_URL` | URL pública do sistema, usada em links e webhooks. |
| `APP_ENCRYPTION_KEY` | Gere com `openssl rand -base64 32`. Cifra as chaves OpenAI e as credenciais Efí dos polos. **Não troque depois** sem uma rotação de chave. |
| `CRON_SECRET` | A Vercel envia esse segredo às rotinas `/api/cron/*`. |
| `STORAGE_DRIVER=supabase`, `SUPABASE_STORAGE_BUCKET` | Bucket privado dos PDFs da análise curricular. |
| `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_LOGO`, `NEXT_PUBLIC_SUPPORT_EMAIL` | Marca da plataforma. |
| `EFI_*`, `NEXT_PUBLIC_EFI_ACCOUNT_ID` | Cobrança das assinaturas (ver [COBRANCA-EFI.md](COBRANCA-EFI.md)). |
| `OPENAI_PLATFORM_API_KEY` | Opcional. É a chave usada pelas empresas sem chave própria; consome os créditos do plano. |

3. Aponte o domínio na Vercel.

## 3. WhatsApp oficial (serviço de mensagens)

O serviço `services/messaging` recebe o webhook da Meta e envia a fila de mensagens. Ele roda fora da Vercel, porque é um processo contínuo; Render, Railway ou uma VPS servem.

| Variável | Valor |
| --- | --- |
| `MESSAGING_DATABASE_URL` | Conexão Postgres com o papel do serviço de mensagens. |
| `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION` | Dados do app na Meta. |
| `WHATSAPP_CHANNEL_TOKENS` | JSON `{ "<phone_number_id>": "<token>" }`. |
| `MESSAGING_PORT`, `MESSAGING_HOST` | Porta e interface de escuta. |

Na Meta, a URL do webhook é a do serviço publicado. Cada canal criado em Atendimento → Canais com o tipo WhatsApp oficial usa o `phone_number_id` do número.

## 4. Conferência depois de publicar

- O site abre em `/` e os planos aparecem.
- O cadastro cria a empresa vazia, e o teste grátis libera os módulos.
- No CRM:
  - importe um curso;
  - receba uma mensagem;
  - confira o lead e gere a proposta;
  - abra `/proposta/<token>` em uma janela anônima.
- Em `/admin`, confira se a empresa nova aparece.
