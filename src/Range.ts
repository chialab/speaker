import type { Token } from './Tokenizer';

/**
 * Create a range that includes all given tokens.
 * @param tokens Tokens list.
 * @returns A selection range.
 */
export function createRange(...tokens: Token[]): Range {
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
export function compareRanges(range1: Range, range2: Range): boolean {
    return (
        range1.startContainer === range2.startContainer &&
        range1.startOffset === range2.startOffset &&
        range1.endContainer === range2.endContainer &&
        range1.endOffset === range2.endOffset
    );
}
