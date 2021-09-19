bootstrap:
	@which anchor > /dev/null || (cargo install --git https://github.com/project-serum/anchor --tag v0.16.0 anchor-cli --locked)

build: bootstrap
	anchor build

deploy:
	anchor deploy

build-and-deploy: build deploy

start:
	npm start

.PHONY: bootstrap build deploy build-and-deploy start
