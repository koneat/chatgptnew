SHELL := /bin/bash

.PHONY: init build up down restart logs shell health check clean

init:
	@if [ ! -f .env ]; then cp .env.example .env; echo "created .env"; else echo ".env already exists"; fi
	@mkdir -p workspace reports data config

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker logs -f hexstrike-ai

shell:
	docker exec -it hexstrike-ai /bin/bash

health:
	curl -fsS http://127.0.0.1:$${HEXSTRIKE_PORT:-8888}/health

check:
	docker exec -it hexstrike-ai /entrypoint.sh check

clean:
	docker compose down -v --remove-orphans
