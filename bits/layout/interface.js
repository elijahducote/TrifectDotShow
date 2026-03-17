import van from "vanjs-core";
import {htm} from "../utility.js";
import {paths} from "../../sitemap.json";

function capitalize(string) {
  if (string.length === 0) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function moveItem(arr, fromIndex) {
  const toIndex = Math.floor(arr.length/2);
  // 1. Create a copy to avoid side-effects
  const newArr = [...arr]; 
  
  // 2. Remove the item from the 'fromIndex'
  // .splice returns an array of removed items, so we take the first [0]
  const [movedItem] = newArr.splice(fromIndex, 1);
  
  // 3. Insert the item at the 'toIndex'
  newArr.splice(toIndex, 0, movedItem);
  
  return newArr;
}

export default function Interface (tags,tab,nomer) {
  const svgs = {
    watch: htm(tags, 
      htm(tags, undefined, "path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        fill: "#0FF",
        d: "M59.97 0a59.97 59.97 0 0 1 43.39 101.35c3.34 9.99 4.44 6.97 17.36 8.88v12.5c-19.28.78-15.44-1.14-27.55-12.83A59.97 59.97 0 1 1 59.97 0M27.63 44.25a16.14 16.14 0 1 1 0 32.28 16.14 16.14 0 0 1 0-32.28m65.45 0a16.14 16.14 0 1 1 0 32.28 16.14 16.14 0 0 1 0-32.28M60.83 10.86a16.13 16.13 0 1 1 0 32.26 16.13 16.13 0 0 1 0-32.26m-.57 40.85a8.3 8.3 0 1 1-.01 16.61 8.3 8.3 0 0 1 .01-16.61m.57 26.67a16.13 16.13 0 1 1 0 32.26 16.13 16.13 0 0 1 0-32.26"
      })
    , "svg", {
      xmlns: "http://www.w3.org/2000/svg",
      "xml:space": "preserve",
      width: "800",
      height: "800",
      "viewBox": "-1.09 0 122.88 122.88",
      class: "nav-icon"
    }),
    shop: htm(tags, 
       htm(tags, undefined, "path", {d:"M7 0H6L0 3v6l4-1v12h12V8l4 1V3l-6-3h-1a3 3 0 0 1-6 0z"})
    , "svg", {fill:"#0FF",width:"800",height:"800","viewBox":"0 0 20 20",xmlns:"http://www.w3.org/2000/svg",class:"nav-icon"}),
    talk: htm(tags,
          htm(tags,[
            htm(tags, undefined, "path", {d: "M235.7 290.3c5 5 13 5 18 0l195.1-195a12.8 12.8 0 0 0-9-21.9H49.6a12.8 12.8 0 0 0-9 21.9z"}),
          htm(tags, undefined, "path", {d: "M484.5 119.3a8 8 0 0 0-8.6 1.8L274 323a41 41 0 0 1-58.3 0L13.6 121A7.9 7.9 0 0 0 0 126.7v256.7c0 18 14.6 32.6 32.6 32.6h424.2c18 0 32.6-14.6 32.6-32.6V126.6c0-3.1-2-6-4.9-7.3"})
          ],"g",{fill: "#0FF"})
          , "svg", {xmlns: "http://www.w3.org/2000/svg", "xml:space": "preserve", width: "800", height: "800", viewBox: "0 0 489.4 489.4",class:"nav-icon"}),
    bio: htm(tags,
          [
            htm(tags, undefined, "circle", {cx: "12", cy: "7", r: "5"}),
            htm(tags, undefined, "path", {d: "M12 14c-5.5 0-10 2.7-10 6v2h20v-2c0-3.3-4.5-6-10-6z"})
          ], "svg", {fill: "#0FF", xmlns: "http://www.w3.org/2000/svg", width: "800", height: "800", viewBox: "0 0 24 24", class: "nav-icon"})
  },
  nth = paths.length;
  let itR8 = nth,
  cur,
  newpaths;
  for (;itR8;--itR8) {
    cur = nth - itR8;
    if (nomer === paths[cur]) {
      newpaths = moveItem(paths,cur);
      break;
    }
  }
  
  const navItems = [];
  let navI = newpaths.length;
  for (;navI;--navI) {
    cur = newpaths.length - navI;
    navItems.push(
      htm(tags, [svgs[newpaths[cur]], htm(tags, capitalize(newpaths[cur]), "h2")], "div", {"data-link": newpaths[cur]})
    );
  }
  const tabMenu = htm(tags, navItems, "div", {
      class: "wrapper topnav",
      style: "margin-bottom:0;margin-top:0"
    }),
    
  mainContent = htm(tags,tab,"div",{class: "wrapper tab-list", style: "margin-bottom:0"}),
  
  container = htm(tags,undefined,"div",{class: "container", style: "margin-bottom:0;margin-top:0"});

  van.add(container, tabMenu);
  van.add(container, mainContent);

  return container;
};