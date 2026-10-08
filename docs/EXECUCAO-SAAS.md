# Execução da fundação do SaaS

A primeira entrega implementa um espaço de trabalho por empresa em `/saas`, usando Supabase local. A instalação Community continua em `/`, com MariaDB. As duas áreas têm autenticação e dados separados; as sessões WhatsApp existentes ainda não foram migradas para o SaaS.

## Funcionalidades disponíveis

- Cadastro e login via Supabase Auth.
- Criação de empresas e troca entre empresas da mesma conta.
- Papéis de proprietário, administrador, supervisor e atendente.
- Convites vinculados ao e-mail, com expiração, aceite único e revogação. O envio de e-mail ainda não está integrado; o administrador compartilha o link gerado.
- Desativação de membros com bloqueio imediato nas políticas do banco, preservando autoria das notas.
- Departamentos e associação de membros às equipes.
- Contatos com paginação, busca por nome e etiquetas.
- Etiquetas e respostas rápidas por empresa.
- Atendimentos internos com atribuição atômica, resolução, notas e anexos privados.
- Atualizações de contatos, atendimentos e notas por Realtime.
- Políticas RLS, permissões por coluna e referências que impedem misturar empresas.

Os atendimentos novos organizam casos internos e não enviam mensagens a canais externos. WhatsApp, pagamento, campanhas, IA, relatórios avançados, integrações e aplicativos móveis continuam no backlog do [plano](PLANO-SAAS.md).

## Ambiente local

Requisitos: Node 22 atualizado, npm, Docker ativo e Supabase CLI 2.111 ou superior. O desenvolvimento foi verificado no Mac também com Node 26. A integração contínua usa Node 22.

```bash
npm ci
PUPPETEER_SKIP_DOWNLOAD=true npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

Para a instalação de dependências do backend, defina `PUPPETEER_SKIP_DOWNLOAD=true` caso vá usar um Chrome já instalado. Configure `CHROME_BIN` no `backend/.env` antes de conectar uma sessão QR.

| Serviço | Endereço |
| --- | --- |
| Área SaaS | http://localhost:3002/saas |
| Community | http://localhost:3002 |
| Backend Community | http://localhost:8080 |
| Supabase API | http://127.0.0.1:56421 |
| Supabase Studio | http://localhost:56423 |
| Caixa de e-mails local | http://localhost:56424 |

Entre em `/saas`, crie sua conta e depois sua empresa. O login `admin@whaticket.com` da instalação Community não cria automaticamente uma identidade no Supabase. Na configuração local, confirmação de e-mail está desabilitada para facilitar desenvolvimento; configure confirmação, SMTP e URLs públicas antes de publicar.

Em uma instalação nova, o comando gera `.env` locais com credenciais aleatórias, aplica migrações e inicializa os dados Community. Arquivos existentes são preservados. Se já houver um volume MariaDB, use as credenciais correspondentes a esse volume; gerar novos arquivos não altera a senha de um banco existente.

`npm run stop` encerra apenas os processos frontend/backend iniciados pelo script deste projeto; os bancos permanecem ativos. Logs ficam em `.local/`. `supabase stop` encerra apenas a stack desta pasta. Não use comandos gerais de limpeza do Docker.

## Banco e migrações

O projeto exclusivo tem ID `whaticket-saas` e portas 564xx. Não usa os containers Supabase de outros projetos da máquina.

A fonte do schema fica em `supabase/schemas/01_foundation.sql`. Para mudanças:

```bash
npm run db:sync
# Revise o SQL gerado em supabase/migrations
npm run db:migrate
npm run db:advisors
npm run types
```

A criação do bucket e as políticas no schema gerenciado Storage têm migração complementar, pois não foram incluídas pela geração padrão de schemas públicos/privados. Os grants das tabelas e funções são explícitos. As funções privilegiadas vivem no schema privado e verificam a identidade e o papel do chamador.

## Supabase na nuvem

O projeto remoto é `lkydyxlzjdyhvqmjcyof`. O frontend lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` de `frontend/.env.cloud` (ignorado pelo git; modelo em `frontend/.env.example`). Use `npm --prefix frontend run dev:cloud` para apontar `/saas` para a nuvem; `npm run dev` continua usando o Supabase local. Testes e Playwright seguem restritos à API local na porta 56421.

