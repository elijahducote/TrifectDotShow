window.addEventListener("DOMContentLoaded", function () {
  var shopEl = document.getElementById("shop");
  if (!shopEl) return;

  var frame = shopEl.querySelector(".shop-frame");
  if (!frame) return;

  var loaded = false;

  frame.addEventListener("load", function () {
    if (loaded) return;
    loaded = true;
    shopEl.classList.add("shop-ready");
  });

  frame.addEventListener("error", function () {
    if (loaded) return;
    loaded = true;
    shopEl.classList.add("shop-failed");
  });

  setTimeout(function () {
    if (loaded) return;
    loaded = true;
    shopEl.classList.add("shop-failed");
  }, 15000);
});
