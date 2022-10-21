import obPlugin from "@aidenlx/esbuild-plugin-obsidian";
import { build } from "esbuild";
import { lessLoader } from "esbuild-plugin-less";
import { createReadStream, createWriteStream } from "fs";
import JSZip from "jszip";
import { join } from "path";
import { pipeline } from "stream/promises";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source visit the plugins github repository
*/
`;

const isProd = process.env.BUILD === "production";

/** @type import("esbuild").BuildOptions */
const opts = {
  bundle: true,
  watch: !isProd,
  platform: "node",
  logLevel: process.env.BUILD === "development" ? "info" : "silent",
  external: [
    "obsidian",
    "electron",
    "@electron/remote",
    "@codemirror/autocomplete",
    "@codemirror/state",
  ],
  format: "cjs",
  mainFields: ["browser", "module", "main"],
  sourcemap: isProd ? false : "inline",
  minify: isProd,
  loader: {
    ".svg": "text",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.BUILD),
  },
};
const assets = ["main.js", "styles.css", "manifest.json"];
try {
  await build({
    ...opts,
    entryPoints: ["src/zt-main.ts"],
    banner: { js: banner },
    outfile: "build/main.js",
    plugins: [lessLoader(), obPlugin()],
  });
  var zip = new JSZip();
  for (const filename of assets) {
    zip.file(filename, createReadStream(join("build", filename)));
  }
  await pipeline(
    zip.generateNodeStream({ type: "nodebuffer", streamFiles: true }),
    createWriteStream(join("build", "obsidian-zotero-plugin.zip")),
  );
  console.log("obsidian-zotero-plugin.zip written.");
} catch (err) {
  console.error(err);
  process.exit(1);
}
