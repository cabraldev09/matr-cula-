# Matrícula+

CRM de matrículas para polos de ensino superior, com atendimento pelo WhatsApp, proposta de bolsa, cobrança da taxa de matrícula e análise curricular, vendido como SaaS (cada polo tem a sua conta).

| Módulo | O que faz |
| --- | --- |
| **CRM de matrículas** | Lead criado na hora em que chega mensagem no WhatsApp. O curso é reconhecido no texto e a nota (0–100, quente/morno/frio) é calculada sozinha. Funil kanban, proposta de bolsa em PDF e link público, taxa de matrícula por Pix copia-e-cola ou link Efí do polo. |
| **Atendimento** | Caixa de entrada compartilhada, departamentos, respostas rápidas, notas internas, anexos e canais (WhatsApp oficial da Meta e canal de teste). |
| **Análise curricular** | Leitura do histórico em PDF, aproveitamento de disciplinas, pendências e previsão de conclusão, com IA. |
| **Portal do aluno** e **Grades comerciais** | Área do aluno e catálogo de matrizes com mensagem pronta para o WhatsApp. |
| **Revenda** | Planos, teste grátis, upgrade, faturas pela Efí e painel `/admin` do dono da plataforma. |

## Arquitetura

- **`web/`**: aplicação Next.js 16 (App Router, React 19, Tailwind 4). Contém o site público, o sistema, o painel `/admin`, os webhooks e as rotinas agendadas.
- **`supabase/`**: banco Postgres, Auth e Storage.
  - Esquemas declarativos ficam em `supabase/schemas/` e as migrações em `supabase/migrations/`.
  - A separação entre empresas é imposta pelo próprio banco (RLS e triggers por módulo e plano).
- **`services/messaging/`**: serviço que recebe os webhooks do WhatsApp Cloud (Meta) e envia as mensagens da fila.
- **`backend/` e `frontend/`**: instalação Community legada (WhatsApp por QR Code), mantida só por compatibilidade. A origem é o Whaticket Open Source, sob licença MIT (ver `LICENSE`, `README.pt-br.md` e `README.es.md`).

## Começar

Requisitos: Node 22 ou superior, Docker ativo e Supabase CLI.

```bash
npm ci && npm ci --prefix web
npm run dev
```

- `npm run dev` sobe o Supabase local, gera `web/.env.local` e abre o sistema em http://localhost:3010.
- `npm --prefix web run seed:demo` cria a conta demo (dono da plataforma, empresa com o plano Completo em teste). A senha fica em `web/.env.local`.

## Verificação

```bash
npm test                      # testes de banco (RLS, planos, CRM, equipe)
npm run test:web              # typecheck + testes do app
npm --prefix web run lint
npm run db:advisors           # avisos de segurança do Supabase
npm run test:e2e              # Playwright (com o app rodando em :3010)
```

## Documentação

- [docs/REVENDA.md](docs/REVENDA.md): planos, módulos, painel do administrador e contas dos polos.
- [docs/CRM.md](docs/CRM.md): funil, qualificação, proposta de bolsa e taxa de matrícula.
- [docs/COBRANCA-EFI.md](docs/COBRANCA-EFI.md): Efí da plataforma (assinaturas) e Efí de cada polo (taxa).
- [docs/DEPLOY.md](docs/DEPLOY.md): publicação (Vercel e Supabase) e variáveis de ambiente.
- [docs/EXECUCAO-SAAS.md](docs/EXECUCAO-SAAS.md): histórico de execução e decisões.
