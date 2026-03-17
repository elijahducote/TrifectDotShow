import {paths as sectionIds} from "../../sitemap.json";
import {Loader} from "vanjs-feather";
import van from "vanjs-core";

let leavingPage = false;

function initAnimations() {
  const siteHeader = document.querySelector("div.wrapper.topnav");
  const existing = siteHeader.querySelector("svg.spinner, svg.fadeAway");
  if (existing) existing.remove();
  siteHeader.style.opacity = "0.5";

  const loading = Loader({ class: "icon spinner" });
  loading.style.animationPlayState = "running";
  van.add(siteHeader, loading); 

  loading.addEventListener("animationiteration", function () {
    siteHeader.style.opacity = "0.5";
    loading.style.animationPlayState = "paused";
    if (!leavingPage) loading.classList.add("fadeAway");
    if (!leavingPage) loading.classList.remove("spinner");

    loading.style.animationPlayState = "running";


    loading.addEventListener("animationend", function () {
      siteHeader.style.opacity = "1.0";
      if (!leavingPage) loading.style.animationPlayState = "paused";
      if (!leavingPage) loading.remove(); // Remove the loader
    }, { once: true });
  }, { once: true });
}

function initNavHoverEffects() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  const currentPath = window.location.pathname.substring(1) || "watch",
        navIcons = document.querySelectorAll("div.wrapper.topnav div svg"),
        navText = document.querySelectorAll("div.wrapper.topnav div h2"),
        nth = navIcons.length;

  // Apply styles based on state: active (current page), hovered, or inactive
  function applyNavItemStyles(index, isActive, isHovered) {
    const icon = navIcons[index],
          text = navText[index],
          container = icon.parentElement;
    
    if (isHovered) {
      // Hovered state: full opacity, glow animation
      container.style.animation = "glow 4s ease-in-out infinite";
      Object.assign(icon.style, { opacity: "1", filter: "none" });
      text.style.setProperty("opacity", "1", "important");
    } else if (isActive) {
      // Active page state (when not hovering): glow animation
      container.style.animation = "glow 4s ease-in-out infinite";
      Object.assign(icon.style, { opacity: "1", filter: "none" });
      text.style.setProperty("opacity", "1", "important");
    } else {
      // Inactive/dimmed state: static, no animation
      container.style.animation = "none";
      Object.assign(icon.style, { opacity: ".75", filter: "grayscale(50%)" });
      text.style.setProperty("opacity", "0.75", "important");
    }
  }
  
  // Check if nav item at index corresponds to current page
  function isCurrentNav(index) {
    const icon = navIcons[index],
          dataLink = icon.parentElement.dataset.link || "/",
          normalizedLink = dataLink === "/" ? "home" : dataLink;
    return normalizedLink === currentPath;
  }
  
  // Reset all nav items to default state (active glows, others dimmed)
  function resetToDefault() {
    let itR8 = nth, ndx;
    for (; itR8; --itR8) {
      ndx = nth - itR8;
      applyNavItemStyles(ndx, isCurrentNav(ndx), false);
    }
  }
  
  // Setup hover event listeners for each nav item
  let itR8 = nth, ndx, icon, container;
  for (; itR8; --itR8) {
    ndx = nth - itR8;
    icon = navIcons[ndx];
    container = icon.parentElement;
    
    // Closure to capture current index
    (function(currentIndex) {
      container.addEventListener("mouseenter", function() {
        // On hover: highlight hovered item, dim all others (including active)
        let j = nth, idx;
        for (; j; --j) {
          idx = nth - j;
          applyNavItemStyles(idx, false, idx === currentIndex);
        }
      });
      
      container.addEventListener("mouseleave", function() {
        // On leave: restore default state
        resetToDefault();
      });
    })(ndx);
  }
  
  // Initialize with default state
  resetToDefault();
}


function simulateLinkClick(url, target = "_self") {
    const link = document.createElement("a");
    link.href = url;
    link.target = target;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    leavingPage = true;
    initAnimations();
}


