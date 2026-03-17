import {htm} from "../../bits/utility.js";
import {defaultVideoConfig,VideoPlayer} from "../../bits/ntry.js";

export default function Watch(tags) {
  const top = [
    // Logo SVG
    /* htm(tags, 
      htm(tags, undefined, "path",
      {
        fill: "#fff",
        d: "M43 0h148l-15 323h300L491 1l147-1-43 801-146-1 14-326H162l-14 327-148-1zm716 148-96 653c15 1 328 3 376-4 63-10 120-45 159-96 27-36 32-88 37-130 5-53-10-99-54-131-6-4-27-16-31-24-1-10 3-33 5-44 14-76 19-140-49-191-49-36-100-36-158-36zm181 128c22 0 47 1 59 8 25 12 7 93-2 113-6 12-27 19-40 23-26 6-67 15-93 15 0-18 18-141 24-155l17-3zm109 259c20 0 34 13 33 34 0 31-3 91-42 99-19 4-50 3-71 3h-99l-41-1c1-13 9-78 14-86q7-7 16-9l42-10 79-17q33-8 65-13zm440-400c92 0 219 32 286 99q48 48 56 117 2 27 1 54l-169-31c0-19-1-36-14-52-21-23-62-37-93-39-21-1-48-3-66 12-15 13-16 36-18 56l-9 126c-2 35-5 74-4 109 1 13 14 32 25 39 24 19 56 28 86 30 19 1 46 1 61-12 20-19 18-60 19-86l-11-2q-42-9-83-15l8-139c9-4 240 46 266 50l-10 147c-4 52-6 106-41 148-27 33-71 52-113 55-103 6-220-18-302-82-101-78-73-204-67-314 3-48 4-102 15-150 22-100 110-120 177-120"
      }),
      "svg",
      {
        class: "hbg-logo",
        xmlns: "http://www.w3.org/2000/svg",
        width: "482.3",
        height: "211",
        display: "block",
        preserveAspectRatio: "none",
        viewBox: "0 0 1833 802"
      }
    ), */
    // "’s Mission" heading

    VideoPlayer(tags, defaultVideoConfig),

    htm(tags,
      [
        htm(tags, "Season 1 Trailer", "h1", {class: "video-title"}),
        htm(tags, undefined, "div", {class: "divider"}),
        htm(tags, undefined, "hr"),
        htm(tags, undefined, "div", {class: "divider"}),
        htm(tags,
          htm(tags,
            [
              htm(tags, "A final message", "b"),
              " sent from the ",
              htm(tags, "eccentric billionaire & mentor", "i"),
              ", ",
              htm(tags, htm(tags, "Dr. Wurbly Turbly.", "u"), "b"),
              htm(tags, "", "br"),
              htm(tags, "", "br"),
              "His ",
              htm(tags, "previously, terminally ill", "i"),
              " son, ",
              htm(tags, htm(tags, "Wurbly Jr.,", "u"), "b"),
              " has made arrangements after his father's death, ",
              htm(tags, [
                "seeing an ",
                htm(tags, "unexpected recovery.", "b")
              ], "i"),
              htm(tags, "", "br"),
              "Now ",
              htm(tags, [
                "changing his surname to ",
                htm(tags, "Rainmaker", "u")
              ], "i"),
              " to avoid being confused as his father, ",
              htm(tags, "severing ties", "i"),
              " in order to not carry his father's ",
              htm(tags, "legacy.", "b"),
              htm(tags, "", "br"),
              htm(tags, "", "br"),
              htm(tags, htm(tags, "Wurbly Sr.", "u"), "b"),
              " ",
              htm(tags, "instead", "i"),
              " entrusted each of his ",
              htm(tags, "3 closest pupils", "b"),
              " with finalizing his will by ",
              htm(tags, "continuing the research he left behind.", "i"),
              htm(tags, "", "br"),
              htm(tags, "", "br"),
              "In the process of doing so, they'll ",
              htm(tags, "form a special pact,", "i"),
              " by extension, ",
              htm(tags, [
                "inheriting his property, ",
                htm(tags, "“Fort Tres”", "u")
              ], "i"),
              ", as a reward to advance their efforts.",
              htm(tags, "", "br"),
              "They are instructed to ",
              htm(tags, [
                "reside there, follow his instructions, & form ",
                htm(tags, "“The Trifect.”", "u")
              ], "i")
            ], "p", {class: "video-description"})
        , "div", {class: "text-card"})
      ],
      "div",
      {class: "video-info"}
    ),
    /* htm(tags,
      htm(tags,
        [
          "Blend ",
          htm(tags, "Houston’s", "u"),
          " ",
          htm(tags, "artists", "b"),
          " & ",
          htm(tags, "entrepreneurs", "b"),
          " ",
          htm(tags, "together into", "i"),
          " a ",
          htm(tags, "powerhouse network", "b"),
          " that ",
          htm(tags, htm(tags, "grows business", "b")),
          " ",
          htm(tags, "in the Houston-Heights area.", "u")
        ],
        "p"
      ),
      "div",
      {class: "text-card"}
    ), */
    
  ];

  return htm(tags, top, "section", {id: "watch"});
}