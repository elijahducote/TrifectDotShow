import {htm} from "../../bits/utility.js";
import {avatarUrl, cast} from "./cast.json";

// Hex → oklch L + H (build-time, perceptually uniform)
// L clamped to 70% floor for legibility on dark backgrounds
function hexOklch(hex) {
  if (hex.length === 4) hex = "#" + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3];
  var i = parseInt(hex.slice(1), 16),
      r = (i >> 16) / 255, g = ((i >> 8) & 255) / 255, b = (i & 255) / 255,
      f = c => c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92,
      lr = f(r), lg = f(g), lb = f(b),
      l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb),
      m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb),
      s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb),
      L = 0.2104542553 * l + 0.7936177850 * m + 0.0040720468 * s,
      a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      bk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
      rd = v => Math.round(v * 10) / 10;
  return {
    h: rd((Math.atan2(bk, a) * 180 / Math.PI + 360) % 360),
    l: rd(Math.max(L * 100, 70))
  };
}

// Gender SVG path data (keyed by gender string)
var genderData = {
  female: {
    d: "M54.010058,1930.97067 C52.6753909,1930.97067 51.421643,1930.45194 50.4775859,1929.51025 C47.3327267,1926.36895 49.5904718,1920.99511 54.010058,1920.99511 C58.4266471,1920.99511 60.6903863,1926.36595 57.5425301,1929.51025 C56.5984729,1930.45194 55.344725,1930.97067 54.010058,1930.97067 M58.9411333,1930.92079 C63.3617184,1926.50661 60.1768991,1919 54.007061,1919 C47.8512088,1919 44.6294265,1926.50661 49.0510106,1930.92079 C50.1609021,1932.02908 51.9840813,1932.67949 52.9830836,1932.88598 L52.9830836,1935.00978 L49.9860767,1935.00978 L49.9860767,1937.00489 L52.9830836,1937.00489 L52.9830836,1939 L54.9810882,1939 L54.9810882,1937.00489 L57.9780951,1937.00489 L57.9780951,1935.00978 L54.9810882,1935.00978 L54.9810882,1932.88598 C56.9790928,1932.67949 57.8302427,1932.02908 58.9411333,1930.92079",
    transform: "translate(-47,-1919)",
    viewBox: "-3 0 20 20"
  },
  male: {
    d: "M11,1937.005 C8.243,1937.005 6,1934.762 6,1932.005 C6,1929.248 8.243,1927.005 11,1927.005 C13.757,1927.005 16,1929.248 16,1932.005 C16,1934.762 13.757,1937.005 11,1937.005 L11,1937.005 Z M16,1919 L16,1921 L20.586,1921 L15.186,1926.402 C14.018,1925.527 12.572,1925.004 11,1925.004 C7.134,1925.004 4,1928.138 4,1932.004 C4,1935.87 7.134,1939.005 11,1939.005 C14.866,1939.005 18,1935.871 18,1932.005 C18,1930.433 17.475,1928.987 16.601,1927.818 L22,1922.419 L22,1927 L24,1927 L24,1919 L16,1919 Z",
    transform: "translate(-4,-1919)",
    viewBox: "0 0 20 20"
  }
};

