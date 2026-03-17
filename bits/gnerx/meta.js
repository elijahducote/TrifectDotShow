import van from "vanjs-core";

import {htm,findMimeType} from "../utility.js";


export default async function MetaData(tags,cfg,icons) {
  const nth = cfg?.metadata?.length,
  elm = {},
  head = htm(tags, [htm(tags, undefined, "meta", {charset:"UTF-8"}), htm(tags, cfg?.title || "Not Found!", "title")], "head");
  
  let itR8 = nth,
  cur,
  ext,
  nomer,
  isSupported = false;

  van.add(head,icons);
  
  for (;itR8;--itR8) {
    cur = nth - itR8;
    
    if (cfg.metadata[cur].length === 2) {
      van.add(head, htm(tags,undefined, "meta", {name:cfg.metadata[cur][0],content:cfg.metadata[cur][1]}));
      continue;
    }
    ext = await findMimeType(cfg.metadata[cur]);
    switch (ext) {
      case "text/css": {
        nomer = "link";
        if (elm.src) delete elm.src;
        elm.href = cfg.metadata[cur];
        elm.rel = "stylesheet";
        elm.type = ext;
        isSupported = true;
        break;
      }
      case "application/javascript":
      case "text/javascript": {
        nomer = "script";
        if (elm.href) delete elm.href;
        if (elm.rel) delete elm.rel;
        elm.src = cfg.metadata[cur];
        elm.type = ext;
        isSupported = true;
        break;
      }
      default: {
        isSupported = false;
        break;
      }
    }

    if (isSupported) van.add(head, htm(tags,undefined, nomer, elm));
  }

  //if (cfg?.script) van.add(head, htm(tags,undefined,"script",{src: cfg?.script, type:"text/javascript"}));

  return head;
}