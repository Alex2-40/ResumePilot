export type LayoutBlockKind =
  | "section-title"
  | "meta-row"
  | "paragraph"
  | "bullet"
  | "skill-line";

export type MeasuredLine = {
  index: number;
  top: number;
  bottom: number;
  height: number;
};

export type MeasuredBlock = {
  id: string;
  unitId: string;
  sectionKey: string;
  kind: LayoutBlockKind;
  keepTogether: boolean;
  top: number;
  bottom: number;
  height: number;
  lines: MeasuredLine[];
};

type RawLineRect = {
  top: number;
  bottom: number;
};

function normalizeLineRects(
  rects: DOMRect[],
  containerRect: DOMRect,
  fallbackBlockRect: DOMRect,
): MeasuredLine[] {
  if (rects.length === 0) {
    const top = Math.floor(fallbackBlockRect.top - containerRect.top);
    const bottom = Math.ceil(fallbackBlockRect.bottom - containerRect.top);

    return [
      {
        index: 0,
        top,
        bottom,
        height: bottom - top,
      },
    ];
  }

  const normalized: RawLineRect[] = rects
    .map((rect) => ({
      top: Math.floor(rect.top - containerRect.top),
      bottom: Math.ceil(rect.bottom - containerRect.top),
    }))
    .filter((rect) => rect.bottom - rect.top > 1)
    .sort((a, b) => a.top - b.top);

  const groups: RawLineRect[] = [];
  const LINE_GROUP_TOLERANCE_PX = 3;

  for (const rect of normalized) {
    const last = groups[groups.length - 1];

    if (!last) {
      groups.push({ ...rect });
      continue;
    }

    const verticallyOverlaps =
      rect.top <= last.bottom + LINE_GROUP_TOLERANCE_PX &&
      rect.bottom >= last.top - LINE_GROUP_TOLERANCE_PX;

    if (verticallyOverlaps) {
      last.top = Math.min(last.top, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
      continue;
    }

    groups.push({ ...rect });
  }

  return groups.map((group, index) => ({
    index,
    top: group.top,
    bottom: group.bottom,
    height: group.bottom - group.top,
  }));
}

function parseKeepTogether(value: string | undefined): boolean {
  return value === "true";
}

export function measureResumeBlocks(container: HTMLElement): MeasuredBlock[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-layout-id]"),
  );

  const containerRect = container.getBoundingClientRect();

  return nodes
    .map((node) => {
      const id = node.dataset.layoutId?.trim() ?? "";
      const unitId = node.dataset.layoutUnitId?.trim() ?? "";
      const sectionKey = node.dataset.layoutSection?.trim() ?? "";
      const kind = (node.dataset.layoutKind?.trim() ?? "paragraph") as LayoutBlockKind;
      const keepTogether = parseKeepTogether(node.dataset.keepTogether);

      const blockRect = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      range.detach?.();

      const lines = normalizeLineRects(rects, containerRect, blockRect);

      const top = Math.floor(blockRect.top - containerRect.top);
      const bottom = Math.ceil(blockRect.bottom - containerRect.top);

      return {
        id,
        unitId,
        sectionKey,
        kind,
        keepTogether,
        top,
        bottom,
        height: bottom - top,
        lines,
      };
    })
    .filter((block) => block.id && block.height > 1)
    .sort((a, b) => a.top - b.top);
}
