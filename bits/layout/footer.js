import {htm} from "../utility.js";

export default function Footer(tags) {
  return htm(
    tags,
    htm(
      tags,
      htm(
        tags,
        [
          // Left content section
          htm(
            tags,
            [
              htm(tags, "Email", "span", { class: "footer-heading" }),
              htm(tags, "ArtisansBond", "a", {href:"mailto:artisansbond@gmail.com?subject=Correspondance&body=Hello%2C%20I%20am%20interested%20in%20discussing%20matters."}),
              htm(
                tags,
                [
                  // Removed unnecessary <br> here
                  htm(tags, "LinkTree", "span")
                ],
                "span",
                { class: "footer-heading" }
              ),
              htm(
                tags,
                [
                  htm(tags, "/TrifectShow", "a", {href:"https://LinkTr.ee/TrifectShow"}),
                  // Removed <br>
                ],
                "span"
              ),
              // Copyright section
              htm(
                tags,
                htm(
                  tags,
                  [
                    // CHANGED: Removed the 3 consecutive <br> tags causing the height issue
                    htm(tags, "Copyright (C) Ducote Industry", "span"),
                  ],
                  "span",
                  { class: "footer-copyright-text" }
                ),
                "div",
                { class: "footer-copyright" }
              )
            ],
            "div",
            { class: "footer-content" }
          ),
          // QR code section
          htm(
            tags,
            htm(tags,
            [
              htm(tags,
              [
                htm(tags, null, "path", { 
                  fill: "#000000", 
                  stroke: "#000", 
                  "stroke-width": "133.33", 
                  d: "M2194.24 394.89v3598.54c675.96 0 1727.46-6.41 2127.58-6.41-669.46-1159.54-1450.99-2377.85-2127.58-3592.13m0 0C1517.64 1609.17 736.12 2827.48 66.66 3987.02c400.13 0 1451.63 6.4 2127.58 6.4z" 
                }),
                htm(tags, null, "path", { 
                  fill: "#FF6D00", 
                  d: "M2194.24 1905.05v954.57c326.15-232.7 767.92-553.36 772.42-557.78 5.5-5.37 7.04-10.78 5.21-18.2-163.18-242.33-470.3-378.65-777.63-378.59m0 0c-307.17.06-614.53 136.38-777.63 378.59-1.83 7.42-.29 12.83 5.21 18.2 4.5 4.42 446.27 326.06 772.42 558.75zm-427.08 1871.71q-2559.37-5581.24 0 0" 
                }),
                htm(tags, null, "path", { 
                  fill: "#FF3D00", 
                  d: "M2194.24 1905.05c-307.17.06-614.53 136.38-777.63 378.59-1.83 7.42-.29 12.83 5.21 18.2 4.5 4.42 446.27 326.06 772.42 558.75zm-427.08 1871.71q-2559.37-5581.24 0 0" 
                }),
                htm(tags, null, "path", { 
                  fill: "#E65100", 
                  d: "M2194.24 394.89C1517.64 1609.17 736.12 2827.48 66.66 3987.02c400.13 0 1451.63 6.4 2127.58 6.4V2860.6c-326.15-232.69-767.92-554.33-772.42-558.75-5.5-5.37-7.04-10.78-5.2-18.2 163.09-242.21 470.45-378.53 777.62-378.59z" 
                }),
                htm(tags, null, "path", { 
                  fill: "#FF9100", 
                  d: "M2194.24 394.89v1510.16c307.32-.06 614.45 136.26 777.63 378.59 1.83 7.42.3 12.83-5.2 18.2-4.5 4.42-446.28 325.09-772.43 557.78v1133.8c675.96 0 1727.46-6.4 2127.58-6.4-669.46-1159.54-1450.99-2377.85-2127.58-3592.13" 
                }),
                htm(tags, null, "path", { 
                  fill: "#FF6D00", 
                  d: "M2194.24 1905.05v954.57c326.15-232.7 767.92-553.36 772.42-557.78 5.5-5.37 7.04-10.78 5.21-18.2-163.18-242.33-470.3-378.65-777.63-378.59" 
                }),
                htm(tags, null, "path", { 
                  fill: "#FFEA00", 
                  d: "M2194.24 394.89C1517.64 1609.17 736.12 2827.48 66.66 3987.02c400.13 0 1451.63 6.4 2127.58 6.4V2860.6c-326.15-232.69-767.92-554.33-772.42-558.75-5.5-5.37-7.04-10.78-5.2-18.2 163.09-242.21 470.45-378.53 777.62-378.59zm-871.66 2002.83c101.7 69.08 763.33 533 763.33 552.63 0 17.8-579.55 434.75-587.62 434.75-101.98-64.27-195.98-143.55-292.1-216.67l-32.9-25.04c-203.88-155.17-212.5-161.71-212.46-168.21l.08-2zm-429.63 694.96c6 4.48 881.22 663.57 874.2 684.08-279.07 6.46-558.44 4.02-837.65 4.25-377.92.3-455.59.38-459.3-16.16-.75-3.2 111.3-185.1 195.58-321.8 196.8-319.66 217.46-353.29 227.17-350.37" 
                }),
                htm(tags, null, "path", { 
                  fill: "#BF360C", 
                  d: "M2194.24 394.89v1510.16c307.32-.06 614.45 136.26 777.63 378.59 1.83 7.42.3 12.83-5.2 18.2-4.5 4.42-446.28 325.09-772.43 557.78v1133.8c675.96 0 1727.46-6.4 2127.58-6.4-669.46-1159.54-1450.99-2377.85-2127.58-3592.13m871.67 2002.83 361.67 575.46.08 2c.04 6.5-8.59 13.04-212.46 168.2l-32.91 25.05c-96.12 73.12-190.12 152.4-292.1 216.67-8.06 0-587.61-416.95-587.61-434.75 0-19.64 661.62-483.55 763.33-552.63m429.63 694.96c9.7-2.92 30.37 30.7 227.16 350.37 84.29 136.7 196.33 318.6 195.58 321.8-3.7 16.54-81.38 16.47-459.3 16.16-279.2-.23-558.57 2.21-837.65-4.25-7.02-20.5 868.2-679.6 874.2-684.08" 
                })
              ], "g", { "fill-rule": "nonzero" })
            ], "svg", {
              xmlns: "http://www.w3.org/2000/svg",
              "xml:space": "preserve",
              "fill-rule": "evenodd",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "clip-rule": "evenodd",
              viewBox: "0 0 4389 4389",
              class: "footer-img"
            }),
            "div",
            { class: "footer-img-container" }
          )
        ],
        "div",
        { class: "footer-main" }
      ),
      "div",
      { class: "wrapper", style: "width: 100%; height: auto; position: relative;" }
    ),
    "div",
    // Keep the fixed positioning from the previous step
    { style: "position: fixed; bottom: 0; left: 0; width: 100%; z-index: 100; pointer-events: none;" }
  );
}