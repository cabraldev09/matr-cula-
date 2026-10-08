# Execução do SaaS Matrícula+

Estado em 8/10/2026. O sistema é o app Next.js em `web/` sobre Supabase. A área antiga `/saas` foi removida, e a instalação Community (`backend/`, `frontend/`) continua só como legado de WhatsApp por QR Code.

## Entregas

1. **Fundação multiempresa.**
   - Cadastro, login, empresas e papéis (dono, administrador, supervisor, atendente).
   - Convites e departamentos.
   - RLS e permissões por coluna em todas as tabelas.
2. **Atendimento.**
   - Caixa de entrada com Realtime, contatos, etiquetas e respostas rápidas.
   - Notas internas, anexos privados e canais (WhatsApp Cloud e canal de teste).
   - Fila de envio idempotente.
3. **Análise curricular integrada.**
   - O schema `curricular` é gerado a partir do Prisma.
   - Cada registro tem `organization_id`, validado por triggers, e as consultas passam por escopo de empresa (`withTenant`).
   - A logo da Cruzeiro foi removida da plataforma, e os menus foram simplificados para o "2 em 1".
4. **Revenda.**
   - Catálogo de módulos e planos, teste grátis, upgrade e cancelamento.
   - Faturas e assinaturas pela Efí, com webhook idempotente.
   - Cotas de análises e créditos de IA.
   - Add-ons e painel `/admin`. Veja [REVENDA.md](REVENDA.md) e [COBRANCA-EFI.md](COBRANCA-EFI.md).
5. **CRM de matrículas.**
   - Lead criado na hora pela mensagem do WhatsApp, com reconhecimento do curso, nota e temperatura.
   - Funil kanban e proposta de bolsa em PDF no layout do modelo, conferida contra 6 propostas reais.
   - Link público da proposta.
   - Taxa de matrícula por Pix copia-e-cola ou link Efí do polo, com confirmação idempotente.
   - Logo da proposta por polo, com o modelo Cruzeiro do Sul Virtual disponível.
   - Integração com atendimento, início e relatórios. Veja [CRM.md](CRM.md).
6. **Site público** com a estrutura de seções e os efeitos de referência:
   - hero, canais, "o que fazemos" em acordeão, faixa WhatsApp oficial, números, "feito para polos", planos, dúvidas e CTA;
   - cores e textos próprios;
   - imagens que são capturas reais do sistema, geradas por `npm --prefix web run site:screenshots`.

## Verificação

```bash
npm test                         # 65 testes de banco: isolamento, planos, equipe, CRM
npm run test:web                 # typecheck + 292 testes do app
npm --prefix web run lint
npm --prefix web run build
npm run db:advisors              # sem avisos de segurança
npm run test:e2e                 # cadastro → teste → atendimento → suspensão; WhatsApp → lead → proposta → Pix → taxa paga
```

A integração contínua (`.github/workflows/verify.yml`) roda todos esses passos a cada push.

Validação de 8/10/2026: todas as suítes aprovadas e fluxo do CRM conferido no navegador em desktop e celular.

## Correções na instalação Community

O cadastro público sempre cria perfil de atendente e ignora associações administrativas enviadas pelo cliente. As sessões usam o papel atual e a versão do token no banco. A leitura e a alteração de tickets/mensagens verificam acesso por responsável e fila. Os eventos de tickets e mensagens são enviados somente a sockets autorizados e reavaliam a sessão antes de cada entrega.

Arquivos de mensagens em `/public` exigem um link assinado com prazo de cinco minutos. O prazo também se aplica a quem obtiver um link já emitido. Arquivos fora da lista de formatos de mídia são servidos como download. Uploads de mensagens têm limite de 20 MB por arquivo e dez arquivos por requisição.

Dependências principais foram atualizadas, incluindo Sequelize, driver MySQL, Express, JWT, Multer, Socket.IO, Axios e Vite. Lockfiles são versionados. A auditoria do backend ainda aponta dependências transitivas dos providers WhatsApp e outros pacotes; não declarar o produto pronto para produção até concluir atualização e validação desses caminhos.

## Pendências que dependem do dono da plataforma

- Arquivo da logo Matrícula+ (`NEXT_PUBLIC_BRAND_LOGO`) e domínio do site.
- `supabase db push` no projeto remoto e variáveis na Vercel (ver [DEPLOY.md](DEPLOY.md)).
- Conta Efí da plataforma (assinaturas) e, em cada polo, a conta Efí ou a chave Pix (taxa).
- Autorização dos polos para usar a marca Cruzeiro do Sul nas propostas.
- Depoimentos reais, se desejar uma seção de depoimentos no site. Nenhum depoimento foi inventado.
- Validação do WhatsApp Cloud com um número real.
