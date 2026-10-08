# Matrícula+ · app web

Aplicação Next.js da plataforma: atendimento, análise curricular, portal do aluno, grades comerciais,
planos e cobrança. Cada empresa cliente tem dados, equipe e plano próprios; o dono da plataforma
administra planos e empresas em `/admin`.

## Desenvolvimento

Na raiz do repositório, com Docker e Supabase CLI:

```bash
npm run dev          # Supabase local + serviços legados
npm --prefix web run dev -- -p 3010
```

Acesse http://localhost:3010/cadastro, crie a conta e a empresa e escolha um plano (o teste grátis não
precisa de cobrança configurada).

## Banco de dados

O Supabase é a fonte de verdade. O schema da análise curricular fica em `prisma/schema.prisma`, que
serve só como cliente. Depois de mudar o schema:

```bash
node scripts/curricular-schema.mjs   # na raiz: gera supabase/schemas/04_curricular.sql
npm run db:sync                      # gera a migration
npm run db:migrate
```

Todo acesso aos dados da análise passa por `src/lib/prisma.ts`, que filtra pela empresa da sessão; o
banco ainda rejeita qualquer referência entre empresas.

## Testes

```bash
npm run typecheck
npm test             # Vitest
```

Documentação técnica do motor acadêmico em `docs/`.
