/**
 * Token types.
 */
export enum TokenType {
    BOUNDARY = 1,
    SENTENCE = 2,
    BLOCK = 4,
    ALL = 7,
}

/**
 * The base token interface.
 */
export interface Token {
    startNode: Node;
    startOffset: number;
    endNode: Node;
    endOffset: number;
}

/**
 * Text token interface.
 */
export interface TextToken extends Token {
    text: string;
    lang: string | null;
    voice: string | null;
}

/**
 * Tokens group interface.
 */
export interface GroupToken<T extends Token> extends Token {
    tokens: T[];
}

/**
 * Boundary token interface.
 */
export interface BoundaryToken extends TextToken {
    type: TokenType.BOUNDARY;
}

/**
 * Sentence token interface.
 */
export interface SentenceToken extends GroupToken<BoundaryToken> {
    type: TokenType.SENTENCE;
}

/**
 * Block token interface.
 */
export interface BlockToken extends GroupToken<BoundaryToken> {
    type: TokenType.BLOCK;
}

/**
 * Create a range that includes all given tokens.
 * @param tokens Tokens list.
 * @returns A selection range.
 */
export function createRange(...tokens: Token[]) {
    const range = (tokens[0].startNode.ownerDocument as Document).createRange();
    range.setStart(tokens[0].startNode, tokens[0].startOffset);
    range.setEnd(tokens[tokens.length - 1].endNode, tokens[tokens.length - 1].endOffset);
    return range;
}

export type CheckFunction = (node: Node) => boolean;

export type CheckRule = string | CheckFunction | CheckRule[];

/**
 * Collapse all ignore rules to a single function.
 * @param rules Given rules.
 * @returns A function that returns true if the node has to be ignored.
 */
function createCheckFunction(rules?: CheckRule): CheckFunction {
    if (Array.isArray(rules)) {
        const fns = rules.map(createCheckFunction);
        return (node) => fns.some((fn) => fn(node));
    }
    if (typeof rules === 'string') {
        return (node) => {
            const parentElement = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
            if (!parentElement) {
                return true;
            }
            return parentElement.closest(rules) !== null;
        };
    }
    if (typeof rules === 'function') {
        return rules;
    }
    return () => false;
}

/**
 * Check if an element is a block.
 * @param element The element to check.
 * @returns True if the element has display block.
 */
function checkDisplayBlock(element: Element) {
    return [
        'block',
        'flex',
        'grid',
        'table',
        'table-caption',
        'table-column-group',
        'table-header-group',
        'table-footer-group',
        'table-row-group',
        'table-cell',
        'table-column',
        'table-row',
    ].includes(getComputedStyle(element).display);
}

/**
 * Get the current text node lang.
 * @param node The text node.
 * @returns The language or null.
 */
function getNodeLang(node: Node) {
    return node.parentElement?.closest('[lang]')?.getAttribute('lang') ?? null;
}

/**
 * Get the current text node voice.
 * @param node The text node.
 * @returns The voice name or null.
 */
function getNodeVoice(node: Node) {
    return node.parentElement ? (getComputedStyle(node.parentElement).getPropertyValue('--voice') || null) : null;
}

/**
 * Tokenizer options.
 */
export interface TokenizerOptions {
    ignore?: CheckRule;
    blocks?: CheckRule;
}

/**
 * Tokenize an element by boundaries, sentences and blocks.
 * @param element The element to tokenize.
 * @param whatToShow A unsigned long representing a bitmask created by combining the constant properties of TokenType.
 * @param options A list of configurations for the tokenizer.
 */