O banco remoto ainda não recebeu as migrações. Aplique-as uma vez, em um terminal seu:

```bash
supabase login
supabase link --project-ref lkydyxlzjdyhvqmjcyof
supabase db push
supabase db advisors --linked --type security --level warn
```

Depois configure no painel do Supabase: Auth (Site URL, redirect URLs, confirmação de e-mail e SMTP), e confirme o bucket privado de anexos e o Realtime. Use apenas a chave publishable no navegador; chaves secret/service_role nunca entram no frontend nem no git.

O arquivo `.mcp.json` registra o MCP do Supabase deste projeto. Autentique em um terminal comum com `claude /mcp`, selecionando `supabase`.

## Verificação

```bash
npm run build
npm test
npm run test:e2e
```

A suíte principal cria usuários e empresas descartáveis no Supabase exclusivo e limpa os próprios registros. Ela recusa URLs fora da API local na porta 56421. Testa isolamento por empresa/equipe, tentativas de escalada, convites, atribuição concorrente, autoria, anexos e desativação de membros. Testes Socket.IO usam HTTP real com repositórios de dados substituídos para testar sessões e distribuição autorizada de eventos.

O teste de navegador usa o Google Chrome instalado no Mac. Capturas e traces ficam em `.local/`. A configuração permite Chromium em CI. O workflow de CI executa build, testes de isolamento e advisors; ainda não foi executado no GitHub.

Validação desta entrega em 8/10/2026: build do backend e frontend aprovado, 33 testes aprovados, fluxo SaaS aprovado no navegador em desktop e mobile, advisors de segurança sem avisos e frontend respondendo HTTP 200 por IPv4 e IPv6. A interface Community carrega separadamente; conexão WhatsApp real ainda precisa de validação.

Os testes legados do backend não têm mais hooks automáticos que desfazem todas as migrações. Para executá-los separadamente, é obrigatório criar `.env.test` apontando a um banco localhost com nome terminado em `_test` e usar `npm --prefix backend run test:legacy`. Não apontar esse arquivo ao banco da instalação Community.

## Correções na instalação Community

O cadastro público sempre cria perfil de atendente e ignora associações administrativas enviadas pelo cliente. As sessões usam o papel atual e a versão do token no banco. A leitura e a alteração de tickets/mensagens verificam acesso por responsável e fila. Os eventos de tickets e mensagens são enviados somente a sockets autorizados e reavaliam a sessão antes de cada entrega.

Arquivos de mensagens em `/public` exigem um link assinado com prazo de cinco minutos. O prazo também se aplica a quem obtiver um link já emitido. Arquivos fora da lista de formatos de mídia são servidos como download. Uploads de mensagens têm limite de 20 MB por arquivo e dez arquivos por requisição.

Dependências principais foram atualizadas, incluindo Sequelize, driver MySQL, Express, JWT, Multer, Socket.IO, Axios e Vite. Lockfiles são versionados. A auditoria do backend ainda aponta dependências transitivas dos providers WhatsApp e outros pacotes; não declarar o produto pronto para produção até concluir atualização e validação desses caminhos.

## Próximas entregas

1. Migrar identidades e histórico Community com reconciliação e backup, integrando a inbox existente à nova identidade.
2. Implementar canais, recepção de webhooks, outbox e workers duráveis por empresa.
3. Conectar Cloud API e validar envio/recepção com uma conta real.
4. Implementar planos, quotas, assinaturas e eventos de pagamento.
5. Avançar nas automações, IA, métricas e demais conectores conforme o plano.

Publicação em Vercel/Supabase remoto e integrações reais dependem das contas correspondentes. O repositório contém a estrutura de desenvolvimento; nenhum serviço remoto foi publicado nesta entrega.
