// The /next/ redirect, in a file rather than inline in index.html.
//
// Not a style choice: the site is served under a Content-Security-Policy with
// `script-src 'self'` (public/_headers), and an inline <script> needs either
// `'unsafe-inline'` — which would hand every page on the origin the thing the
// policy exists to withhold — or a hash recomputed on every edit. Cloudflare
// merges the rules that match a path and browsers enforce every policy they are
// sent, so a looser rule for /next/ cannot subtract from the site-wide one: it
// would be intersected with it, and the inline script would stay blocked. The
// only way /next/ gets an exception is if it does not need one.
//
// The <style> next door stays inline: the policy allows `'unsafe-inline'` for
// styles, which are not a script-execution primitive.
(function () {
  // Keep the shared board link (?mode=…&difficulty=…&seed=…) and any
  // hash: a /next/ link with parameters must open the same board here.
  var target = "../" + window.location.search + window.location.hash;
  function go() {
    window.location.replace(target);
  }
  var sw = navigator.serviceWorker;
  if (!sw || !sw.getRegistrations) {
    go();
    return;
  }
  // Redirect regardless of how the cleanup goes, and never hang on it.
  var done = false;
  function once() {
    if (!done) {
      done = true;
      go();
    }
  }
  setTimeout(once, 1500);
  var here = new URL(".", window.location.href).href;
  sw.getRegistrations()
    .then(function (regs) {
      return Promise.all(
        regs
          .filter(function (r) {
            return r.scope.indexOf(here) === 0;
          })
          .map(function (r) {
            return r.unregister();
          }),
      );
    })
    .then(once, once);
})();
