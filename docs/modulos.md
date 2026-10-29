# Módulos e rotas

## Área administrativa (`/app`)

| Rota | Módulo | O que faz | Permissão |
|---|---|---|---|
| `/app` | Dashboard | Indicadores do período, gráficos e listas (aniversariantes, inadimplentes, risco de evasão, reavaliações) via `dashboard_summary`, `dashboard_charts`, `dashboard_lists` | `dashboard.view` |
| `/app/agenda` | Agenda | Grade por dia/semana, sala e profissional; aulas individuais e em grupo; recorrências (horário fixo); lista de espera; créditos de reposição; check-in; conflitos validados no banco (`check_schedule_conflicts`) | `schedule.view` |
| `/app/checkin` | Check-in | Quiosque de autoatendimento por token do aluno | `schedule.view` |
| `/app/alunos` | Alunos | Cadastro completo, ficha com abas (resumo, dados, agenda, financeiro, clínico, avaliações, documentos, mensagens, programas), importação CSV | `patients.view` |
| `/app/prontuarios` | Prontuário | Prontuário versionado e evoluções por atendimento, com adendos e bloqueio de alteração após finalizar | `medical_records.view` |
| `/app/avaliacoes` | Avaliações | Anamnese (interna ou por link público), avaliação física com campos configuráveis, fotos posturais, comparação entre avaliações | `assessments.view` |
| `/app/exercicios` | Exercícios | Biblioteca por categoria e programas de treino do aluno | `exercises.view` |
| `/app/planos` | Planos | Planos (mensal, pacote de sessões, frequência semanal), assinaturas, pausas e trocas | `plans.view` |
| `/app/financeiro` | Financeiro | Visão geral, contas a receber e a pagar, fluxo de caixa, inadimplência, comissões, configurações; pagamentos, estornos, recibos e caixa | `finance.view` |
| `/app/crm` | CRM | Quadro de leads por estágio, histórico de interações, conversão em aluno, aulas experimentais | `crm.view` |
| `/app/comunicacao` | Comunicação | Envio e fila de mensagens (WhatsApp, e-mail, SMS) com modelos e histórico por aluno | `communication.view` |
| `/app/equipe` | Equipe | Profissionais, horários de trabalho, folgas e vínculo com unidades | `staff.view` |
| `/app/estoque` | Estoque | Produtos, movimentações (entrada, saída, venda) e fornecedores | `inventory.view` |
| `/app/equipamentos` | Equipamentos | Aparelhos, status e manutenções programadas | `equipment.view` |
| `/app/relatorios` | Relatórios | Agenda, financeiro, alunos, marketing, equipe e administrativo, com exportação | `reports.view` |
| `/app/tarefas` | Tarefas | Tarefas da equipe com responsável e prazo | `tasks.view` |
| `/app/notificacoes` | Notificações | Central de notificações internas | — |
| `/app/configuracoes` | Configurações | 14 seções (ver abaixo) | varia |

### Configurações (`/app/configuracoes`)

| Seção | Conteúdo | Permissão | Implementada |
|---|---|---|---|
| `clinica` | Dados da clínica, contatos, logo, identidade visual | `settings.view` | sim |
| `unidades` | Unidades, horários, feriados e bloqueios | `settings.view` | sim |
| `salas` | Salas e capacidade simultânea | `settings.view` | sim |
| `modalidades` | Tipos de atendimento, duração, vagas, valores | `settings.view` | sim |
| `perfis` | Matriz de permissões por perfil | `users.view` | sim |
| `usuarios` | Convites da equipe e unidades de acesso | `users.view` | sim |
| `regras` | Reposição, cancelamento, agendamento online, lembretes | `settings.view` | **não** |
| `modelos` | Contratos, documentos, mensagens, anamneses, avaliações | `settings.view` | **não** |
| `integracoes` | WhatsApp, e-mail, pagamentos, Google Agenda, NFS-e | `settings.view` | **não** |
| `site` | Textos, imagens, FAQ, blog, depoimentos | `website.view` | **não** |
| `lgpd` | Políticas versionadas, consentimentos, titulares | `lgpd.view` | **não** |
| `auditoria` | Histórico imutável de ações sensíveis | `audit.view` | **não** |
| `backup` | Política, histórico e restauração | `settings.view` | **não** |
| `conta` | Dados pessoais, senha e sessões | — | **não** |

