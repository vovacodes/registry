idl/registry.json:
	mkdir -p idl
	cp ../target/idl/registry.json ./idl/registry.json

start: export KEYPAIR ?= $(shell cat ./oracle_test_keypair.json)
start: idl/registry.json
	npx functions-framework --target=githubOracle

deploy: idl/registry.json
	gcloud functions deploy githubOracle --runtime nodejs16 --trigger-http --allow-unauthenticated

.PHONY: start idl/registry.json
