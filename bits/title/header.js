import {htm,withinRange} from "../utility/exports.js";

export default function Header (tags, title="",type=1,attr) {
  
  // Make type between 1-6 if it exceeds or is under valid HTML tag.
  if (!withinRange(type,6)) {
    if (type < 1) type = 1;
    else type = 6;
  }
  
  switch (type) {
    case 1: {
      
    }
    case 2: {
      
    }
    case 3: {
      
    }
    case 4: {
      
    }
    case 5: {
      
    }
    case 6: {
      
    }
  }
  
  return [
    htm(title,`h${type}`,attr),
    htm(undefined,"hr"),
  ];
}