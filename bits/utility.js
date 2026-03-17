import { lookup } from "mrmime";
import axios from "axios";
import {print} from "../lib/utility.js";

function htm(tags, content, nomer, attr) {
  const args = [];
  if (attr) args[0] = attr;
  if (!nomer) nomer = "span";
  if (Array.isArray(content)) {
    let itR8 = content.length,
    nth = itR8;
    for (;itR8;--itR8) {
      args.push(content[nth - itR8]);
    }
  }
  else args.push(content);
  return tags[nomer].apply(null, args);
}

async function findMimeType(link) {
  const prefX= "http";
  let i = 4,
  matches = 0,
  char,
  cur,
  pos;

  for (;i;--i) {
    cur = 4 - i;
    char = prefX.charCodeAt(cur);
    pos = link.charCodeAt(cur);
    if (pos === char || pos === char-32) ++matches;
  }

  if (matches === 4) {
    let mimetype = "",
    isSecure = link.charCodeAt(4),
    formatted;

    if (isSecure === 115  || isSecure === 83) formatted = link;
    else formatted = "https" + link.slice(4);

    await axios.get(formatted)
    .then(res => {
      const header = res.headers["content-type"],
      length = header.length;
      let itR8 = length,
      cur,
      char;

      for (;itR8;--itR8) {
        cur = length - itR8;
        char = header.charCodeAt(cur);
        switch (char) {
          case 9: // tab
          case 32:  // space
          case 34: // quote
          case 92: // backslash
            continue;
          case 59:  // semi-colon 
            return;
        }
        mimetype += String.fromCharCode(char);
      }
    }).catch(err => {
      print(err);
      mimetype = false;
    });
    return mimetype;
  }
  else {
    let nth = link?.length;

    let itR8 = nth,
    ext = "",
    code,
    curCode;

    for (;itR8;--itR8) {
      code = link.charCodeAt(itR8-1);

      if (code == 46) return lookup(ext);
      else if (!(itR8-1)) return false;

      if (ext.length >= 9) return false;

      // Normalize uppercase to lowercase
      if (code > 64 && code < 91) code += 32;
      ext = String.fromCodePoint(code) + ext;

    }

    return false;
  }
}

function withinRange(value,range) {
 return ((value | range) === range) & ((~value >>> 31) & 1);
}


export {
  htm,
  findMimeType,
  withinRange
};