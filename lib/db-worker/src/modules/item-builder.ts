import { multipartToSQL } from "@obzt/common";

import type {
  ItemDetails,
  IDLibID,
  RegularItemInfo,
  RegularItemInfoBase,
  Collection,
} from "@obzt/database";
import { Creators, ItemFields, Collections } from "@obzt/database";
// import { use } from "to-use";
import log from "@log";
import { conn } from "../globals";
import { uniq } from "./item-fetcher";

export default class ItemBuilder {
  #conn = conn;

  readCitekeys(items: IDLibID[]) {
    log.debug("Reading Better BibTex database");
    if (!this.#conn.bbtLoadStatus) {
      log.info("Better BibTex database not enabled, skipping...");
      return [];
    }
    const result = this.#conn.getCitekeys(items);
    log.info("Finished reading Better BibTex");
    return result;
  }

  toItemObjects(itemIDMap: Record<number, ItemDetails>, itemIDs: IDLibID[]) {
    const citekeyMap = this.readCitekeys(itemIDs);

    const itemFields = this.#conn.zotero.prepare(ItemFields).query(itemIDs),
      creators = this.#conn.zotero.prepare(Creators).query(itemIDs);
    const collectionIDs = uniq(
      itemIDs.flatMap(
        ([itemID]) =>
          itemIDMap[itemID]?.collectionIDs?.map(
            (collectionID) => `${collectionID}-${itemIDMap[itemID].libraryID}`,
          ) ?? [],
      ),
    ).filter((v): v is string => v !== null);
    const collectionSet = this.#conn.zotero
      .prepare(Collections)
      .query(
        collectionIDs.map((v) => v.split("-").map((v) => +v)) as IDLibID[],
      );

    return itemIDs.reduce((rec, [itemID, libraryID]) => {
      if (!itemID) return rec;
      const citekey = citekeyMap[itemID];
      if (!citekey) {
        log.warn(`Citekey: No item found for itemID ${itemID}`, citekey);
      }
      const fields = itemFields[itemID].reduce((fields, field) => {
        let { value } = field;
        if (field.fieldName === "date") {
          value = multipartToSQL(value as string);
        }
        (fields[field.fieldName] ??= []).push(value);
        return fields;
      }, {} as Record<string, unknown[]>);

      const { collectionIDs, ...data } = itemIDMap[itemID],
        collections = collectionIDs
          .map((id) => collectionSet.get(id))
          .filter((v): v is Collection => v !== undefined);
      const itemObject: RegularItemInfoBase = {
        ...data,
        libraryID,
        groupID: this.#conn.groupOf(libraryID),
        itemID,
        creators: creators[itemID],
        collections,
        citekey: citekeyMap[itemID],
        ...fields,
        dateAccessed: isWithAccessDate(fields)
          ? stringToDate(fields.accessDate[0])
          : null,
      };
      rec[itemID] = itemObject as RegularItemInfo;
      return rec;
    }, {} as Record<number, RegularItemInfo>);
  }
}

function isWithAccessDate(item: unknown): item is { accessDate: [string] } {
  const _item = item as { accessDate: unknown };
  return (
    Array.isArray(_item.accessDate) &&
    _item.accessDate.length === 1 &&
    typeof _item.accessDate[0] === "string"
  );
}

/**
 * convert a `YYYY-MM-DD HH:MM:SS` to a date object
 */
function stringToDate(dateString: string): Date | null {
  const isoDateString = dateString.replace(" ", "T") + "Z";
  try {
    return new Date(isoDateString);
  } catch (error) {
    return null;
  }
}
