/*!
 * LeadLayer pixel — lightweight, SEO-safe visitor + CTA analytics.
 *
 * Install (in the site <head> or footer):
 *   <script async src="https://app.leadlayer.studio/ll.js" data-key="llk_..."></script>
 *
 * Mark any CTA you want measured:
 *   <a href="/contact" data-ll-cta="request-quote">Request a quote</a>
 *
 * Design notes:
 *  - Loads async, never blocks render, mutates no DOM (zero CLS).
 *  - Events go out via sendBeacon as a text/plain Blob = a CORS-"simple"
 *    request, so no preflight and no impact on the page.
 *  - ~3KB, no dependencies. This is why it doesn't hurt SEO/Core Web Vitals.
 */
(function () {
  "use strict";
  try {
    var self =
      document.currentScript ||
      (function () {
        var s = document.getElementsByTagName("script");
        return s[s.length - 1];
      })();
    if (!self) return;

    var key = self.getAttribute("data-key");
    if (!key) return;

    // Endpoint derived from the script's own origin → /api/public/track
    var origin = new URL(self.src).origin;
    var endpoint = origin + "/api/public/track";

    // ── Session id (per tab session) ───────────────────────────────
    var SID_KEY = "ll_sid";
    var sid;
    try {
      sid = sessionStorage.getItem(SID_KEY);
      if (!sid) {
        sid =
          (crypto && crypto.randomUUID && crypto.randomUUID()) ||
          "s" + Date.now() + Math.random().toString(36).slice(2);
        sessionStorage.setItem(SID_KEY, sid);
      }
    } catch (e) {
      sid = "s" + Date.now() + Math.random().toString(36).slice(2);
    }

    // ── Context (captured once) ────────────────────────────────────
    var path = location.pathname || "/";
    var refHost = "";
    try {
      refHost = document.referrer ? new URL(document.referrer).hostname : "";
    } catch (e) {}
    var utm = {};
    try {
      var q = new URLSearchParams(location.search);
      ["source", "medium", "campaign", "term", "content"].forEach(function (k) {
        var v = q.get("utm_" + k);
        if (v) utm[k] = v.slice(0, 120);
      });
    } catch (e) {}

    // ── Event queue + flush ────────────────────────────────────────
    var queue = [];
    var flushTimer = null;

    function send(events) {
      if (!events.length) return;
      var body = JSON.stringify({
        key: key,
        sid: sid,
        path: path,
        ref: refHost,
        utm: utm,
        events: events,
      });
      try {
        var blob = new Blob([body], { type: "text/plain" });
        if (navigator.sendBeacon && navigator.sendBeacon(endpoint, blob)) return;
      } catch (e) {}
      // Fallback — keepalive POST, no-cors so it never throws on the page
      try {
        fetch(endpoint, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
      } catch (e) {}
    }

    function flush() {
      flushTimer = null;
      if (!queue.length) return;
      var batch = queue.splice(0, queue.length);
      send(batch);
    }

    function enqueue(ev, immediate) {
      queue.push(ev);
      if (immediate) {
        flush();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, 1500);
      }
    }

    function track(type, cta, immediate) {
      enqueue({ t: type, cta: cta || null, ts: Date.now() }, immediate);
    }

    // ── Pageview ───────────────────────────────────────────────────
    track("pageview", null, false);

    // ── CTA impressions (once per CTA per pageload) ────────────────
    var seen = {};
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var id = en.target.getAttribute("data-ll-cta");
            if (id && !seen[id]) {
              seen[id] = 1;
              track("cta_impression", id, false);
            }
            io.unobserve(en.target);
          });
        },
        { threshold: 0.5 },
      );
      var observe = function () {
        var els = document.querySelectorAll("[data-ll-cta]");
        for (var i = 0; i < els.length; i++) io.observe(els[i]);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observe);
      } else {
        observe();
      }
    }

    // ── CTA clicks (event delegation, capture phase) ───────────────
    document.addEventListener(
      "click",
      function (e) {
        var node = e.target;
        while (node && node !== document) {
          if (node.getAttribute && node.getAttribute("data-ll-cta")) {
            // immediate flush — the user may navigate away right after
            track("cta_click", node.getAttribute("data-ll-cta"), true);
            return;
          }
          node = node.parentNode;
        }
      },
      true,
    );

    // ── Flush on page exit ─────────────────────────────────────────
    var exitFlush = function () {
      if (queue.length) flush();
    };
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") exitFlush();
    });
    window.addEventListener("pagehide", exitFlush);

    // Expose the session id so the lead form can attribute conversions
    window.LeadLayer = window.LeadLayer || {};
    window.LeadLayer.sessionId = sid;
    window.LeadLayer.track = function (cta) {
      track("cta_click", cta, true);
    };
  } catch (e) {
    /* never break the host page */
  }
})();
