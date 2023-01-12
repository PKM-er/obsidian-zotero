// import "./main.less";

import type { Extension } from "@codemirror/state";
import { use } from "@ophidian/core";
import type { App, PluginManifest } from "obsidian";
import { Notice, Plugin, TFolder } from "obsidian";
import log from "@log";

import { AnnotBlockWorker, registerCodeBlock } from "./annot-block";
import {
  CitationEditorSuggest,
  insertCitation,
} from "./insert-citation/index.js";
import checkLib from "./install-guide/index.jsx";
import registerNoteFeature from "./note-feature";
import NoteIndex from "./note-index/index.js";
// import NoteParser from "./note-parser";
// import PDFCache from "./pdf-outline";
import { ZoteroSettingTab } from "./setting-tab/index.js";
import type { ZoteroSettings } from "./settings.js";
import { getDefaultSettings, SettingLoader, saveSettings } from "./settings.js";
import { TemplateComplier, TemplateLoader, TemplateRenderer } from "./template";
import registerEtaEditorHelper from "./template/editor";
import DatabaseWatcher from "./zotero-db/auto-refresh/service";
import DatabaseWorker from "./zotero-db/connector/service";
import { ZoteroDatabase } from "./zotero-db/database";
import { ImgCacheImporter } from "./zotero-db/img-import/service";

export default class ZoteroPlugin extends Plugin {
  use = use.plugin(this);

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    if (!checkLib(manifest)) {
      throw new Error("Library check failed");
    }
    this.annotBlockWorker = new AnnotBlockWorker(this);
    this.noteIndex = new NoteIndex(this);
    // this.noteParser = new NoteParser(this);
    // this.pdfCache = new PDFCache(this);
  }

  settings: ZoteroSettings = getDefaultSettings(this);
  settingLoader = this.use(SettingLoader);
  saveSettings = saveSettings.bind(this);

  get databaseAPI() {
    return this.dbWorker.api;
  }
  dbWorker = this.use(DatabaseWorker);
  imgCacheImporter = this.use(ImgCacheImporter);
  dbWatcher = this.use(DatabaseWatcher);
  database = this.use(ZoteroDatabase);

  templateRenderer = this.use(TemplateRenderer);
  templateComplier = this.use(TemplateComplier);
  templateLoader = this.use(TemplateLoader);

  // noteParser: NoteParser;
  // pdfCache: PDFCache;
  annotBlockWorker: AnnotBlockWorker;
  noteIndex: NoteIndex;

  editorExtensions: Extension[] = [];
  async onload() {
    log.info("loading Obsidian Zotero Plugin");
    registerCodeBlock(this);
    registerEtaEditorHelper(this);
    this.addCommand({
      id: "insert-markdown-citation",
      name: "Insert Markdown citation",
      editorCallback: insertCitation(this),
    });
    this.registerEditorSuggest(new CitationEditorSuggest(this));
    this.addCommand({
      id: "refresh-zotero-data",
      name: "Refresh Zotero Data",
      callback: async () => {
        await this.dbWorker.refresh({ task: "full" });
      },
    });
    this.addCommand({
      id: "refresh-note-index",
      name: "Refresh Literature Notes Index",
      callback: () => {
        this.noteIndex.reload();
        new Notice("Literature notes re-indexed");
      },
    });
    this.addSettingTab(new ZoteroSettingTab(this));
    // getZoteroLinkHandlers(this).forEach((args) =>
    //   this.registerObsidianProtocolHandler(...args),
    // );

    registerNoteFeature(this);
  }

  onunload() {
    log.info("unloading Obsidian Zotero Plugin");
  }

  async getLiteratureNoteFolder(): Promise<TFolder> {
    const { literatureNoteFolder: folder } = this.settings;
    let af = folder.getFile(this.app.vault),
      noteFolder: TFolder;
    if (af instanceof TFolder) {
      noteFolder = af;
    } else if (!af) {
      await this.app.vault.createFolder(folder.path);
      af = folder.getFile(this.app.vault);
      if (!(af instanceof TFolder)) {
        throw new Error("Failed to create note folder: " + folder.path);
      }
      noteFolder = af;
    } else {
      new Notice(
        `Invalid note folder: ${folder.path}, revert to default folder`,
      );
      folder.path = "";
      af = folder.getFile(this.app.vault);
      if (!(af instanceof TFolder)) {
        throw new Error("Failed to get default note folder: " + folder.path);
      }
      noteFolder = af;
    }
    return noteFolder;
  }
}
