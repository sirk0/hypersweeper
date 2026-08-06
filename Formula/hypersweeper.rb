# The Homebrew formula for the offline macOS app. This repo is its own tap:
#
#   brew tap sirk0/hypersweeper https://github.com/sirk0/hypersweeper
#   brew install hypersweeper
#
# It is a formula rather than a cask because nothing binary is published: the
# app is built here, on the machine installing it, from the source tarball
# GitHub generates for the tag. `url` and `sha256` are rewritten by
# scripts/update-formula.py, which .github/workflows/release.yml runs after
# pushing each tag.
class Hypersweeper < Formula
  desc "Minesweeper on flat tilings, polyhedra and closed surfaces"
  homepage "https://github.com/sirk0/hypersweeper"
  url "https://github.com/sirk0/hypersweeper/archive/refs/tags/v0.2.50.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"
  head "https://github.com/sirk0/hypersweeper.git", branch: "master"

  # node builds the game and packages the shell; neither is needed afterwards,
  # because everything the app draws ends up inside the bundle.
  depends_on "node" => :build
  depends_on :macos

  def install
    # The same script a maintainer runs locally, unchanged and with no
    # release-only path: it builds web/ with VITE_PACKAGED=1, refuses to package
    # a bundle that references a remote URL, runs the shell's unit tests, and
    # ad-hoc signs the result. No arch flag, so this builds only the slice this
    # Mac needs. --no-verify skips its launch check, which the test block below
    # does properly, against the installed bundle rather than the staged one.
    system "scripts/build-mac-app.sh", "--no-verify"

    built = Dir["build/desktop/mac*/Hypersweeper.app"].first
    odie "the build produced no Hypersweeper.app" if built.nil?
    prefix.install built

    # Apple Silicon refuses to launch a binary with no valid signature, and
    # installing a keg can touch Mach-O files, so re-sign where it landed
    # rather than trusting the signature made in the build directory.
    system "codesign", "--force", "--deep", "--sign", "-", app_bundle
    system "codesign", "--verify", "--deep", "--strict", app_bundle

    # A launcher, so the game is reachable without knowing the prefix. It execs
    # the real executable rather than symlinking it: Electron resolves its
    # resources relative to the binary's own path.
    (bin/"hypersweeper").write <<~SH
      #!/bin/bash
      exec "#{opt_prefix}/Hypersweeper.app/Contents/MacOS/Hypersweeper" "$@"
    SH
    chmod 0755, bin/"hypersweeper"
  end

  def app_bundle
    prefix/"Hypersweeper.app"
  end

  def caveats
    <<~EOS
      Hypersweeper.app was built for this Mac and installed to:
        #{opt_prefix}/Hypersweeper.app

      Homebrew formulae may not install into /Applications. To put it in
      Launchpad and Spotlight, link it there:
        ln -sfn #{opt_prefix}/Hypersweeper.app /Applications/Hypersweeper.app

      Or run it as it is:
        hypersweeper
    EOS
  end

  test do
    # The bundle's own self-check (desktop/main.mjs): load the game over app://
    # with every off-bundle request cancelled, wait for it to report itself
    # ready, and screenshot it. It exits non-zero if the app asks the network
    # for anything, logs a console error, or never draws — so this tests the
    # property the whole desktop build exists for, against what was installed.
    shot = testpath/"smoke.png"
    system opt_prefix/"Hypersweeper.app/Contents/MacOS/Hypersweeper",
           "--smoke=#{shot}", "--route=?mode=hexhex&difficulty=easy&seed=7"
    assert_path_exists shot
  end
end
