import { join } from "path/posix";
import type { ItemKeyGroup } from "@obzt/common";
import type { RegularItemInfoBase } from "@obzt/database";
import { Service } from "@ophidian/core";

import type { TFile } from "obsidian";
import { Notice } from "obsidian";
import {
  cacheAttachmentSelect,
  chooseAnnotAtch,
} from "@/components/atch-suggest";
import { getItemKeyOf, isLiteratureNote } from "@/services/note-index";
import type { TemplateRenderer } from "@/services/template";
import { Template, fromPath } from "@/services/template/eta/preset";
import type { Context } from "@/services/template/helper/base.js";
import ZoteroPlugin from "@/zt-main";
import { AnnotationView, annotViewType } from "./annot-view/view";
import { CitationEditorSuggest, insertCitationTo } from "./citation-suggest/";
// import { NoteFields } from "./note-fields/service";
// import { NoteFieldsView, noteFieldsViewType } from "./note-fields/view";
import { importNote } from "./note-import";
import { ProtocolHandler } from "./protocol/service";
import { openOrCreateNote } from "./quick-switch";
import {
  ItemDetailsView,
  itemDetailsViewType,
} from "./template-preview/details";
import { openTemplatePreview } from "./template-preview/open";
import {
  TemplatePreview,
  templatePreviewViewType,
} from "./template-preview/preview";
import { getHelperExtraByAtch, updateNote } from "./update-note";

class NoteFeatures extends Service {
  plugin = this.use(ZoteroPlugin);

  // noteFields = this.use(NoteFields);
  // topicImport = this.use(TopicImport);
  protocol = this.use(ProtocolHandler);

  onload(): void {
    const { plugin } = this;
    const { app } = plugin;
    plugin.addCommand({
      id: "note-quick-switcher",
      name: "Open quick switcher for literature notes",
      callback: () => openOrCreateNote(plugin),
    });
    plugin.registerView(
      annotViewType,
      (leaf) => new AnnotationView(leaf, plugin),
    );
    plugin.registerView(
      templatePreviewViewType,
      (leaf) => new TemplatePreview(leaf, plugin),
    );
    plugin.registerView(
      itemDetailsViewType,
      (leaf) => new ItemDetailsView(leaf, plugin),
    );
    plugin.registerEvent(
      plugin.app.workspace.on("file-menu", (menu, file) => {
        const tpl = fromPath(file.path, plugin.settings.templateDir);
        if (tpl?.type !== "ejectable") return;
        menu.addItem((i) =>
          i
            .setIcon("edit")
            .setTitle("Open template preview")
            .onClick(() => {
              openTemplatePreview(tpl.name, null, plugin);
            }),
        );
      }),
    );
    // plugin.registerView(
    //   noteFieldsViewType,
    //   (leaf) => new NoteFieldsView(leaf, plugin),
    // );
    plugin.addCommand({
      id: "zotero-annot-view",
      name: "Open Zotero annotation view in side panel",
      callback: () => {
        app.workspace.ensureSideLeaf(annotViewType, "right", {
          active: true,
          /**
           * Workaroud to make sure view shows active file when first open
           * TODO: bug report? replicate in Backlink, Outline etc...
           */
          state: { file: app.workspace.getActiveFile()?.path },
        });
      },
    });
    // plugin.addCommand({
    //   id: "zotero-note-fields",
    //   name: "Open Literature Note Fields in Side Panel",
    //   callback: () => {
    //     app.workspace.ensureSideLeaf(noteFieldsViewType, "right", {
    //       active: true,
    //       /**
    //        * Workaroud to make sure view shows active file when first open
    //        * TODO: bug report? replicate in Backlink, Outline etc...
    //        */
    //       state: { file: app.workspace.getActiveFile()?.path },
    //     });
    //   },
    // });
    plugin.addCommand({
      id: "insert-markdown-citation",
      name: "Insert Markdown citation",
      editorCallback: (editor, ctx) =>
        insertCitationTo(editor, ctx.file, plugin),
    });
    plugin.registerEditorSuggest(new CitationEditorSuggest(plugin));

    const updateNote = async (file: TFile, overwrite?: boolean) => {
      const lib = plugin.settings.libId;
      const itemKey = getItemKeyOf(file, app.metadataCache);
      if (!itemKey) {
        new Notice("Cannot get zotero item key from file name");
        return false;
      }
      const [item] = await plugin.databaseAPI.getItems([[itemKey, lib]]);
      if (!item) {
        new Notice("Cannot find zotero item with key " + itemKey);
        return false;
      }
      await this.updateNote(item, overwrite);
    };
    plugin.addCommand({
      id: "update-literature-note",
      name: "Update literature note",
      editorCheckCallback(checking, _editor, ctx) {
        const shouldContinue = ctx.file && isLiteratureNote(ctx.file, app);
        if (checking) {
          return !!shouldContinue;
        } else if (shouldContinue) {
          updateNote(ctx.file);
        }
      },
    });
    plugin.addCommand({
      id: "overwrite-update-literature-note",
      name: "Force update literature note by overwriting",
      editorCheckCallback(checking, _editor, ctx) {
        const shouldContinue = ctx.file && isLiteratureNote(ctx.file, app);
        if (checking) {
          return !!shouldContinue;
        } else if (shouldContinue) {
          updateNote(ctx.file, true);
        }
      },
    });
    plugin.addCommand({
      id: "import-note",
      name: "Import note",
      callback: () => importNote(plugin),
    });
    plugin.registerEvent(
      plugin.app.workspace.on("file-menu", (menu, file) => {
        if (!isLiteratureNote(file, app)) {
          return;
        }
        menu.addItem((i) =>
          i
            .setTitle("Update literature note")
            .setIcon("sync")
            .onClick(() => updateNote(file)),
        );
        if (!plugin.settings.current?.updateOverwrite)
          menu.addItem((i) =>
            i
              .setTitle("Force update by overwriting")
              .setIcon("sync")
              .onClick(() => updateNote(file, true)),
          );
      }),
    );
    plugin.registerEvent(
      plugin.app.workspace.on("file-menu", (menu, file) => {
        const tpl = fromPath(file.path, plugin.settings.templateDir);
        if (tpl?.type !== "ejectable") return;
        menu.addItem((i) =>
          i
            .setTitle("Reset to default")
            .setIcon("reset")
            .onClick(async () => {
              // make sure prompt is shown in the active window
              if (!activeWindow.confirm("Reset template to default?")) return;
              await plugin.app.vault.modify(
                file as TFile,
                Template.Ejectable[tpl.name],
              );
            }),
        );
      }),
    );
  }
  async openNote(item: ItemKeyGroup, slience = false): Promise<boolean> {
    const { workspace } = this.plugin.app;
    const { noteIndex } = this.plugin;

    const info = noteIndex.getNotesFor(item);
    if (!info.length) {
      !slience &&
        new Notice(
          `No literature note found for zotero item with key ${item.key}`,
        );
      return false;
    }

    // TODO: support multiple notes
    const firstNote = info.sort().shift()!;
    await workspace.openLinkText(firstNote, "", false, { active: true });
    return true;
  }

