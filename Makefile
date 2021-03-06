NODE_VERSION=4.4.0
.PHONY: help install npm clean test coverage lint build run-debug run-prod stop-prod run-prod run-debug chown

.DEFAULT_GOAL := help

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# If the first argument is one of the supported commands...
SUPPORTED_COMMANDS := version
SUPPORTS_MAKE_ARGS := $(findstring $(firstword $(MAKECMDGOALS)), $(SUPPORTED_COMMANDS))
ifneq "$(SUPPORTS_MAKE_ARGS)" ""
    # use the rest as arguments for the command
    COMMAND_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
    # ...and turn them into do-nothing targets
    $(eval $(COMMAND_ARGS):;@:)
endif

install: ## install depedencies thanks to a dockerized npm install
	@docker run -it --rm -v $$(pwd):/app -w /app --net=host -e NODE_ENV -e http_proxy -e https_proxy node:${NODE_VERSION} npm install -q
	@make chown

build: ## build the docker inistcnrs/ezmaster image localy
	@docker build -t inistcnrs/ezmaster --build-arg http_proxy --build-arg https_proxy .

run-debug: ## run ezmaster in debug mode with dockerized nodejs and mongodb process
	@docker-compose -f ./docker-compose.debug.yml up -d
	@# attach to the ezmaster container in order to be able to stop it easily with CTRL+C
	@docker attach ezmaster

run-prod: ## run ezmaster in production mode with the full dockerized image (see build)
	@docker-compose -f ./docker-compose.yml up -d

start-prod: ## start ezmaster production daemon (needs a first run-prod the first time)
	@docker-compose -f ./docker-compose.yml start

stop-prod: ## stop ezmaster production daemon
	@docker-compose -f ./docker-compose.yml stop

# makefile rule used to keep current user's unix rights on the docker mounted files
chown:
	@test ! -d $$(pwd)/node_modules || docker run -it --rm --net=host -v $$(pwd):/app node:${NODE_VERSION} chown -R $$(id -u):$$(id -g) /app/

npm: ## npm wrapper. example: make npm install --save mongodb-querystring
	@docker run -it --rm -v $$(pwd):/app -w /app --net=host -e NODE_ENV -e http_proxy -e https_proxy node:${NODE_VERSION} npm $(filter-out $@,$(MAKECMDGOALS))
	@make chown

test: ## run ezmaster unit tests
	@docker-compose -f ./docker-compose.debug.yml exec ezmaster npm test

coverage: ## run istanbul to have how much % of the ezmaster code is covered by tests
	@docker-compose -f ./docker-compose.debug.yml exec ezmaster ./node_modules/.bin/istanbul cover ./node_modules/.bin/_mocha -- -R spec

lint: ## checks the coding rules (in a dockerized process)
	@docker run -it --rm -v $$(pwd):/app -w /app -e NODE_ENV -e http_proxy -e https_proxy node:${NODE_VERSION} ./node_modules/.bin/eslint *.js components/ heartbeats/ helpers/ loaders/ routes/ test/ views/ assets/

clean: ## remove node_modules and temp files
	@rm -Rf ./node_modules/ ./npm-debug.log

version: ## creates a new ezmaster version (same way npm version works)
ifdef COMMAND_ARGS
	@npm version $(COMMAND_ARGS)
else
	@echo "Usage: make version <arg> (same as npm syntax)"
	@npm version --help
endif