export function* tokenize(element: Element, whatToShow = TokenType.ALL, options: TokenizerOptions = {}) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const ignore = createCheckFunction(options.ignore);
    const isBlock = createCheckFunction(options.blocks);
    const collectBoundaries = !!(whatToShow & TokenType.BOUNDARY);
    const collectSentences = !!(whatToShow & TokenType.SENTENCE);
    const collectBlocks = !!(whatToShow & TokenType.BLOCK);

    let chunk = '';

    let startNode: Text | null = null;
    let endNode: Text | null = null;

    let currentBlock: BoundaryToken[] = [];
    let currentSentence: BoundaryToken[] = [];

    let startOffset = 0;
    let endOffset = 0;

    let currentNode: Node | null = null;
    // eslint-disable-next-line no-cond-assign
    while (currentNode = walker.nextNode()) {
        if (ignore(currentNode)) {
            continue;
        }

        if (currentNode.nodeType === Node.ELEMENT_NODE) {
            if (isBlock(currentNode) || checkDisplayBlock(currentNode as Element)) {
                if (chunk && endNode) {
                    startNode = startNode ?? endNode;

                    const token: BoundaryToken = {
                        type: TokenType.BOUNDARY,
                        text: chunk,
                        startNode,
                        startOffset,
                        endNode,
                        endOffset: (endNode.textContent || '').length,
                        lang: getNodeLang(startNode),
                        voice: getNodeVoice(startNode),
                    };

                    if (collectBoundaries) {
                        yield token;
                    }
                    if (collectSentences) {
                        currentSentence.push(token);
                    }
                    if (collectBlocks) {
                        currentBlock.push(token);
                    }

                    chunk = '';
                    startNode = null;
                    startOffset = 0;
                }

                if (collectSentences && currentSentence.length) {
                    yield {
                        type: TokenType.SENTENCE,
                        startNode: currentSentence[0].startNode,
                        startOffset: currentSentence[0].startOffset,
                        endNode: currentSentence[currentSentence.length - 1].endNode,
                        endOffset: currentSentence[currentSentence.length - 1].endOffset,
                        tokens: currentSentence,
                    } as SentenceToken;
                    currentSentence = [];
                }
                if (collectBlocks && currentBlock.length) {
                    yield {
                        type: TokenType.BLOCK,
                        startNode: currentBlock[0].startNode,
                        startOffset: currentBlock[0].startOffset,
                        endNode: currentBlock[currentBlock.length - 1].endNode,
                        endOffset: currentBlock[currentBlock.length - 1].endOffset,
                        tokens: currentBlock,
                    } as BlockToken;
                    currentBlock = [];
                }
            }

            continue;
        }

        const text = currentNode.textContent || '';
        if (!chunk && !text.trim()) {
            continue;
        }

        endNode = currentNode as Text;
        let currentStartOffset = 0;

        const regex = chunk ? /\s+/g : /.\s+/g;
        let match;
        // eslint-disable-next-line no-cond-assign
        while (match = regex.exec(text)) {
            startNode = startNode ?? endNode;
            endOffset = match.index + 1;
            chunk += text.substring(currentStartOffset, endOffset);

            const token: BoundaryToken = {
                type: TokenType.BOUNDARY,
                text: chunk,
                startNode,
                startOffset,
                endNode,
                endOffset,
                lang: getNodeLang(startNode),
                voice: getNodeVoice(startNode),
            };
            if (collectBoundaries) {
                yield token;
            }
            if (collectSentences) {
                currentSentence.push(token);
                if (/[.!?](\s+|$)/.test(chunk)) {
                    yield {
                        type: TokenType.SENTENCE,
                        startNode: currentSentence[0].startNode,
                        startOffset: currentSentence[0].startOffset,
                        endNode: token.endNode,
                        endOffset: token.endOffset,
                        tokens: currentSentence,
                    } as SentenceToken;

                    currentSentence = [];
                }
            }
            if (collectBlocks) {
                currentBlock.push(token);
            }

            chunk = '';
            startNode = endNode;
            startOffset = currentStartOffset = endOffset + match[0].length - 1;
        }

        chunk += text.substring(startOffset);
        if (!chunk) {
            chunk = '';
            startNode = null;
            startOffset = 0;
        } else {
            startNode = startNode ?? endNode;
        }
    }

    if (chunk && endNode) {
        startNode = startNode ?? endNode;

        const token: BoundaryToken = {
            type: TokenType.BOUNDARY,
            text: chunk,
            startNode,
            startOffset,
            endNode,
            endOffset: (endNode.textContent || '').length,
            lang: getNodeLang(startNode),
            voice: getNodeVoice(startNode),
        };
        if (collectBoundaries) {
            yield token;
        }
        if (collectSentences) {
            currentSentence.push(token);
        }
        if (collectBlocks) {
            currentBlock.push(token);
        }
    }

    if (collectSentences && currentSentence.length) {
        yield {
            type: TokenType.SENTENCE,
            startNode: currentSentence[0].startNode,
            startOffset: currentSentence[0].startOffset,
            endNode: currentSentence[currentSentence.length - 1].endNode,
            endOffset: currentSentence[currentSentence.length - 1].endOffset,
            tokens: currentSentence,
        } as SentenceToken;
    }
    if (collectBlocks && currentBlock.length) {
        yield {
            type: TokenType.BLOCK,
            startNode: currentBlock[0].startNode,
            startOffset: currentBlock[0].startOffset,
            endNode: currentBlock[currentBlock.length - 1].endNode,
            endOffset: currentBlock[currentBlock.length - 1].endOffset,
            tokens: currentBlock,
        } as BlockToken;
    }
}