// SVG path data for avatar frame clip shapes (objectBoundingBox 0–1 coords)
var frameData = {
  "heart": "M 0.5 1 C 0.12 0.75 0 0.56 0 0.35 C 0 0.12 0.17 0 0.35 0 C 0.44 0 0.48 0.06 0.5 0.15 C 0.52 0.06 0.56 0 0.65 0 C 0.83 0 1 0.12 1 0.35 C 1 0.56 0.88 0.75 0.5 1 Z",
  "rounded-heart": "M 0.5 0.95 C 0.26 0.85 0 0.58 0 0.35 C 0 0.12 0.17 0 0.35 0 C 0.44 0 0.48 0.06 0.5 0.15 C 0.52 0.06 0.56 0 0.65 0 C 0.83 0 1 0.12 1 0.35 C 1 0.58 0.74 0.85 0.5 0.95 Z",
  "triangle": "M 0.5 0 A 1 1 0 0 1 1 0.866 A 1 1 0 0 1 0 0.866 A 1 1 0 0 1 0.5 0 Z",
  "rounded-triangle": "M 0.6 0.2 L 0.9 0.8 Q 1 1 0.8 1 L 0.2 1 Q 0 1 0.1 0.8 L 0.4 0.2 Q 0.5 0 0.6 0.2 Z",
  "diamond": "M 0.5 0 L 1 0.5 L 0.5 1 L 0 0.5 Z",
  "rounded-diamond": "M 0.6 0.1 L 0.9 0.4 Q 1 0.5 0.9 0.6 L 0.6 0.9 Q 0.5 1 0.4 0.9 L 0.1 0.6 Q 0 0.5 0.1 0.4 L 0.4 0.1 Q 0.5 0 0.6 0.1 Z",
  "square": "M 0 0 L 1 0 L 1 1 L 0 1 Z",
  "rounded-square": "M 0.2 0 L 0.8 0 Q 1 0 1 0.2 L 1 0.8 Q 1 1 0.8 1 L 0.2 1 Q 0 1 0 0.8 L 0 0.2 Q 0 0 0.2 0 Z",
  "pentagon": "M 0.5 0.025 L 1 0.388 L 0.809 0.975 L 0.191 0.975 L 0 0.388 Z",
  "rounded-pentagon": "M 0.6 0.098 L 0.9 0.315 Q 1 0.388 0.962 0.505 L 0.847 0.858 Q 0.809 0.975 0.685 0.975 L 0.315 0.975 Q 0.191 0.975 0.153 0.858 L 0.038 0.505 Q 0 0.388 0.1 0.315 L 0.4 0.098 Q 0.5 0.025 0.6 0.098 Z",
  "hexagon": "M 1 0.5 L 0.75 0.933 L 0.25 0.933 L 0 0.5 L 0.25 0.067 L 0.75 0.067 Z",
  "rounded-hexagon": "M 0.95 0.587 L 0.8 0.847 Q 0.75 0.933 0.65 0.933 L 0.35 0.933 Q 0.25 0.933 0.2 0.847 L 0.05 0.587 Q 0 0.5 0.05 0.413 L 0.2 0.153 Q 0.25 0.067 0.35 0.067 L 0.65 0.067 Q 0.75 0.067 0.8 0.153 L 0.95 0.413 Q 1 0.5 0.95 0.587 Z",
  "octagon": "M 0.707 0 L 1 0.293 L 1 0.707 L 0.707 1 L 0.293 1 L 0 0.707 L 0 0.293 L 0.293 0 Z",
  "rounded-octagon": "M 0.766 0.059 L 0.941 0.234 Q 1 0.293 1 0.376 L 1 0.624 Q 1 0.707 0.941 0.766 L 0.766 0.941 Q 0.707 1 0.624 1 L 0.376 1 Q 0.293 1 0.234 0.941 L 0.059 0.766 Q 0 0.707 0 0.624 L 0 0.376 Q 0 0.293 0.059 0.234 L 0.234 0.059 Q 0.293 0 0.376 0 L 0.624 0 Q 0.707 0 0.766 0.059 Z",
  "star": "M 0.5 0 L 0.677 0.323 L 1 0.5 L 0.677 0.677 L 0.5 1 L 0.323 0.677 L 0 0.5 L 0.323 0.323 Z",
  "rounded-star": "M 0.535 0.065 L 0.642 0.258 Q 0.677 0.323 0.742 0.358 L 0.935 0.465 Q 1 0.5 0.935 0.535 L 0.742 0.642 Q 0.677 0.677 0.642 0.742 L 0.535 0.935 Q 0.5 1 0.465 0.935 L 0.358 0.742 Q 0.323 0.677 0.258 0.642 L 0.065 0.535 Q 0 0.5 0.065 0.465 L 0.258 0.358 Q 0.323 0.323 0.358 0.258 L 0.465 0.065 Q 0.5 0 0.535 0.065 Z"
};

