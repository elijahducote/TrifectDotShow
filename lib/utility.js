import { existsSync } from "node:fs";

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  dim: '\x1b[2m',
  strike: '\x1b[9m',

  mystery: '\x1b[95m',
  prompt: '\x1b[96m',
  aid: '\x1b[93m',
  success: '\x1b[92m',
  fail: '\x1b[91m',
  test: '\x1b[94m',
  cite: '\x1b[90m',
};

/**
 * High-performance Markdown parser for terminal formatting
 */
function parseMarkdown(text, activeColor = '') {
  const len = text.length;
  let result = '';
  let i = 0;

  while (i < len) {
    const char = text[i];
    const next = text[i + 1];

    // Escape: \
    if (char === '\\' && next) {
      result += next;
      i += 2;
      continue;
    }

    // Color: {tag}...{/tag}
    if (char === '{') {
      const tagEnd = text.indexOf('}', i + 1);
      if (tagEnd !== -1) {
        const tag = text.slice(i + 1, tagEnd);

        if (ANSI[tag]) {
          const closeTag = `{/${tag}}`;
          const closeIdx = text.indexOf(closeTag, tagEnd + 1);

          if (closeIdx !== -1) {
            const content = text.slice(tagEnd + 1, closeIdx);
            result += ANSI[tag] + parseMarkdown(content, ANSI[tag]) + ANSI.reset + activeColor;
            i = closeIdx + closeTag.length;
            continue;
          }
        }
      }
    }

    // Bold: ** or __
    if ((char === '*' && next === '*') || (char === '_' && next === '_')) {
      const marker = char + char;
      const closeIdx = text.indexOf(marker, i + 2);

      if (closeIdx !== -1) {
        const content = text.slice(i + 2, closeIdx);
        result += ANSI.bold + parseMarkdown(content, activeColor) + ANSI.reset + activeColor;
        i = closeIdx + 2;
        continue;
      }
    }

    // Italic: * or _
    if (char === '*' || char === '_') {
      const closeIdx = text.indexOf(char, i + 1);

      if (closeIdx !== -1 && text[closeIdx + 1] !== char) {
        const content = text.slice(i + 1, closeIdx);
        result += ANSI.italic + parseMarkdown(content, activeColor) + ANSI.reset + activeColor;
        i = closeIdx + 1;
        continue;
      }
    }

    // Strikethrough: ~~
    if (char === '~' && next === '~') {
      const closeIdx = text.indexOf('~~', i + 2);

      if (closeIdx !== -1) {
        const content = text.slice(i + 2, closeIdx);
        result += ANSI.strike + parseMarkdown(content, activeColor) + ANSI.reset + activeColor;
        i = closeIdx + 2;
        continue;
      }
    }

    // Code: `
    if (char === '`') {
      const closeIdx = text.indexOf('`', i + 1);

      if (closeIdx !== -1) {
        result += ANSI.dim + text.slice(i + 1, closeIdx) + ANSI.reset + activeColor;
        i = closeIdx + 1;
        continue;
      }
    }

    // Regular character
    result += char;
    i++;
  }

  return result;
}


function print(msg) {
  msg = parseMarkdown(msg);
  let cfg = {
    cmd: [],
    env: process.env,
    stdout: "inherit",
    stderr: "inherit"
  };

  if (process?.platform === "win32") {
    cfg.cmd[0] = "C:\\Windows\\System32\\cmd.exe";
    cfg.cmd[1] = "/c";
    cfg.cmd[2] = `echo ${msg}`;
  } else {
    // Check for bash first, fall back to sh
    if (existsSync("/bin/bash")) cfg.cmd[0] = "/bin/bash";
    else if (existsSync("/usr/bin/bash")) cfg.cmd[0] = "/usr/bin/bash";
    else cfg.cmd[0] = "/bin/sh";
    cfg.cmd[1] = "-c";
    cfg.cmd[2] = `echo ${msg}`;
  }

  Bun.spawnSync(cfg);
}

export {print};