function updateNavIcons() {
  const currentPath = window.location.pathname.substring(1) || "watch",
  navIcons = document.querySelectorAll("div.wrapper.topnav div svg"),
  navText = document.querySelectorAll("div.wrapper.topnav div h2"),
  nth = navIcons.length,
  root = document.querySelector("div.wrapper.topnav");
  let itR8 = nth, ndx, icon, text, dataLink, normalizedLink;
  root.addEventListener("click", function(e) {
    const node = e.target;
    let link;
    if (node.tagName === "DIV") {
      link = node.dataset.link;
    } else if (node.tagName === "path") {
      let parent = node.parentElement;
      if (parent.tagName === "g") parent = parent.parentElement;
      link = parent.parentElement.dataset.link;
    } else if (node.tagName === "H2" || node.tagName === "svg") {
      link = node.parentElement.dataset.link;
    }
    if (link === "shop") simulateLinkClick("https://shop.trifect.us/");
    else if (link) simulateLinkClick(link);
  });
  
  for (;itR8;--itR8) {
    ndx = nth - itR8;
    icon = navIcons[ndx];
    text = navText[ndx];
    dataLink = icon.parentElement.dataset.link || "/";
    normalizedLink = dataLink === "/" ? "home" : dataLink;
    if (normalizedLink === currentPath) icon.parentElement.style.animation = "glow 4s ease-in-out infinite";
    else {
      Object.assign(icon.style, {opacity:".75", filter:"grayscale(50%)"});
      text.style.setProperty("opacity","0.75","important");
      /*Object.assign(text.style, {opacity:".5", filter:"grayscale(50%)"});*/
    }
  }
}

function throttle(func, wait) {
  let timeout;
  return function(...args) {
    if (!timeout) {
      timeout = setTimeout(() => {
        func(...args);
        timeout = null;
      }, wait);
    }
  };
}

let scrollContainer = null,
    footer = null,
    footerStyle = null,
    topNav = null,
    lastScrollTop = 0,
    navHidden = false,
    tabListEl = null,
    hideThreshold = 48;

function initScrollHandler() {
  const containers = document.querySelectorAll("div.container");
  let itR8 = containers.length, style;

  // Find the scrollable container
  for (;itR8;--itR8) {
    style = window.getComputedStyle(containers[itR8 - 1]);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      scrollContainer = containers[itR8 - 1];
      break;
    }
  }

  footer = document.querySelector("footer > div");
  if (footer) footerStyle = footer.style;

  topNav = document.querySelector("div.wrapper.topnav");
  tabListEl = document.querySelector("div.wrapper.tab-list");
  hideThreshold = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3;

  if (!scrollContainer) return;

  scrollContainer.addEventListener("scroll", throttle(handleNavVisibility, 100));

  // Use IntersectionObserver for footer visibility — avoids getBoundingClientRect in scroll
  if (footer && tabListEl) {
    const sentinel = document.createElement("div");
    sentinel.style.cssText = "height:1px;pointer-events:none;";
    tabListEl.appendChild(sentinel);
    new IntersectionObserver(
      ([entry]) => setFooterVisibility(entry.isIntersecting),
      { root: scrollContainer, threshold: 0 }
    ).observe(sentinel);
  } else if (footer) {
    setFooterVisibility(true);
  }
}

function handleNavVisibility() {
  if (!scrollContainer || !topNav) return;

  const scrollTop = scrollContainer.scrollTop;
  const scrollHeight = scrollContainer.scrollHeight;
  const clientHeight = scrollContainer.clientHeight;
  const maxScroll = scrollHeight - clientHeight;
  const scrollPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;

  const scrollingDown = scrollTop > lastScrollTop;

  // Hide nav: scrolled down past 3em AND scrolling down
  // Show nav: scrolling up OR at top 5% of page
  const shouldHide = scrollTop > hideThreshold && scrollingDown && scrollPercent > 5;
  const shouldShow = !scrollingDown || scrollPercent <= 5;

  if (shouldHide && !navHidden) {
    topNav.style.transform = "translateY(-100%)";
    topNav.style.transition = "transform 0.3s ease-in-out";
    navHidden = true;
  } else if (shouldShow && navHidden) {
    topNav.style.transform = "translateY(0)";
    topNav.style.transition = "transform 0.3s ease-in-out";
    navHidden = false;
  }

  lastScrollTop = scrollTop;
}


