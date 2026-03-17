window.addEventListener("DOMContentLoaded", function () {
  const castEl = document.getElementById("cast");
  if (!castEl) return;

  const cards = castEl.querySelectorAll(".bio-card"),
        nth = cards.length;
  if (!nth) return;

  // Progressive enhancement
  castEl.classList.add("carousel-init");

  // Build indicator dots
  const indicatorEl = castEl.querySelector(".carousel-indicator");
  let itR8 = nth, ndx, dot;
  for (; itR8; --itR8) {
    ndx = nth - itR8;
    dot = document.createElement("button");
    dot.className = "carousel-dot";
    dot.setAttribute("aria-label", "Go to character " + (ndx + 1));
    dot.dataset.index = ndx;
    indicatorEl.appendChild(dot);
  }

  const dots = indicatorEl.querySelectorAll(".carousel-dot");

  let current = 0,
      timerId = null,
      paused = false;

  // Compute reading time per card (ms)
  // chars / 5 = words, words / 130 = minutes, min 3s
  function readTime(el) {
    const chars = el.textContent.trim().length,
          ms = (chars / 5 / 130) * 60000;
    return ms > 3000 ? ms : 3000;
  }

  var animating = false;

  function show(index) {
    if (animating || index === current) return;
    animating = true;

    var prev = current;
    current = index;

    // Lift old card out of flow so new card determines container height
    cards[prev].style.position = "absolute";
    cards[prev].style.left = "0";
    cards[prev].style.right = "0";

    // Show new card in normal flow
    cards[current].classList.add("carousel-active");

    // Crossfade via Web Animations API
    cards[prev].animate({opacity: [1, 0]}, {duration: 400, easing: "ease"});
    cards[current].animate({opacity: [0, 1]}, {duration: 400, easing: "ease"})
    .finished.then(function () {
      cards[prev].classList.remove("carousel-active");
      cards[prev].style.position = "";
      cards[prev].style.left = "";
      cards[prev].style.right = "";
      animating = false;
    });

    castEl.style.setProperty("--card-hue", cards[current].style.getPropertyValue("--card-hue"));
    castEl.style.setProperty("--card-L", cards[current].style.getPropertyValue("--card-L"));

    dots[prev].classList.remove("active");
    dots[current].classList.add("active");
  }

  function advance() {
    show((current + 1) % nth);
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(timerId);
    timerId = null;
    if (paused) return;
    timerId = setTimeout(advance, readTime(cards[current]));
  }

  // Show first card
  cards[0].classList.add("carousel-active");
  dots[0].classList.add("active");
  castEl.style.setProperty("--card-hue", cards[0].style.getPropertyValue("--card-hue"));
  castEl.style.setProperty("--card-L", cards[0].style.getPropertyValue("--card-L"));

  // Button handlers
  castEl.querySelector(".carousel-prev").addEventListener("click", function () {
    show((current - 1 + nth) % nth);
    scheduleNext();
  });

  castEl.querySelector(".carousel-next").addEventListener("click", function () {
    show((current + 1) % nth);
    scheduleNext();
  });

  // Dot click
  indicatorEl.addEventListener("click", function (e) {
    const target = e.target;
    if (!target.classList.contains("carousel-dot")) return;
    show(Number(target.dataset.index));
    scheduleNext();
  });

  // Pause on hover (mouse only — touch fires mouseenter without leave)
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) {
    castEl.addEventListener("mouseenter", function () {
      paused = true;
      clearTimeout(timerId);
      timerId = null;
    });

    castEl.addEventListener("mouseleave", function () {
      paused = false;
      scheduleNext();
    });
  }

  // Start auto-advance
  scheduleNext();
});
