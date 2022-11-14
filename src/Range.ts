import type { Token } from './Tokenizer';

/**
 * Create a range that includes all given tokens.
 * @param tokens Tokens list.
 * @returns A selection range.
 */
export function createRange(...tokens: Token[]) {
    const range = new Range();
    range.setStart(tokens[0].startNode, tokens[0].startOffset);
    range.setEnd(tokens[tokens.length - 1].endNode, tokens[tokens.length - 1].endOffset);
    return range;
}

/**
 * Check if two ranges are equivalent.
 * @param range1 The first range.
 * @param range2 The second range.
 * @returns True if ranges are equivalent.
 */
export function compareRanges(range1: Range, range2: Range) {
    return range1.startContainer === range2.startContainer &&
        range1.startOffset === range2.startOffset &&
        range1.endContainer === range2.endContainer &&
        range1.endOffset === range2.endOffset;
}

/**
 * Get normalized range rects.
 * Sometimes browsers duplicate rectangles or create two split rectangles unnecessarily.
 * @param range The range instance.
 * @returns A normalized list of rects.
 */
export function getClientRects(range: Range) {
    const original = range.getClientRects();
    const rects: DOMRect[] = [];
    const collected: DOMRect[] = [];

    for (let i = 0; i < original.length; i++) {
        const rect = original[i];
        if (!rect.width || !rect.height) {
            // remove empty
            continue;
        }
        if (collected.find((r) => r.top === rect.top && r.left === rect.left && r.width === rect.width && r.height === rect.height)) {
            // remove duplicates
            continue;
        }

        collected.push(rect);

        const last = rects[rects.length - 1];
        if (!last || last.top !== rect.top || last.height !== rect.height || ((rect.left - (last.left + last.width)) > 1)) {
            rects.push(new DOMRect(rect.left, rect.top, rect.width, rect.height));
        } else {
            last.width += rect.width;
        }
    }

    return rects;
}
