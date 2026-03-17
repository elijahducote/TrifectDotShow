import { glob } from "glob";
import { print } from "./lib/utility.js";

// HTML-specific
import { JSDOM } from "jsdom";
import { prettify, closify } from "htmlfy";
import van from "mini-van-plate";
import { htm } from "./bits/utility.js";
import sitemap from "./sitemap.json";

import {
  // Generics
  Body,
  MetaData,
  // Layout
  Interface,
  Footer
} from "./bits/ntry.js";

// Get optional page argument
const targetPage = process.argv[2] || null;

// Early exit if target page is not in sitemap
if (targetPage && !sitemap.paths.includes(targetPage)) {
  print(`{fail}Page "${targetPage}" not found in sitemap, skipping build{/fail}`);
  process.exit(0);
}

async function runBuild(pageName = null) {
  let cssFyl, jsFyl, jsVideoFyl;

  if (pageName) {
    // Only bundle files for the specific page
    cssFyl = await glob(`./nav/${pageName}/*.css`);
    jsFyl = await glob(`./nav/${pageName}/index.js`);
    jsVideoFyl = await glob("./nav/shared/video/*.js");
  } else {
    // Bundle all files
    cssFyl = await glob("./nav/*/*.css");
    jsFyl = await glob("./nav/*/index.js");
    jsVideoFyl = await glob("./nav/shared/video/*.js");
  }

  const cmd = Bun.spawn(
  [
    "bun",
    "build",
    "./nav/shared/index.css",
    "./nav/shared/playback.css",
    ...cssFyl,
    ...jsFyl,
    ...jsVideoFyl,
    "--outdir=./dploy",
    "--target=browser",
    "--format=iife",
    "--minify",
    "--splitting",
    "--sourcemap=none",
    "--entry-naming=[dir]/[name].[ext]",
    "--asset-naming=[dir]/[name].[ext]",
    "--root=./nav",
    "--drop=debugger",
    "--pure=console.info",
    "--pure=console.debug",
    "--pure=console.warn",
    "--pure=window.alert",
    "--css-chunking",
    "--external=*.woff2",
    "--external=*.woff"
  ],
  {
    env: {
      ...process.env,
      PATH: `${process.env.PATH}:/root/.bun/bin/`
    },
    stdin: "inherit",
    stdout: "inherit"
  });
  await cmd.exited;
}

async function processHTML(nav, pageName = null) {
  // Run the bundler first (for specific page or all)
  await runBuild(pageName);

  // Instance server-side DOM with HTML string
  const DOM = new JSDOM("<!DOCTYPE html>"),
  // Get the HTML document + tags
  {html, tags} = van.vanWithDoc(DOM.window.document);

  // Determine which pages to process
  const pagesToProcess = pageName ? [pageName] : nav.paths;

  let isErr = true,
  page,
  newfyL,
  webDQment,
  formatted,
  tab,
  icons;

  try {
    const {createFavicon} = await import("create-favicon"),
    {html: output} = await createFavicon({
      sourceFile: './nav/icons/TRIFECT_LOGO.svg',
      outputDir: `./dploy/icons/`,
      basePath: `/src/icons/`,
      overwrite: false,
      warn: false,
      manifest: true,
    });
    icons = JSDOM.fragment(output);
  } catch (err) {
    print(`{fail}Icons failed: \n${err}{/fail}`)
  }

  for (const nomer of pagesToProcess) {
    page = nav?.[nomer];
    if (!page) continue;

    await import(`./nav/${nomer}/${nomer}.js`)
    .then(module => {
      isErr = false;
      tab = module.default;
    })
    .catch(err => {
      isErr = true;
      print(`{fail}*Something's amiss!* When attempting ./${nomer}/${nomer}.js\n${err}{/fail}`);
    });

    if (isErr) tab = undefined;
    else tab = tab(tags);

    webDQment = html({lang:"en-US"},
      await MetaData(tags, page, icons),
      Body(tags, {
        //header: TopNav(tags),
        main: Interface(tags,tab,nomer),
        footer: Footer(tags)
      }, nomer)
    );
    
    formatted = closify(prettify(webDQment,
    {
      content_wrap: 0,
      strict: false,
      tab_size: 1,
      tag_wrap: 0
    }));

    newfyL = Bun.file(`./nav/${nomer}/index.html`);
    await newfyL.write(formatted)
    .then((bytes) => {
      console.log(`Successfully wrote ${bytes} bytes for ${nomer}.`);
    }).catch((err) => {
      console.error(`Encountered issue: ${err}`);
    });
  }
}

// Run with optional target page
processHTML(sitemap, targetPage);