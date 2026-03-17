import {htm} from "../../bits/utility.js";

const STORE_URL = "https://trifect-show-shop.fourthwall.com";

export default function Shop(tags) {
  return htm(tags, [
    htm(tags,
      htm(tags,
        htm(tags, undefined, "circle", {
          cx: "25", cy: "25", r: "20",
          "stroke-width": "4",
          "stroke-dasharray": "80 50",
          "stroke-linecap": "round"
        })
      , "svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 50 50",
        fill: "none",
        stroke: "currentColor"
      })
    , "div", {class: "shop-loader"}),
    htm(tags, undefined, "iframe", {
      src: STORE_URL,
      title: "Shop",
      loading: "lazy",
      class: "shop-frame",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation",
      allow: "payment; clipboard-write",
      referrerpolicy: "no-referrer-when-downgrade"
    }),
    htm(tags, [
      htm(tags, "The shop could not be loaded.", "p"),
      htm(tags, "Visit the store directly", "a", {href: STORE_URL, target: "_blank", rel: "noopener noreferrer"})
    ], "div", {class: "shop-error"})
  ], "section", {id: "shop"});
}
