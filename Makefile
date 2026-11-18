# Atalhos da stack Docker. `make help` lista os alvos.
COMPOSE      = docker compose --env-file .env.docker.resolved
COMPOSE_DEV  = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help env email-provider up build down dev seed migrate cron logs logs-app ps psql keys clean

help: ## Lista os atalhos
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

.env.docker:
	cp .env.docker.example .env.docker
	@echo "→ .env.docker criado a partir do modelo (chaves de desenvolvimento)"

# Resolve EMAIL_PROVIDER (gmail/brevo/resend) em .env.docker para o bloco SMTP_*
# efetivo que GoTrue e o app leem. Refeito sempre que .env.docker muda.
.env.docker.resolved: .env.docker docker/resolve-email-provider.sh
	@sh docker/resolve-email-provider.sh .env.docker

env: .env.docker ## Cria o .env.docker se não existir

email-provider: .env.docker.resolved ## Mostra/recalcula qual provedor de e-mail (EMAIL_PROVIDER) está ativo

up: .env.docker.resolved ## Build + migrations + aplicação (produção)
	$(COMPOSE) up -d --build
	@echo "→ http://localhost:3000"

build: .env.docker.resolved ## Reconstrói a imagem da aplicação
	$(COMPOSE) build app

down: .env.docker.resolved ## Para a stack (mantém os dados)
	$(COMPOSE) --profile seed --profile cron down

dev: .env.docker.resolved ## Aplicação com hot reload (next dev)
	$(COMPOSE_DEV) up -d --build

seed: .env.docker.resolved ## Clínica e usuários de demonstração
	$(COMPOSE) --profile seed run --rm --build seed

migrate: .env.docker.resolved ## Reaplica migrations pendentes
	$(COMPOSE) run --rm migrate

cron: .env.docker.resolved ## Sobe o agendador das rotinas /api/cron/*
	$(COMPOSE) --profile cron up -d cron

logs: .env.docker.resolved ## Logs de tudo
	$(COMPOSE) logs -f --tail=100

logs-app: .env.docker.resolved ## Logs da aplicação
	$(COMPOSE) logs -f --tail=100 app

ps: .env.docker.resolved ## Estado dos serviços
	$(COMPOSE) ps -a

psql: .env.docker.resolved ## Abre o psql no banco
	$(COMPOSE) exec db psql -U postgres

keys: ## Gera JWT_SECRET, ANON_KEY e SERVICE_ROLE_KEY
	node docker/generate-keys.mjs

clean: .env.docker.resolved ## APAGA a stack e os volumes (banco e arquivos)
	$(COMPOSE) --profile seed --profile cron down -v --remove-orphans