import type { MeasuredBlock } from "./resume-measure";

export type ResumePageItem =
  | {
      type: "whole";
      blockId: string;
    }
  | {
      type: "split";
      blockId: string;
      lineStart: number;
      lineEnd: number;
    };

export type ResumePage = {
  pageIndex: number;
  items: ResumePageItem[];
};

type SplitBlockByLinesParams = {
  block: MeasuredBlock;
  remainingHeight: number;
  pageBodyHeight: number;
  minLinesAtPageEnd: number;
  minLinesAtNextPageStart: number;
};

function getChunkHeight(
  lines: MeasuredBlock["lines"],
  start: number,
  endExclusive: number,
): number {
  if (start >= endExclusive) {
    return 0;
  }

  return lines[endExclusive - 1].bottom - lines[start].top;
}

function estimateWholeBlockHeight(block: MeasuredBlock): number {
  return block.height;
}

export function estimateSplitItemHeight(item: ResumePageItem, block: MeasuredBlock): number {
  if (item.type === "whole") {
    return block.height;
  }

  const lines = block.lines.slice(item.lineStart, item.lineEnd + 1);
  if (lines.length === 0) {
    return 0;
  }

  const first = lines[0];
  const last = lines[lines.length - 1];
  return last.bottom - first.top;
}

export function splitBlockByLines({
  block,
  remainingHeight,
  pageBodyHeight,
  minLinesAtPageEnd,
  minLinesAtNextPageStart,
}: SplitBlockByLinesParams): ResumePageItem[] {
  const lines = block.lines;
  const chunks: ResumePageItem[] = [];

  if (lines.length === 0) {
    return [{ type: "whole", blockId: block.id }];
  }

  let start = 0;
  let available = remainingHeight;

  while (start < lines.length) {
    let endExclusive = start;

    while (endExclusive < lines.length) {
      const nextHeight = getChunkHeight(lines, start, endExclusive + 1);
      if (nextHeight > available) {
        break;
      }
      endExclusive += 1;
    }

    const fittedCount = endExclusive - start;
    const remainingCount = lines.length - endExclusive;

    if (chunks.length === 0 && fittedCount < minLinesAtPageEnd) {
      available = pageBodyHeight;
      continue;
    }

    if (remainingCount > 0 && remainingCount < minLinesAtNextPageStart) {
      const minimumCurrentChunkEnd = start + Math.max(1, minLinesAtPageEnd);
      const rebalanceEndExclusive = Math.max(
        minimumCurrentChunkEnd,
        lines.length - minLinesAtNextPageStart,
      );

      if (rebalanceEndExclusive < endExclusive) {
        endExclusive = rebalanceEndExclusive;
      }
    }

    if (endExclusive <= start) {
      endExclusive = Math.min(lines.length, start + 1);
    }

    chunks.push({
      type: "split",
      blockId: block.id,
      lineStart: start,
      lineEnd: endExclusive - 1,
    });

    start = endExclusive;
    available = pageBodyHeight;
  }

  return chunks;
}

type PaginateResumeParams = {
  blocks: MeasuredBlock[];
  pageBodyHeight: number;
  pageTopBuffer: number;
  pageBottomBuffer: number;
  minLinesAtPageEnd: number;
  minLinesAtNextPageStart: number;
};

export function paginateResume({
  blocks,
  pageBodyHeight,
  pageTopBuffer,
  pageBottomBuffer,
  minLinesAtPageEnd,
  minLinesAtNextPageStart,
}: PaginateResumeParams): ResumePage[] {
  const pages: ResumePage[] = [];
  const availablePageBodyHeight = pageBodyHeight - pageTopBuffer - pageBottomBuffer;
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  let currentPage: ResumePage = {
    pageIndex: 0,
    items: [],
  };

  let remaining = availablePageBodyHeight;

  const pushNewPage = () => {
    pages.push(currentPage);
    currentPage = {
      pageIndex: pages.length,
      items: [],
    };
    remaining = availablePageBodyHeight;
  };

  const moveTrailingSectionTitleWithNextBlock = (sectionKey: MeasuredBlock["sectionKey"]) => {
    const lastItem = currentPage.items[currentPage.items.length - 1];

    if (!lastItem || lastItem.type !== "whole") {
      return false;
    }

    const lastBlock = blockMap.get(lastItem.blockId);

    if (!lastBlock || lastBlock.kind !== "section-title" || lastBlock.sectionKey !== sectionKey) {
      return false;
    }

    currentPage.items.pop();
    remaining += lastBlock.height;

    if (currentPage.items.length > 0) {
      pages.push(currentPage);
      currentPage = {
        pageIndex: pages.length,
        items: [],
      };
    }

    remaining = availablePageBodyHeight;
    currentPage.items.push({
      type: "whole",
      blockId: lastBlock.id,
    });
    remaining -= lastBlock.height;

    return true;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1];
    const wholeHeight = estimateWholeBlockHeight(block);

    if (
      block.kind === "section-title" &&
      nextBlock &&
      wholeHeight + nextBlock.height > remaining &&
      currentPage.items.length > 0
    ) {
      pushNewPage();
    }

    if (wholeHeight <= remaining) {
      currentPage.items.push({
        type: "whole",
        blockId: block.id,
      });
      remaining -= wholeHeight;
      continue;
    }

    moveTrailingSectionTitleWithNextBlock(block.sectionKey);

    if (wholeHeight <= availablePageBodyHeight) {
      if (currentPage.items.length > 0) {
        pushNewPage();
      }

      currentPage.items.push({
        type: "whole",
        blockId: block.id,
      });
      remaining -= wholeHeight;
      continue;
    }

    const splitItems = splitBlockByLines({
      block,
      remainingHeight: remaining,
      pageBodyHeight: availablePageBodyHeight,
      minLinesAtPageEnd,
      minLinesAtNextPageStart,
    });

    for (const item of splitItems) {
      const chunkHeight = estimateSplitItemHeight(item, block);

      if (chunkHeight > remaining && currentPage.items.length > 0) {
        pushNewPage();
      }

      currentPage.items.push(item);
      remaining -= Math.min(chunkHeight, remaining);
    }
  }

  if (currentPage.items.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}
