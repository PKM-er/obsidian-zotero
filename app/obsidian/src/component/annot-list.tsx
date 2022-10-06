import "./style.less";

import type { Annotation } from "@obzt/zotero-type";
import cls from "classnames";
import { useAtom, atom, useAtomValue, useSetAtom } from "jotai";
import { AnnotationPreview } from "./annot-preview";
import type { AnnotProps } from "./atoms/annotation";
import {
  selectedAnnotsAtom,
  annotsAtom,
  selectedItemsAtom,
  isCollapsedAtom,
} from "./atoms/annotation";
import { useIsSelectedAnnot } from "./atoms/derived";
import { manualRefreshAtom } from "./atoms/refresh";
import { weakAtomFamily } from "./atoms/utils";
import { useIconRef } from "./icon";

const annotAtomFamily = weakAtomFamily((annot: Annotation) => atom(annot));

const filterAtom = atom("all");

const filteredAtom = atom((get) => {
  const annots = get(annotsAtom);
  if (!annots) return null;
  const filter = get(filterAtom);
  const selected = get(selectedItemsAtom);
  if (filter === "all") return annots;
  else if (filter === "selected") {
    return get(selectedAnnotsAtom);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return annots.filter((annot) => !selected.has(annot.itemID!));
  }
});

const AnnotationList = ({ selectable = false }: { selectable?: boolean }) => {
  const annots = useAtomValue(filteredAtom);
  const isCollapsed = useAtomValue(isCollapsedAtom);
  return (
    <div className={cls("annot-list", { "is-collapsed": isCollapsed })}>
      {annots?.map((annot) => (
        <AnnotListItem
          selectable={selectable}
          annot={annot}
          key={annot.itemID}
        />
      ))}
    </div>
  );
};
export default AnnotationList;

export const CollapseButton = () => {
  const [isCollapsed, setCollapsed] = useAtom(isCollapsedAtom);
  const [ref] = useIconRef<HTMLButtonElement>(
    isCollapsed ? "chevrons-up-down" : "chevrons-down-up",
  );
  return (
    <button
      ref={ref}
      className="clickable-icon"
      onClick={() => setCollapsed((v) => !v)}
      aria-label={isCollapsed ? "Expand" : "Collapse"}
    />
  );
};

export const RefreshButton = () => {
  const refresh = useSetAtom(manualRefreshAtom);
  const [ref] = useIconRef<HTMLButtonElement>("refresh-ccw");
  return (
    <button
      ref={ref}
      className="clickable-icon"
      onClick={refresh}
      aria-label="Refresh Annotation List"
      aria-label-delay="50"
    />
  );
};

const AnnotListItem = ({
  annot,
  selectable,
}: {
  annot: Annotation;
  selectable: boolean;
}) => {
  const annotAtom = annotAtomFamily(annot);
  const { itemID } = useAtomValue(annotAtom);
  return itemID !== null ? (
    <div
      key={itemID}
      className={cls("annot-list-item")}
      role="menuitem"
      tabIndex={0}
    >
      {selectable && <SelectCheckbox annotAtom={annotAtom} />}
      <AnnotationPreview annotAtom={annotAtom} />
    </div>
  ) : null;
};

const SelectCheckbox = ({ annotAtom }: AnnotProps) => {
  const [selected, setSelected] = useIsSelectedAnnot(annotAtom);
  return <input type="checkbox" checked={selected} onChange={setSelected} />;
};
