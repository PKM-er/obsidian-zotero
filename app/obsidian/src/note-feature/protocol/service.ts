import type { AnnotationsQuery, ItemsQuery } from "@obzt/protocol";
import { parseQuery } from "@obzt/protocol";
import { Service } from "@ophidian/core";
import { Notice } from "obsidian";
import ZoteroPlugin from "@/zt-main";

export class ProtocolHandler extends Service {
  plugin = this.use(ZoteroPlugin);

  onload(): void {
    this.registerEvent(
      this.plugin.server.on("zotero/open", (p) => this.onZtOpen(parseQuery(p))),
    );
    this.registerEvent(
      this.plugin.server.on("zotero/export", (p) =>
        this.onZtExport(parseQuery(p)),
      ),
    );
    this.registerEvent(
      this.plugin.server.on("zotero/update", (p) =>
        this.onZtExport(parseQuery(p)),
      ),
    );
  }
  async onZtOpen(query: AnnotationsQuery | ItemsQuery) {
    if (query.type === "annotation") {
      new Notice("Not implemented yet");
      return;
    }
    if (query.items.length < 1) {
      new Notice("No items to open");
      return;
    }
    await this.plugin.noteFeatures.openNote(query.items[0]);
  }
  async onZtUpdate(query: AnnotationsQuery | ItemsQuery) {
    if (query.type === "annotation") {
      new Notice("Single annotation update not yet supported");
      return;
    }
    if (query.items.length < 1) {
      new Notice("No items to open");
      return;
    }
    if (query.items.length > 1) {
      new Notice("Multiple literature note update not yet supported");
      return;
    }
    await this.plugin.noteFeatures.updateNoteFromId(query.items[0]);
  }
  async onZtExport(query: AnnotationsQuery | ItemsQuery) {
    if (query.type === "annotation") {
      new Notice("Not implemented yet");
      return;
    }
    if (query.items.length < 1) {
      new Notice("No items to open");
    } else if (query.items.length > 1) {
      new Notice("Multiple items in beta");
    }
    query.items.forEach(({ libraryID, id }) => {
      this.plugin.databaseAPI.getItems([[id, libraryID]])
        .then(([docItem]) => {
          if (!docItem) {
            new Notice("Item not found: " + id);
          } else {
            this.plugin.noteFeatures.createNoteForDocItemFull(docItem);
          }
        });
    });
  }
}
