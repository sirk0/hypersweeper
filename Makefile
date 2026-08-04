VENV ?= .venv
PY ?= $(VENV)/bin/python

WEB_STAGE = build/hypersweeper
WEB_OUT = $(WEB_STAGE)/build/web

.PHONY: help venv install lock test lint run screenshots web-screenshots \
        web-prepare web-package web-run clean \
        mac-app mac-app-dmg desktop-install desktop-build desktop-run \
        desktop-test desktop-smoke desktop-icon \
        ios-app ios-run ios-prepare ios-install ios-icon

help:            ## list available targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/ -/' | sort

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
	$(PY) -m ruff check minesweeper tests main.py

run:             ## run the pygame game
	$(PY) -m minesweeper

screenshots:     ## regenerate the pygame shot in docs/screenshots/pygame
	PYTHONPATH=. $(PY) scripts/make_screenshots.py

web-screenshots: ## regenerate the README gallery from the TypeScript app
	cd web && npm run screenshots

web-prepare:     ## stage the browser app files into $(WEB_STAGE)
	rm -rf $(WEB_STAGE)
	mkdir -p $(WEB_STAGE)
	cp main.py $(WEB_STAGE)/
	cp -r minesweeper $(WEB_STAGE)/minesweeper
	cp -r data $(WEB_STAGE)/data  # shared JSON config read at runtime

# Not deployed any more — the TypeScript app in web/ is what GitHub Pages
# serves. Kept for running the pygame build in a browser locally.
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
# built web app is staged into the Electron shell in desktop/ and served from
# the app:// scheme inside the bundle. See desktop/README.md.

mac-app:         ## build Hypersweeper.app into build/desktop (macOS only)
	scripts/build-mac-app.sh

mac-app-dmg:     ## build Hypersweeper.app plus a .dmg installer (macOS only)
	scripts/build-mac-app.sh --dmg

desktop-install: ## install the Electron shell's build tools
	cd desktop && npm install

desktop-build:   ## build the offline web bundle and stage it into the shell
	cd web && VITE_PACKAGED=1 npm run build
	node scripts/check-offline-assets.mjs web/dist
	rm -rf desktop/app && cp -R web/dist desktop/app

desktop-run: desktop-build  ## run the packaged game in the Electron shell
	cd desktop && npm start

desktop-test:    ## unit-test the shell's app:// path resolution
	cd desktop && npm test

desktop-smoke:   ## launch the shell with the network cut, and screenshot it
	scripts/desktop-smoke.sh

desktop-icon:    ## regenerate the app icon from the shared vector source
	cd web && node scripts/make-icons.mjs

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

ios-install:     ## install the Capacitor tooling (it lives in web/)
	cd web && npm install

ios-icon:        ## regenerate the app icon and launch image from the vector source
	cd web && node scripts/make-icons.mjs

clean:           ## remove build artifacts
	rm -rf build desktop/app ios/App/App/public
