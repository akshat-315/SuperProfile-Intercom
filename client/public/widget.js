(function () {
  var script = document.currentScript || document.getElementById("intercom-widget-script");
  if (!script) return;

  var key = script.dataset.key;
  if (!key) return;

  var origin = script.dataset.origin || new URL(script.src).origin;
  var PANEL_ID = "intercom-widget-panel";
  if (document.getElementById(PANEL_ID)) return;

  var open = false;

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "width:56px",
    "height:56px",
    "border-radius:999px",
    "border:0",
    "background:#14171a",
    "color:#fff",
    "cursor:pointer",
    "box-shadow:0 8px 24px rgba(0,0,0,.24)",
    "display:grid",
    "place-items:center",
    "z-index:2147483001",
    "transition:transform .18s ease",
  ].join(";");
  launcher.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var badge = document.createElement("span");
  badge.style.cssText = [
    "position:absolute",
    "top:-2px",
    "right:-2px",
    "min-width:20px",
    "height:20px",
    "padding:0 5px",
    "border-radius:999px",
    "background:#e5484d",
    "color:#fff",
    "font:600 11px/20px ui-sans-serif,system-ui,sans-serif",
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
    "height:min(640px, calc(100vh - 130px))",
    "max-width:calc(100vw - 40px)",
    "border:0",
    "border-radius:16px",
    "box-shadow:0 16px 48px rgba(0,0,0,.22)",
    "background:#fff",
    "z-index:2147483000",
    "display:none",
    "opacity:0",
    "transform:translateY(8px)",
    "transition:opacity .18s ease, transform .18s ease",
  ].join(";");

  function show() {
    open = true;
    frame.style.display = "block";
    requestAnimationFrame(function () {
      frame.style.opacity = "1";
      frame.style.transform = "translateY(0)";
    });
    post({ type: "opened" });
  }

  function hide() {
    open = false;
    frame.style.opacity = "0";
    frame.style.transform = "translateY(8px)";
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