export default function Bio(tags) {
  // Creates a fresh gender SVG per call (safe for N same-gender characters)
  function genderSVG(gender) {
    var data = genderData[gender];
    if (!data) return undefined;
    return htm(tags,
      htm(tags,
        htm(tags, undefined, "path", {d: data.d})
      , "g", {transform: data.transform})
    , "svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: data.viewBox,
      class: "bio-gender bio-gender-" + gender
    });
  }

  // Profile avatar
  function avatar(id, frame, hue) {
    var attrs = {class: "bio-avatar-wrap"};
    if (frame && frame !== "circle") attrs["data-frame"] = frame;
    attrs.style = "background:linear-gradient(to bottom left,"
      + "oklch(0.65 0.22 " + hue + ") 0%,"
      + "oklch(0.55 0.18 " + hue + ") 20%,"
      + "oklch(0.42 0.15 " + hue + ") 40%,"
      + "oklch(0.28 0.10 " + hue + ") 60%,"
      + "oklch(0.15 0.05 " + hue + ") 80%,"
      + "oklch(0 0 0) 100%)";
    return htm(tags,
      htm(tags, undefined, "img", {
        src: avatarUrl + id + ".png",
        alt: id,
        class: "bio-avatar"
      }),
      "div", attrs);
  }

  // Build name element with optional epithet and former name
  function buildName(name) {
    var parts = [name.text];
    if (name.epithet) {
      parts.push(" ");
      parts.push(htm(tags, name.epithet, "i"));
    }
    if (name.former) {
      parts.push(" ");
      parts.push(htm(tags, name.former, "small"));
    }
    return htm(tags, parts, "h1", {class: "bio-name"});
  }

  // Build trait pills
  function buildTraits(traits) {
    var children = [htm(tags, "Physical Traits:", "b", {class: "bio-traits-label"})];
    let itR8 = traits.length,
    nth = itR8;
    for (;itR8;--itR8) {
      children.push(
        htm(tags, [htm(tags, traits[nth - itR8], "i")], "b", {class: "bio-trait"})
      );
    }
    return htm(tags, children, "div", {class: "bio-traits"});
  }

  // Build cards from JSON
  // Section order: avatar, header, kind, divider, quote, aliases, traits
  // All optional sections use the same guard pattern
  var cards = [];
  var usedFrames = {};
  let itR8 = cast.length,
  nth = itR8,
  entry,
  clr,
  cardChildren;

  for (;itR8;--itR8) {
    entry = cast[nth - itR8];
    clr = hexOklch(entry.color || "#00FFFF");

    if (entry.frame && entry.frame !== "circle" && frameData[entry.frame]) {
      usedFrames[entry.frame] = 1;
    }

    cardChildren = [
      avatar(entry.id, entry.frame, clr.h),
      htm(tags, [
        buildName(entry.name),
        genderSVG(entry.gender)
      ], "div", {class: "bio-header"}),
      htm(tags, entry.kind, "h3", {class: "bio-kind"}),
      htm(tags, undefined, "div", {class: "divider"}),
      htm(tags, undefined, "hr"),
      htm(tags, undefined, "div", {class: "divider"})
    ];

    if (entry.quote) {
      cardChildren.push(htm(tags, entry.quote, "blockquote"));
    }

    if (entry.aliases) {
      cardChildren.push(
        htm(tags, [
          htm(tags, "Aliases: ", "b"),
          htm(tags, entry.aliases, "span")
        ], "aside", {class: "bio-aliases"})
      );
    }

    if (entry.traits && entry.traits.length) {
      cardChildren.push(buildTraits(entry.traits));
    }

    cards.push(
      htm(tags, cardChildren, "div", {class: "text-card bio-card", "data-index": String(nth - itR8), style: "--card-hue:" + clr.h + ";--card-L:" + clr.l + "%"})
    );
  }

  // Carousel controls (hidden until JS adds carousel-init)
  var prevBtn = htm(tags, "\u2039", "button", {
    class: "carousel-btn carousel-prev",
    "aria-label": "Previous character"
  });
  var nextBtn = htm(tags, "\u203A", "button", {
    class: "carousel-btn carousel-next",
    "aria-label": "Next character"
  });
  var indicator = htm(tags, undefined, "div", {class: "carousel-indicator"});

  // Build SVG clipPath defs for non-circle frames
  var sectionChildren = [];
  var frameKeys = Object.keys(usedFrames);
  if (frameKeys.length) {
    var clipPaths = [];
    let i = frameKeys.length, n = i;
    for (;i;--i) {
      var name = frameKeys[n - i];
      clipPaths.push(
        htm(tags,
          htm(tags, undefined, "path", {d: frameData[name]}),
          "clipPath", {id: "frame-" + name, clipPathUnits: "objectBoundingBox"})
      );
    }
    sectionChildren.push(
      htm(tags,
        htm(tags, clipPaths, "defs"),
        "svg", {xmlns: "http://www.w3.org/2000/svg", width: "0", height: "0", style: "position:absolute"})
    );
  }

  sectionChildren.push(...cards, prevBtn, nextBtn, indicator);
  return htm(tags, sectionChildren, "section", {id: "cast"});
}
