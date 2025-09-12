.PHONY: build up down restart logs ps update sh

build:
\tdocker compose build

up:
\tdocker compose up -d --build

down:
\tdocker compose down

restart:
\tdocker compose restart bridge

logs:
\tdocker compose logs -f bridge

ps:
\tdocker compose ps

update: ## rebuild + restart (por cambios en bridge.js)
\tdocker compose up -d --build

sh:
\tdocker compose exec bridge sh || docker exec -it $$(docker ps -qf name=bridge) sh
