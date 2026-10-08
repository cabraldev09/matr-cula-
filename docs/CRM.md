# CRM de matrículas

O módulo `crm` está nos planos Atendimento e Completo. O menu "CRM" tem quatro páginas: Funil de matrículas, Propostas, Cursos e preços, e Proposta e pagamentos. As duas últimas são só para dono e administrador.

## Primeiros passos do polo

1. **Cursos e preços** (`/crm/cursos`): cadastre os cursos ou importe a planilha (colar ou CSV). Uma linha por curso, no formato abaixo.
   ```
   nome;modalidade;semestres;mensalidade bruta;primeira mensalidade
   Biomedicina;Semipresencial - Graduação;8;1014,70;306,75
   ```
   A bolsa é calculada como `1 − primeira ÷ bruta`; no exemplo, 69,77%.
2. **Proposta e pagamentos** (`/crm/configuracoes`):
   - Instituição, CNPJ e logo da proposta. A logo pode ser enviada pelo polo, ser o modelo "Cruzeiro do Sul Virtual" (para polos parceiros autorizados) ou ficar sem logo.
   - Regras da proposta: taxa de matrícula, vencimento, pontualidade, bolsas por semestre e reajustes. Os padrões reproduzem o modelo da instituição.
   - Chave Pix do polo, para o Pix copia-e-cola.
   - Conta Efí do polo, para o link de pagamento com confirmação automática (veja [COBRANCA-EFI.md](COBRANCA-EFI.md)).
3. **Canal de WhatsApp** em Atendimento → Canais.

## Do WhatsApp à matrícula

1. **Lead imediato.** A primeira mensagem de um contato abre a conversa, e o banco cria o lead em **Novo lead** no mesmo instante, pelo trigger `conversations_lead`.
2. **Curso reconhecido.** Cada mensagem recebida é comparada com o catálogo do polo, sem considerar acentos nem prefixos como "CST em". O curso encontrado preenche o lead se ele ainda não tiver curso.
3. **Qualificação.** No painel do lead preencha modalidade, forma de ingresso, escolaridade, semestre de início, estudos anteriores e responsável. A nota vai de 0 a 100 e é calculada pelo banco:

   | Critério | Pontos |
   | --- | --- |
   | Curso definido | +25 |
   | Modalidade | +10 |
   | Forma de ingresso | +10 |
   | Estudos anteriores | +15 |
   | Semestre de início | +15 |
   | 3 ou mais mensagens recebidas | +15 |
   | Proposta emitida | +10 |

   Temperatura: 70 pontos ou mais é **quente**, de 40 a 69 é **morno** e abaixo de 40 é **frio**.
4. **Proposta de bolsa.** O botão "Gerar proposta" cria a proposta numerada por empresa.
   - Ela sai no layout do modelo: resumo, faixas de pontualidade, projeção de 5% a 11% por semestre, produto e mensagem final.
   - Os dados e as regras da emissão ficam guardados na proposta, e o lead vai para **Proposta enviada**.
   - O aluno abre o link público `/proposta/[token]` (sem login, fora dos buscadores), que tem o botão para baixar o PDF.
   - "Enviar no WhatsApp" manda o link pela conversa aberta.
5. **Taxa de matrícula.** Pode ser cobrada de duas formas:
   - **Pix copia-e-cola** com a chave do polo, com QR na página da proposta. A equipe clica "Marcar como pago" quando o dinheiro entra.
   - **Link Efí** do polo (Pix, boleto e cartão). A confirmação chega pelo webhook e é automática.

   Nos dois casos o lead vai para **Taxa paga**. A confirmação é idempotente: repetir não duplica.
6. **Matriculado** ou **Perdido** (com motivo): basta arrastar no kanban ou escolher a etapa no topo do painel.

## Integrações

- **Atendimento:** a conversa mostra a etapa e a temperatura do lead, com o link "Ver no CRM" (`/crm?lead=<id>`).
- **Análise curricular:** "Analisar histórico" abre uma nova análise para quem já estudou.
- **Relatórios:** mostram leads por etapa, curso e origem; o percentual que recebeu proposta e que pagou a taxa; e as taxas recebidas no período.

## Regras de cálculo (motor `web/src/domain/proposal/pricing.ts`)

As regras foram conferidas contra seis propostas reais (veja `tests/unit/domain/proposal-pricing.test.ts`).

- **Pontualidade:** até o dia 10 vale a 1ª mensalidade. Entre os dias 11 e 25, a mensalidade vezes 1,15. Depois do vencimento, vezes 1,25.
- **Bolsa por semestre:** 25% no 1º semestre e 20% depois, com ajuste de bolsa de 5% no 2º semestre.
- **Reajuste semestral:** 2% do 2º ao 5º semestre e 3% a partir do 6º.
- **Reajuste anual:** 5% (mínimo) ou 11% (máximo), aplicado nos semestres ".1".
- **Mensalidade:** é a anterior × (1 + soma dos ajustes). O cálculo é encadeado e só arredonda na exibição.
