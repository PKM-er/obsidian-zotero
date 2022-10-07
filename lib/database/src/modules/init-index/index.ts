import { getItemKeyGroupID, multipartToSQL } from "@obzt/common";
import type {
  Item,
  ItemField,
  ItemCitekey,
  ItemCreator,
  GeneralItem,
  GeneralItemBase,
} from "@obzt/zotero-type";
import Fuse from "fuse.js";
import type { DbWorkerAPI } from "@api";
import { databases, fuseIndex, itemIdIndex, itemKeyIndex } from "@init";
import log from "@log";

import sql from "./better-bibtex.js";
import creatorsSql from "./creators.js";
import { itemFieldsSQL, itemSQL } from "./general.js";

const fuseOptions: Fuse.IFuseOptions<GeneralItem> = {
  keys: ["title"],
  ignoreLocation: true,
  ignoreFieldNorm: true,
  includeMatches: true,
  shouldSort: true,
};

const initIndex: DbWorkerAPI["initIndex"] = async (libraryID) => {
  const { items, itemFields, creators } = await readMainDb(libraryID);
  const citekeyMap = await readBbtDb();

  // prepare for fuse index

  const entries = items.reduce((rec, { itemID, ...props }) => {
    if (itemID) {
      const item: GeneralItemBase = {
        ...props,
        itemID,
        creators: [],
        citekey: null,
      };
      rec[itemID] = item as GeneralItem;
    }
    return rec;
  }, {} as Record<number, GeneralItem>);

  // eslint-disable-next-line prefer-const
  for (let { itemID, fieldName, value } of itemFields) {
    if (!itemID || !fieldName) continue;
    if (fieldName === "date")
      value = multipartToSQL(value as string).split("-")[0];
    if (itemID in entries) {
      const values = (entries[itemID][fieldName] =
        entries[itemID][fieldName] || []);
      values.push(value);
    } else {
      console.error(
        `Field: No item found for itemID ${itemID}`,
        fieldName,
        value,
      );
    }
  }
  for (const { itemID, ...creator } of creators) {
    if (itemID in entries) {
      entries[itemID].creators.push(creator);
    } else {
      console.error(`Creator: No item found for itemID ${itemID}`, creator);
    }
  }
  for (const { itemID, citekey } of citekeyMap) {
    if (itemID in entries) {
      entries[itemID].citekey = citekey;
    } else {
      console.error(`Citekey: No item found for itemID ${itemID}`, citekey);
    }
  }

  log.trace("Start fuse indexing");
  const generalItems = Object.values(entries);

  fuseIndex[libraryID] = new Fuse(generalItems, fuseOptions);
  log.info("Library index initialized");

  itemKeyIndex[libraryID] = generalItems.reduce(
    (record, item) => ((record[getItemKeyGroupID(item, true)] = item), record),
    {} as Record<string, GeneralItem>,
  );
  itemIdIndex[libraryID] = generalItems.reduce(
    (record, item) => (
      item.itemID !== null && (record[item.itemID] = item), record
    ),
    {} as Record<string, GeneralItem>,
  );
};

export default initIndex;

const readMainDb = async (
  libraryID: number,
): Promise<{
  items: Item[];
  itemFields: ItemField[];
  creators: ItemCreator[];
}> => {
  log.debug("Reading main Zotero database for index");
  const db = databases.main.db;
  if (!db) {
    throw new Error("failed to init index: no main database opened");
  }
  const result = {
    items: await itemSQL(db, libraryID),
    itemFields: await itemFieldsSQL(db, libraryID),
    creators: await creatorsSql(db, libraryID),
  };
  log.info("Finished reading main Zotero database for index");
  return result;
};
const readBbtDb = async (): Promise<ItemCitekey[]> => {
  log.debug("Reading Better BibTex database");
  if (!databases.bbt.opened) {
    log.info("Better BibTex database not enabled, skipping...");
    return [];
  }
  const db = databases.bbt.db;
  if (!db) {
    throw new Error("failed to init index: no Better BibTex database opened");
  }
  const result = await sql(db);
  log.info("Finished reading Better BibTex");
  return result;
};
