VENV ?= .venv
PY ?= $(VENV)/bin/python

WEB_STAGE = build/hypersweeper
WEB_OUT = $(WEB_STAGE)/build/web

.PHONY: help venv install lock test lint run screenshots web-screenshots web-e2e-docker \
        metrics dashboards-check web-prepare web-package web-run clean \
        mac-app mac-app-dmg desktop-install desktop-build desktop-run \
        desktop-test desktop-smoke desktop-icon \
        ios-app ios-run ios-prepare ios-install ios-icon ios-stickers \
        reptiles-install reptiles-run reptiles-test reptiles-e2e

help:            ## list available targets
	@grep -E '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/ -/' | sort

venv:            ## create .venv and install every dependency group
	python3 -m venv $(VENV)
	$(PY) -m pip install -r requirements-all.txt

install:         ## install every dependency group into $(PY)
	$(PY) -m pip install -r requirements-all.txt

lock:            ## regenerate the lock files from pyproject.toml
	uv pip compile pyproject.toml -o requirements.txt --universal
	uv pip compile pyproject.toml --extra web -o requirements-web.txt --universal
	uv pip compile pyproject.toml --extra test -o requirements-test.txt --universal
	uv pip compile pyproject.toml --all-extras -o requirements-all.txt --universal

test:            ## run the test suite
	$(PY) -m pytest -q

lint:            ## ruff over the code and tests
	$(PY) -m ruff check minesweeper tests scripts main.py

run:             ## run the pygame game
	$(PY) -m minesweeper

screenshots:     ## regenerate the pygame shot in docs/screenshots/pygame
	PYTHONPATH=. $(PY) scripts/make_screenshots.py

web-screenshots: ## regenerate the README gallery from the TypeScript app
	cd apps/hypersweeper && npm run screenshots

# For developers who are not on Linux: the visual baselines are `-chromium-linux`
# pixels, so gallery.spec.ts skips itself elsewhere and this is where those 41
# shots get compared. Needs Docker with linux/amd64 emulation (Rosetta on Apple
# Silicon, which Docker Desktop enables by default). Pass flags through as
# ARGS="--update-snapshots". See "Running the visual suite off Linux" in
# apps/hypersweeper/docs/testing.md.
web-e2e-docker:  ## run the whole Playwright suite, visual baselines included, on Linux
	cd apps/hypersweeper && npm run e2e:docker -- $(ARGS)

# Needs CF_ACCOUNT_ID and a read-only CF_API_TOKEN (Account Analytics: Read).
# Pass flags through as ARGS="--days=7 --mode=klein".
metrics:         ## play counts and win rates from the deployed app
	node scripts/metrics.mjs $(ARGS)

# Runs every panel in grafana/*.json against the Analytics Engine SQL API and
# says which came back — the dialect is a narrow ClickHouse subset, and a panel
# naming a function it does not have renders as an empty box rather than an
# error. Needs the same read-only token as `metrics`; pass --print instead to
# dump the interpolated SQL without credentials.
dashboards-check: ## check every Grafana panel's SQL against the real dataset
	node scripts/check_dashboards.mjs $(ARGS)

web-prepare:     ## stage the browser app files into $(WEB_STAGE)
	rm -rf $(WEB_STAGE)
	mkdir -p $(WEB_STAGE)
	cp main.py $(WEB_STAGE)/
	cp -r minesweeper $(WEB_STAGE)/minesweeper
	cp -r data $(WEB_STAGE)/data  # shared JSON config read at runtime

# Not deployed any more — the TypeScript app in apps/hypersweeper/ is what the deploy
# publishes. Kept for running the pygame build in a browser locally.
web-package: web-prepare  ## build the browser bundle into $(WEB_OUT)
	$(PY) -m pygbag --ume_block 0 --build $(WEB_STAGE)
	PYTHONPATH=. $(PY) scripts/make_web_icons.py $(WEB_OUT)

web-run: web-prepare  ## serve the web version at http://localhost:8000
	@# pygbag regenerates its default favicon and index.html at server
	@# start; swap in our icons and apple-touch-icon link once it's up
	( sleep 5 && PYTHONPATH=. $(PY) scripts/make_web_icons.py $(WEB_OUT) ) &
	$(PY) -m pygbag --ume_block 0 $(WEB_STAGE)

# --- desktop app -------------------------------------------------------------
# The TypeScript app packaged as a native macOS app that plays offline: the
# built web app is staged into the Electron shell in shells/desktop/ and served from
# the app:// scheme inside the bundle. See shells/desktop/README.md.

mac-app:         ## build Hypersweeper.app into build/desktop (macOS only)
	scripts/build-mac-app.sh

mac-app-dmg:     ## build Hypersweeper.app plus a .dmg installer (macOS only)
	scripts/build-mac-app.sh --dmg

desktop-install: ## install the Electron shell's build tools
	cd shells/desktop && npm install

desktop-build:   ## build the offline web bundle and stage it into the shell
	cd apps/hypersweeper && VITE_PACKAGED=1 npm run build
	node scripts/check-offline-assets.mjs apps/hypersweeper/dist
	rm -rf shells/desktop/app && cp -R apps/hypersweeper/dist shells/desktop/app

desktop-run: desktop-build  ## run the packaged game in the Electron shell
	cd shells/desktop && npm start

desktop-test:    ## unit-test the shell's app:// path resolution
	cd shells/desktop && npm test

desktop-smoke:   ## launch the shell with the network cut, and screenshot it
	scripts/desktop-smoke.sh

desktop-icon:    ## regenerate every app icon from the shared vector source (macOS + Xcode)
	cd apps/hypersweeper && npm run icons

# --- iOS app -----------------------------------------------------------------
# The TypeScript app packaged as an iPhone app: the built bundle is synced into
# the Capacitor project in ios/ and Xcode signs and installs it. This is the
# build that can buzz — @capacitor/haptics reaches the Taptic Engine, which no
# web API on iOS can. Needs a Mac with Xcode; see ios/README.md.

ios-app:         ## build the game and open the iPhone project in Xcode (macOS)
	scripts/build-ios-app.sh --open

ios-run:         ## build and install straight onto a connected iPhone (macOS)
	scripts/build-ios-app.sh --run

ios-prepare:     ## build the bundle and sync it into ios/ (works anywhere)
	scripts/build-ios-app.sh --prepare-only

ios-install:     ## install the Capacitor tooling (the npm workspace at the repo root)
	npm install

ios-icon:        ## regenerate the app icons and launch image from the vector source (macOS + Xcode)
	cd apps/hypersweeper && npm run icons

ios-stickers:    ## render the iMessage sticker pack from the game's boards (SWIFTSHADER=1 with no GPU)
	cd apps/hypersweeper && npm run stickers

reptiles-install: ## install Rep-tiles' toolchain (the npm workspace at the repo root)
	npm install

reptiles-run:    ## run Rep-tiles at http://localhost:5174
	cd apps/reptiles && npm run dev

reptiles-test:   ## typecheck and unit-test Rep-tiles
	cd apps/reptiles && npm run typecheck && npm run test

reptiles-e2e:    ## Rep-tiles' Playwright smoke test against its production bundle
	cd apps/reptiles && npm run e2e

clean:           ## remove build artifacts
	rm -rf build shells/desktop/app ios/App/App/public