Ver [Estado atual](#estado-atual) sobre as seções não implementadas.

## Portal do Aluno (`/portal`)

| Rota | O que faz |
|---|---|
| `/portal` | Próximas aulas, pendências financeiras e avisos (`portal_me`) |
| `/portal/aulas` | Histórico e próximas aulas; confirmar, cancelar, entrar na lista de espera |
| `/portal/agendar` | Agendamento conforme as regras da clínica (`portal_available_slots`, `portal_book`) |
| `/portal/financeiro` | Cobranças, PIX/boleto e recibos (`portal_financial`) |
| `/portal/documentos` | Contratos e documentos, com aceite e assinatura (`portal_sign_document`) |
| `/portal/perfil` | Dados cadastrais e senha |

Todo o portal usa exclusivamente funções `portal_*` — o aluno nunca lê
tabelas diretamente.

## Site público

| Rota | Conteúdo |
|---|---|
| `/` | Home com hero, benefícios, modalidades, equipe, planos, depoimentos, FAQ, galeria e JSON-LD |
| `/sobre`, `/pilates`, `/modalidades`, `/equipe`, `/estrutura`, `/planos`, `/depoimentos`, `/perguntas-frequentes` | Páginas institucionais alimentadas pelo banco |
| `/blog`, `/blog/[slug]` | Blog com SEO por post |
| `/contato` | Formulário que cria lead (`public_create_lead`) |
| `/agendar` | Aula experimental sem login (`public_booking_options`, `public_available_slots`, `public_book_trial`) |
| `/privacidade`, `/termos` | Documentos legais versionados |
| `/anamnese/[token]` | Anamnese preenchida pelo aluno por link, sem conta |

## Rotas HTTP (`/api`)

| Rota | Método | Autorização | Para que serve |
|---|---|---|---|
| `/api/health` | GET | pública | Status da aplicação e latência do banco |
| `/api/cron/daily` | GET | `Bearer CRON_SECRET` | Vencidos, renovações, recorrências, créditos, automações, fila |
| `/api/cron/messages` | GET | `Bearer CRON_SECRET` | Fila de mensagens (rodar a cada 5–15 min) |
| `/api/webhooks/[provider]` | POST | assinatura do provedor | Asaas, Mercado Pago, Stripe, WhatsApp |
| `/api/contracts/[id]/pdf` | GET | permissão + sessão | Contrato em PDF |
| `/api/documents/[id]/pdf` | GET | permissão + sessão | Documento em PDF |
| `/api/receipts/[paymentId]` | GET | permissão + sessão | Recibo de pagamento |
| `/api/export/[resource]` | GET | permissão do recurso | XLSX/CSV |
| `/api/files/attachment/[id]`, `/api/files/payable/[id]` | GET | permissão | Redireciona para URL assinada |
| `/api/lgpd/export/[patientId]` | GET | `lgpd.manage` | Portabilidade dos dados do titular |

`/api/webhooks/*` e `/api/cron/*` ficam fora do matcher do middleware
(autenticam por assinatura/segredo, não por cookie).

## Estado atual

Pontos em que o código atual não cobre o que a navegação promete — útil
para planejar os próximos passos:

- **8 seções de configurações sem página**: `regras`, `modelos`,
  `integracoes`, `site`, `lgpd`, `auditoria`, `backup`, `conta`. As pastas
  existem vazias em `src/app/app/configuracoes/`, e os links aparecem no
  menu: acessá-los dá 404. As tabelas, RPCs e permissões correspondentes já
  existem no banco.
- **`/app/documentos`** está no menu lateral (`lib/permissions.ts`), mas a
  rota não existe.
- **`npm run backup`** aponta para `scripts/backup.ts`, que não está no
  repositório (a tabela `backup_runs` existe).
- **Sentry** está preparado, porém não instalado (`@sentry/nextjs` não é
  dependência).
- **Push** é um canal previsto em `messaging.ts`, mas sempre responde
  "ainda não configurado".
