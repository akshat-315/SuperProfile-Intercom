(function () {
  var script = document.currentScript || document.getElementById("intercom-widget-script");
  if (!script) return;

  var key = script.dataset.key;
  if (!key) return;

  var origin = script.dataset.origin || new URL(script.src).origin;
  var PANEL_ID = "intercom-widget-panel";
  var LAUNCHER_ID = "intercom-widget-launcher";
  if (document.getElementById(PANEL_ID)) return;

  var open = false;

  // Scoped so nothing leaks into the host page's stylesheet, and so the phone
  // branch can be expressed as a media query rather than a resize listener.
  var style = document.createElement("style");
  style.textContent = [
    "#" + LAUNCHER_ID + " svg{transition:transform .18s cubic-bezier(.2,.8,.2,1)}",
    "#" + LAUNCHER_ID + '[data-open="true"] svg{transform:rotate(90deg)}',
    "#" + LAUNCHER_ID + ":focus-visible{outline:3px solid #fff;outline-offset:-6px;box-shadow:0 0 0 3px #6d3ee0}",
    "@media (max-width:479px){",
    "  #" + PANEL_ID + "{inset:0!important;width:100%!important;height:100%!important;",
    "    max-width:none!important;border-radius:0!important;box-shadow:none!important}",
    // A 392px floating card on a 390px phone is a card with 0px of margin, so
    // it stops pretending to float — and the launcher gets out of the way.
    "  #" + LAUNCHER_ID + '[data-open="true"]{display:none!important}',
    "}",
    "@media (prefers-reduced-motion:reduce){",
    "  #" + PANEL_ID + ",#" + LAUNCHER_ID + " svg{transition:none!important}",
    "}",
  ].join("");
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.id = LAUNCHER_ID;
  launcher.setAttribute("aria-label", "Open chat");
  launcher.dataset.open = "false";
  launcher.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "width:56px",
    "height:56px",
    "border-radius:999px",
    "border:0",
    "background:#6d3ee0",
    "color:#fff",
    "cursor:pointer",
    "box-shadow:0 16px 48px -12px rgba(23,20,31,.34)",
    "display:grid",
    "place-items:center",
    "z-index:2147483001",
    "transition:background .18s cubic-bezier(.2,.8,.2,1)",
  ].join(";");
  launcher.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-2.6-.3L4 21l1.3-3.7A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/></svg>';

  // The only red in the customer experience: a count on someone else's site has
  // to survive peripheral vision, and this is the one place convention beats
  // consistency.
  var badge = document.createElement("span");
  badge.style.cssText = [
    "position:absolute",
    "top:-2px",
    "right:-2px",
    "min-width:22px",
    "height:22px",
    "padding:0 5px",
    "border-radius:999px",
    "border:2px solid #fff",
    "background:#c02626",
    "color:#fff",
    "font:700 11px/18px ui-sans-serif,system-ui,sans-serif",
    "text-align:center",
    "display:none",
  ].join(";");
  launcher.appendChild(badge);

  var frame = document.createElement("iframe");
  frame.id = PANEL_ID;
  frame.title = "Chat";
  frame.src = origin + "/widget?key=" + encodeURIComponent(key);
  frame.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:88px",
    "width:392px",
    "height:min(640px, calc(100dvh - 130px))",
    "max-width:calc(100vw - 40px)",
    "border:0",
    "border-radius:16px",
    "box-shadow:0 16px 48px -12px rgba(23,20,31,.28)",
    "background:#fff",
    "z-index:2147483000",
    "display:none",
    "opacity:0",
    // Growing from the launcher's corner is what ties the panel to the button
    // that made it.
    "transform:scale(.96)",
    "transform-origin:100% 100%",
    "transition:opacity .18s cubic-bezier(.2,.8,.2,1), transform .18s cubic-bezier(.2,.8,.2,1)",
  ].join(";");

  function show() {
    open = true;
    launcher.dataset.open = "true";
    launcher.setAttribute("aria-label", "Close chat");
    frame.style.display = "block";
    requestAnimationFrame(function () {
      frame.style.opacity = "1";
      frame.style.transform = "scale(1)";
    });
    post({ type: "opened" });
  }

  function hide() {
    open = false;
    launcher.dataset.open = "false";
    launcher.setAttribute("aria-label", "Open chat");
    frame.style.opacity = "0";
    frame.style.transform = "scale(.96)";
    setTimeout(function () {
      if (!open) frame.style.display = "none";
    }, 180);
    post({ type: "closed" });
  }

  function post(message) {
    if (frame.contentWindow) frame.contentWindow.postMessage(message, origin);
  }

  launcher.addEventListener("click", function () {
    if (open) hide();
    else show();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (!event.data || typeof event.data !== "object") return;

    if (event.data.type === "close") hide();

    if (event.data.type === "unread") {
      var count = Number(event.data.count) || 0;
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.style.display = count > 0 ? "block" : "none";
    }
  });

  document.body.appendChild(frame);
  document.body.appendChild(launcher);
})();
