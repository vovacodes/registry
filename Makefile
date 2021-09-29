bootstrap:
	@which anchor > /dev/null || (cargo install --git https://github.com/project-serum/anchor --tag v0.16.0 anchor-cli --locked)

build: bootstrap
	anchor build

test: bootstrap
	@if [[ -z "${GH_TOKEN}" ]]; then echo "💥 To run end-to-end tests locally, set GH_TOKEN env variable."; exit 1; fi

	npx concurrently -n oracle,test -c yellow,magenta --kill-others --success=first \
		"make -C ./github-oracle start" \
		"anchor test --provider.cluster localnet -- --features='local_test'"

deploy:
	anchor deploy --provider.cluster devnet

build-and-deploy: build deploy

deploy-oracle:
	make -C ./github-oracle deploy

start:
	npm start

.PHONY: bootstrap build deploy build-and-deploy start test
