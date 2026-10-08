# Revenda: planos, empresas e administração

Você é o dono da plataforma (marca Matrícula+). Cada cliente (polo, escola) cria a própria conta e começa com uma empresa vazia, sem dados de ninguém. Cada empresa vê e usa só os módulos do plano que contratou.

## Como funciona para o cliente

1. **Cadastro.** A pessoa cria a conta em `/cadastro` e vira dona da empresa. A empresa nasce sem módulos.
2. **Teste grátis.** Em `/conta/plano` a pessoa inicia o teste do plano escolhido (uma vez por empresa) ou contrata direto. O pagamento é por boleto, Pix ou cartão pela Efí.
3. **Upgrade e cancelamento.** A troca de plano e o cancelamento ficam na mesma página. As faturas aparecem lá e são atualizadas pelo webhook da Efí.
4. **Equipe.** Em `/conta/equipe` o dono convida pessoas e define o papel de cada uma: dono, administrador, supervisor ou atendente. Também define o perfil na análise curricular.
5. **Empresa.** Em `/conta/empresa` ficam o nome, o endereço do portal e a logo.

## Módulos e planos iniciais

| Plano | Preço/mês | Módulos | Limites |
| --- | --- | --- | --- |
| Atendimento | R$ 149 | Atendimento, CRM de matrículas | 5 usuários, 1 canal |
| Análise curricular | R$ 199 | Análise curricular, grades comerciais | 5 usuários, 300 análises/mês |
| Completo | R$ 349 | CRM, atendimento, análise curricular, portal do aluno, grades comerciais | 15 usuários, 3 canais, 1.000 análises/mês |

Os três planos têm 7 dias de teste. Preços, módulos, limites e dias de teste são editáveis em `/admin/planos`.

## Regras aplicadas pelo banco, não só pela tela

Mesmo que alguém chame a API direto, o banco garante que:
- uma empresa nunca lê nem grava dados de outra (RLS por associação);
- sem o módulo no plano, a leitura volta vazia e a escrita é recusada (`has_module` e triggers `require_*_write`);
- com a assinatura suspensa ou vencida, os módulos ficam bloqueados;
- os limites de usuários, canais, análises e créditos de IA são contados por empresa.

## Painel do administrador (`/admin`)

Só contas marcadas como administradoras da plataforma acessam o painel. Para dar o acesso a uma conta:

```bash
npm --prefix web run platform:admin -- seu-email@dominio.com
```

| Página | O que faz |
| --- | --- |
| `/admin` | Visão geral: empresas, assinaturas ativas, em teste e receita mensal. |
| `/admin/empresas` | Lista e busca de empresas. |
| `/admin/empresas/[id]` | Detalhe da empresa. Permite trocar o plano, ativar ou suspender e liberar módulos avulsos (add-ons) com validade. |
| `/admin/planos` | Cria e edita planos; "Criar na Efí" cadastra o plano para assinatura. |

## Sua marca

Variáveis de ambiente:
- `NEXT_PUBLIC_BRAND_NAME`: nome da plataforma (padrão Matrícula+);
- `NEXT_PUBLIC_BRAND_LOGO`: caminho da logo, por exemplo `/brand/logo.svg` (coloque o arquivo em `web/public/brand/`);
- `NEXT_PUBLIC_SUPPORT_EMAIL`: e-mail de suporte.

A logo da proposta de bolsa é outra configuração: cada polo escolhe a sua (veja [CRM.md](CRM.md)).