  async createNoteForDocItem(
    docItem: RegularItemInfoBase,
    render: {
      note: (template: TemplateRenderer, ctx: Context) => string;
      filename: (template: TemplateRenderer, ctx: Context) => string;
    },
  ) {
    const { noteIndex } = this.plugin;

    const info = noteIndex.getNotesFor(docItem);
    if (info.length) {
      // Just update this, why not?
      return await this.updateNote(info, docItem.key);
    }

    const { vault, fileManager } = this.plugin.app,
      { literatureNoteFolder: folder } = this.plugin.settings.current,
      template = this.plugin.templateRenderer;

    const filepath = join(
      folder,
      render.filename(template, { plugin: this.plugin }),
    );
    const existingFile = vault.getAbstractFileByPath(filepath);
    if (existingFile) {
      if (getItemKeyOf(existingFile, this.plugin.app.metadataCache)) {
        // only throw error if the note is linked to the same zotero item
        throw new NoteExistsError([filepath], docItem.key);
      }
    }

    // filepath with suffix if file already exists
    const note = await fileManager.createNewMarkdownFile(
      vault.getRoot(),
      filepath,
      render.note(template, {
        plugin: this.plugin,
        sourcePath: filepath,
      }),
    );
    return note;
  }

  async createNoteForDocItemFull(item: RegularItemInfoBase): Promise<string> {
    const libId = this.plugin.settings.libId;
    const allAttachments = await this.plugin.databaseAPI.getAttachments(
      item.itemID,
      libId,
    );
    const selected = await chooseAnnotAtch(allAttachments, this.plugin.app);
    if (selected) {
      cacheAttachmentSelect(selected, item);
    }
    const notes = await this.plugin.databaseAPI
      .getNotes(item.itemID, libId)
      .then((notes) => this.plugin.noteParser.normalizeNotes(notes));

    const extraByAtch = await getHelperExtraByAtch(
      item,
      { all: allAttachments, selected: selected ? [selected] : [], notes },
      this.plugin,
    );
    const extra = Object.values(extraByAtch)[0];
    const note = await this.createNoteForDocItem(item, {
      note: (template, ctx) => template.renderNote(extra, ctx),
      filename: (template, ctx) => template.renderFilename(extra, ctx),
    });
    return note.path;
  }

  async updateNoteFromId(id: ItemKeyGroup & { libraryID: number }) {
    const { noteIndex, databaseAPI } = this.plugin;

    const info = noteIndex.getNotesFor(id);
    if (!info.length) {
      new Notice(`No literature note found for zotero item with key ${id.key}`);
      return;
    }
    const [item] = await databaseAPI.getItems([[id.key, id.libraryID]]);
    if (!item) {
      new Notice(`Cannot find zotero item with key ${id.key}`);
      return;
    }
    await this.updateNote(item);
  }

  async updateNote(item: RegularItemInfoBase, overwrite?: boolean) {
    const summary = await updateNote(item, this.plugin, overwrite);
    if (summary) {
      if (summary.addedAnnots > 0 || summary.updatedAnnots > 0)
        new Notice(
          `Affected ${summary.notes} notes, ` +
            `annotations: ${summary.addedAnnots} added, ` +
            `${summary.updatedAnnots} updated`,
        );
      else new Notice(`Affected ${summary.notes} notes, no annotation updated`);
    } else {
      new Notice("No note found for this literature");
    }
  }
}

export default NoteFeatures;

export class NoteExistsError extends Error {
  constructor(public targets: string[], public key: string) {
    super(`Note linked to ${key} already exists: ${targets.join(",")}`);
    this.name = "NoteExistsError";
  }
}
