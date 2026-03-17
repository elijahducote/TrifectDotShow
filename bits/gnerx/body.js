import van from "vanjs-core";
import {htm} from "../utility.js";
import {print} from "../../lib/utility.js";

export default function Body(tags, cfg, tab) {
  const body = htm(tags, undefined, "body"),
    content = ["header","sections", "navs", "main", "footer"],
    nth = content.length;

  let i = nth,
    ndx = 0,
    itR8 = 0,
    attr = {},
    holder,
    LEment,
    itemCount,
    arrayIndex,
    name;

  // Prepare by summing the length of all content
  for (; i; --i) {
    name = content[i - 1];
    if (cfg?.[name]?.length) {
      itR8 += cfg[name].length;
      continue;
    }
    if (cfg?.[name]) ++itR8;
  }


  for (; itR8; --itR8) {
    name = content[ndx];

    switch (content[ndx]) {
      case "main": {
        attr.id = tab;
        break;
      }
      default: {
        delete attr?.id;
      }
    }

    // Skip to next item with cfg data
    if (!cfg?.[name]?.length && !cfg?.[name]) {
      ++itR8;  // Don't count this as an iteration
      ++ndx;
      continue;
    }

    if (cfg?.[name]?.length) {
      if (!itemCount) {
        // remove plural name to use as element
        LEment = name;
        if (LEment.charCodeAt(LEment.length - 1) === 115)
          LEment = LEment.substring(0, LEment.length - 1);
        itemCount = cfg[name].length;
        arrayIndex = 0;
      }

      holder = cfg[name][arrayIndex];

      van.add(body, htm(tags, holder, LEment, attr));
      ++arrayIndex;

      if (arrayIndex >= itemCount) {
        ++ndx;
        itemCount = undefined;
        arrayIndex = undefined;
      }
    } else {
      holder = cfg[name];
      van.add(body, htm(tags, holder, name, attr));
      ++ndx;
    }
  }
  return body;
}