function setFooterVisibility(visible) {
  if (!footerStyle) return;
  
  if (visible) {
    // Show footer: make it fully interactive
    footerStyle.opacity = "1";
    footerStyle.visibility = "visible";
    footerStyle.pointerEvents = "auto";
    footerStyle.zIndex = "999";
    footerStyle.transition = "opacity 0.3s ease-in-out";
  } else {
    // Hide footer: make it completely non-interactive
    footerStyle.opacity = "0";
    footerStyle.visibility = "hidden";
    footerStyle.pointerEvents = "none";
    footerStyle.zIndex = "-1";
    footerStyle.transition = "opacity 0.3s ease-in-out, visibility 0s 0.3s";
  }
}

function initSmoothScroll() {
  if (!scrollContainer) return;
  // Skip custom scroll on watch page — prevents RAF contention with video progress
  if (document.querySelector('.video-container')) return;
  
  // Detect if device supports touch (mobile/tablet)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // On mobile, use native scrolling entirely
  if (isTouchDevice) {
    scrollContainer.style.scrollBehavior = 'smooth';
    return;
  }
  
  // Desktop smooth scrolling
  let targetScroll = scrollContainer.scrollTop;
  let currentScroll = scrollContainer.scrollTop;
  let isAnimating = false;
  let animationId = null;
  let useNativeScroll = false;
  
  // Detect middle-click auto-scroll
  let middleClickActive = false;
  
  scrollContainer.addEventListener('mousedown', function(e) {
    if (e.button === 1) {
      middleClickActive = true;
      useNativeScroll = true;
    }
  });
  
  document.addEventListener('mouseup', function(e) {
    if (e.button === 1) {
      middleClickActive = false;
      // Re-sync after middle-click ends
      setTimeout(() => {
        targetScroll = scrollContainer.scrollTop;
        currentScroll = scrollContainer.scrollTop;
        useNativeScroll = false;
      }, 100);
    }
  });
  
  // Intercept wheel events for smooth scrolling
  scrollContainer.addEventListener('wheel', function(e) {
    // Don't interfere with middle-click scrolling or shift+wheel
    if (middleClickActive || e.shiftKey || useNativeScroll) {
      return;
    }
    
    e.preventDefault();
    targetScroll += e.deltaY * 0.25;
    targetScroll = Math.max(0, Math.min(targetScroll, scrollContainer.scrollHeight - scrollContainer.clientHeight));
    
    if (!isAnimating) {
      isAnimating = true;
      animate();
    }
  }, { passive: false });
  
  function animate() {
    if (useNativeScroll || middleClickActive) {
      isAnimating = false;
      return;
    }
    
    const diff = targetScroll - currentScroll;
    
    if (Math.abs(diff) > 0.5) {
      currentScroll += diff * 0.1;
      scrollContainer.scrollTop = currentScroll;
      animationId = requestAnimationFrame(animate);
    } else {
      // Animation complete
      currentScroll = targetScroll;
      scrollContainer.scrollTop = currentScroll;
      isAnimating = false;
    }
  }
}

function initFullscreenHandler() {
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, function() {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const navDivs = document.querySelectorAll('div.wrapper.topnav div');
      for (let i = 0; i < navDivs.length; i++) {
        navDivs[i].style.animationPlayState = isFS ? 'paused' : '';
      }
    })
  );
}

window.addEventListener("DOMContentLoaded", function() {
  initAnimations();
  updateNavIcons();
  initNavHoverEffects();
  initScrollHandler();
  initSmoothScroll();
  initFullscreenHandler();
});

window.addEventListener("pageshow", function(event) {
  if (!event.persisted) return;
  leavingPage = false;
  const siteHeader = document.querySelector("div.wrapper.topnav");
  if (siteHeader) {
    siteHeader.querySelectorAll("svg.spinner, svg.fadeAway").forEach(function(el) { el.remove(); });
    siteHeader.style.opacity = "1.0";
  }
  navHidden = false;
  lastScrollTop = 0;
  if (topNav) {
    topNav.style.transform = "translateY(0)";
    topNav.style.transition = "none";
  }
  initAnimations();
});