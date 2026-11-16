# Atalhos da stack Docker. `make help` lista os alvos.
COMPOSE      = docker compose --env-file .env.docker
COMPOSE_DEV  = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help env up build down dev seed migrate cron logs logs-app ps psql keys clean

help: ## Lista os atalhos
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

.env.docker:
	cp .env.docker.example .env.docker
	@echo "→ .env.docker criado a partir do modelo (chaves de desenvolvimento)"

env: .env.docker ## Cria o .env.docker se não existir

up: .env.docker ## Build + migrations + aplicação (produção)
	$(COMPOSE) up -d --build
	@echo "→ http://localhost:3000"

build: .env.docker ## Reconstrói a imagem da aplicação
	$(COMPOSE) build app

down: ## Para a stack (mantém os dados)
	$(COMPOSE) --profile seed --profile cron down

dev: .env.docker ## Aplicação com hot reload (next dev)
	$(COMPOSE_DEV) up -d --build

seed: .env.docker ## Clínica e usuários de demonstração
	$(COMPOSE) --profile seed run --rm --build seed

migrate: .env.docker ## Reaplica migrations pendentes
	$(COMPOSE) run --rm migrate

cron: .env.docker ## Sobe o agendador das rotinas /api/cron/*
	$(COMPOSE) --profile cron up -d cron

logs: ## Logs de tudo
	$(COMPOSE) logs -f --tail=100

logs-app: ## Logs da aplicação
	$(COMPOSE) logs -f --tail=100 app

ps: ## Estado dos serviços
	$(COMPOSE) ps -a

psql: ## Abre o psql no banco
	$(COMPOSE) exec db psql -U postgres

keys: ## Gera JWT_SECRET, ANON_KEY e SERVICE_ROLE_KEY
	node docker/generate-keys.mjs

clean: ## APAGA a stack e os volumes (banco e arquivos)
	$(COMPOSE) --profile seed --profile cron down -v --remove-orphans
