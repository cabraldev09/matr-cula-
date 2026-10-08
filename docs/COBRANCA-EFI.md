# Cobrança com a Efí

O sistema usa a **API de Cobranças da Efí** em dois lugares independentes:

| | Quem recebe | Para quê | Credenciais |
| --- | --- | --- | --- |
| **Plataforma** | Você (dono da Matrícula+) | Assinaturas dos planos | Variáveis de ambiente do servidor |
| **Polo** | Cada polo | Taxa de matrícula dos alunos | Cadastradas pelo polo em CRM → Proposta e pagamentos |

A API de Cobranças não exige certificado: basta Client ID e Client Secret de uma aplicação com o escopo de cobranças. O certificado só é exigido pela API Pix, que não é usada aqui.

## 1. Plataforma: assinaturas

1. **Aplicação na Efí.** Na conta Efí da plataforma, crie uma aplicação em API → Aplicações com o escopo de **API de Cobranças/Emissões**. Copie as chaves de Homologação e de Produção.
2. **Variáveis do servidor.** Configure no servidor (Vercel) as variáveis abaixo.

   | Variável | Valor |
   | --- | --- |
   | `EFI_CLIENT_ID` / `EFI_CLIENT_SECRET` | Chaves da aplicação. |
   | `EFI_SANDBOX` | `true` em homologação; `false` em produção. |
   | `EFI_WEBHOOK_SECRET` | Texto aleatório longo (`openssl rand -hex 32`). Protege a URL de notificação. |
   | `NEXT_PUBLIC_EFI_ACCOUNT_ID` | Identificador de conta (payee code), usado para tokenizar o cartão no navegador. |

3. **Planos na Efí.** Em `/admin/planos`, clique em **Criar na Efí** em cada plano pago. Isso cria o plano na Efí e guarda o id dele.
4. **Contratação.** Em `/conta/plano` o cliente informa os dados de cobrança (CPF/CNPJ e endereço) e escolhe a forma de pagamento: boleto (com QR Pix) ou cartão.
   - O sistema cria a assinatura em uma etapa, com `notification_url` = `APP_URL/api/webhooks/efi?secret=EFI_WEBHOOK_SECRET`.
5. **Webhook.** A Efí avisa a cada mudança.
   - O sistema consulta a notificação com as próprias credenciais: não confia no corpo do aviso.
   - Os eventos são aplicados de forma idempotente: fatura paga ativa o plano; fatura não paga deixa a assinatura `past_due` (com 7 dias de tolerância); cancelamento encerra.

Sem as variáveis Efí, o sistema funciona com teste grátis e liberação manual de planos pelo `/admin`.

## 2. Polo: taxa de matrícula

O dinheiro da taxa cai **direto na conta Efí do polo**; a plataforma não intermedeia.

1. **Aplicação do polo.** O polo cria a própria aplicação na Efí, com o escopo de cobranças.
2. **Cadastro no sistema.** Em **CRM → Proposta e pagamentos → Conta Efí do polo**, o dono informa Client ID, Client Secret e se é homologação.
   - O sistema testa as credenciais antes de salvar.
   - O Client Secret é cifrado com AES-256-GCM (`APP_ENCRYPTION_KEY`) e guardado em `private.payment_accounts`, tabela que o navegador não acessa.
3. **Cobrança.** No painel do lead, "Gerar link de pagamento" cria um link Efí (Pix, boleto ou cartão) no valor da taxa.
   - O link usa `notification_url` = `APP_URL/api/webhooks/efi-polo/<empresa>?secret=<segredo do polo>`. O segredo é gerado pelo sistema, um por polo.
4. **Confirmação.** Quando a Efí avisa o pagamento:
   - o sistema consulta a notificação com as credenciais do polo e confirma a cobrança daquela empresa;
   - o lead vai para **Taxa paga**;
   - avisos repetidos não duplicam a confirmação.

### Sem conta Efí: Pix copia-e-cola

Com só a **chave Pix** cadastrada (mais nome e cidade do recebedor), "Gerar Pix" cria o código copia-e-cola e o QR (padrão BR Code do Banco Central) no valor da taxa. A equipe confirma com **Marcar como pago** quando o valor entrar na conta.

## Testes em homologação

- **Plataforma:** use `EFI_SANDBOX=true`. A APP_URL precisa ser pública (por exemplo, um túnel) para a Efí alcançar o webhook.
- **Polo:** marque "homologação" no cadastro da conta.
- **Pagamento simulado:** pague o boleto ou Pix de homologação pelo painel da Efí; a notificação chega ao webhook.
