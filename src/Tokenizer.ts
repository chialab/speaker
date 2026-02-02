import * as abbrs from './abbreviations/index';

/**
 * Token types.
 */
export const TokenType = {
    BOUNDARY: 1,
    SENTENCE: 2,
    BLOCK: 4,
    ALL: 7,
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

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
    voiceType: string | null;
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
    type: 1;
}

/**
 * Sentence token interface.
 */
export interface SentenceToken extends GroupToken<BoundaryToken> {
    type: 2;
}

/**
 * Block token interface.
 */
export interface BlockToken extends GroupToken<BoundaryToken> {
    type: 4;
}

export type CheckFunction = (node: Node) => boolean;

export type CheckRule = string | CheckFunction | CheckRule[];

/**
 * Collapse all ignore rules to a single function.
 * @param rules Given rules.
 * @param deep Whether to check deeply or not.
 * @returns A function that returns true if the node has to be ignored.
 */
function createCheckFunction(rules?: CheckRule, deep = false): CheckFunction {
    if (Array.isArray(rules)) {
        const fns = rules.map((rule) => createCheckFunction(rule, deep));
        return (node) => fns.some((fn) => fn(node));
    }
    if (typeof rules === 'string') {
        return (node) => {
            const containerElement = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
            if (!containerElement) {
                return true;
            }
            if (deep) {
                return containerElement.closest(rules) !== null;
            }
            return containerElement.matches(rules);
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
    const style = getComputedStyle(element);
    const position = style.position;
    let value: string | undefined;
    switch (position) {
        case 'static':
            value = style.display;
            break;
        default:
            // absolute, fixed, relative, sticky positioned elements are always computed as blocks
            value = (element as HTMLElement).style?.display;
            break;
    }
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
    ].includes(value);
}

/**
 * Check if a text chunk ends with a notable abbreviation.
 * @param text The text to check.
 * @param abbreviations The list of abbreviations to check against.
 * @returns True if the text ends with a notable abbreviation.
 */
function endsWithNotableAbbreviation(text: string, abbreviations: string[]): boolean {
    const normalizedText = text.trim().toLowerCase();
    for (const abbr of abbreviations) {
        const normalizedAbbr = abbr.toLowerCase();
        if (normalizedText === normalizedAbbr || normalizedText.endsWith(` ${normalizedAbbr}`)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if node is hidden.
 * @param node The node to check.
 * @returns True if the node is hidden.
 */
function checkDisplayNone(node: Node) {
    const containerElement = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    if (!containerElement) {
        return true;
    }

    if (containerElement.parentElement) {
        const style = getComputedStyle(containerElement);
        if (style.display === 'contents') {
            return checkDisplayNone(containerElement.parentElement);
        }
    }

    return containerElement.offsetParent === null;
}

/**
 * Get the current node lang.
 * @param node The node.
 * @param root The root element of the document to speak.
 * @returns The language or null.
 */
function getNodeLang(node: Node, root?: string | Element) {
    const selector = '[lang]';
    const parentElement = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!parentElement) {
        return null;
    }

    let rootElement =
        root == null
            ? parentElement.ownerDocument.documentElement
            : typeof root === 'string'
              ? parentElement.closest(root)
              : root;
    if (!rootElement) {
        // eslint-disable-next-line no-console
        console.warn('Root element not found, using document element as root.');
        rootElement = parentElement.ownerDocument.documentElement;
    }

    const langElement = parentElement.closest(selector);
    if (!langElement || !rootElement.contains(langElement)) {
        return null;
    }

    return langElement.getAttribute('lang') ?? null;
}

/**
 * Get the current text node voice.
 * @param node The text node.
 * @returns The voice name or null.
 */
function getNodeVoice(node: Node) {
    return node.parentElement ? getComputedStyle(node.parentElement).getPropertyValue('--voice') || null : null;
}

/**
 * Get the current text node voice type.
 * @param node The text node.
 * @returns The voice name or null.
 */
function getNodeVoiceType(node: Node) {
    return node.parentElement ? getComputedStyle(node.parentElement).getPropertyValue('--voice-type') || null : null;
}

/**
 * Tokenizer options.
 */
export interface TokenizerOptions {
    range?: Range;
    ignore?: CheckRule;
    blocks?: CheckRule;
    inputs?: CheckRule;
    altAttributes?: string[];
    root?: string | Element;
    sentenceEndRegexp?: RegExp;
    notableAbbreviations?: Record<string, string[]>;
}

/**
 * TokenWalker class to walk through tokens.
 */
export class TokenWalker {
    private iterator: Generator<SentenceToken | BlockToken | BoundaryToken, void, unknown>;
    private tokens: (SentenceToken | BlockToken | BoundaryToken)[] = [];

    currentToken: SentenceToken | BlockToken | BoundaryToken | null = null;

    /**
     * Create a new TokenWalker instance.
     * @param element The element to tokenize.
     * @param whatToShow A unsigned long representing a bitmask created by combining the constant properties of TokenType.
     * @param options A list of configurations for the tokenizer.
     */
    constructor(element: Element, whatToShow: TokenType, options: TokenizerOptions) {
        this.iterator = tokenize(element, whatToShow, options);
    }

    /**
     * Walk to first boundary token of the previous group.
     */
    previousGroup(type: TokenType): void {
        if (!this.currentToken) {
            return;
        }

        const { currentToken } = this;
        let index = this.tokens.indexOf(currentToken);
        if (index === -1) {
            return;
        }

        while (index > 0) {
            const token = this.tokens[index--];
            if (token.type === type) {
                while (true) {
                    const nextToken = this.tokens[++index];
                    if (nextToken === currentToken) {
                        index = this.tokens.indexOf(token) - 1;
                        break;
                    }
                    if (nextToken.type === TokenType.BOUNDARY) {
                        this.currentToken = this.tokens[index - 1];
                        return;
                    }
                }
            }
        }
        this.currentToken = null;
    }

    /**
     * Walk to the next boundary token of the next group.
     */
    nextGroup(type: TokenType): void {
        if (!this.currentToken) {
            return;
        }

        const { currentToken } = this;
        let index = this.tokens.indexOf(currentToken);
        if (index === -1) {
            return;
        }

        while (index < this.tokens.length - 1) {
            const token = this.tokens[index++];
            if (token.type === type) {
                this.currentToken = token;
                let nextToken = this.nextToken();
                while (nextToken) {
                    if (nextToken === currentToken) {
                        break;
                    }
                    if (nextToken.type === TokenType.BOUNDARY) {
                        const index = this.tokens.indexOf(nextToken);
                        this.currentToken = this.tokens[index - 1];
                        return;
                    }
                    nextToken = this.nextToken();
                }
            }
        }
        this.currentToken = this.tokens[this.tokens.length - 1] || null;
    }

    /**
     * Get the next token in the sequence.
     * @returns The next token in the sequence or null if there are no more tokens.
     */
    nextToken(): SentenceToken | BlockToken | BoundaryToken | null {
        if (this.currentToken) {
            const index = this.tokens.indexOf(this.currentToken);
            if (index !== -1 && index < this.tokens.length - 1) {
                this.currentToken = this.tokens[index + 1];
                return this.currentToken;
            }
        }
        if (!this.currentToken && this.tokens.length > 0) {
            this.currentToken = this.tokens[0];
            return this.tokens[0];
        }

        const result = this.iterator.next();
        if (result.done) {
            return null;
        }
        const token = result.value;
        this.tokens.push(token);
        this.currentToken = token;
        return token;
    }
}

/**
 * Tokenize an element by boundaries, sentences and blocks.
 * @param element The element to tokenize.
 * @param whatToShow A unsigned long representing a bitmask created by combining the constant properties of TokenType.
 * @param options A list of configurations for the tokenizer.
 */
export function* tokenize(
    element: Element,
    whatToShow: TokenType = TokenType.ALL,
    options: TokenizerOptions = {}
): Generator<SentenceToken | BlockToken | BoundaryToken, void, unknown> {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const altAttributes = options.altAttributes ?? ['alt', 'aria-label', 'aria-labelledby'];
    const ignore = createCheckFunction(options.ignore ?? ['[aria-hidden]'], true);
    const isBlock = createCheckFunction(
        options.blocks ?? [
            'p',
            'div',
            'section',
            'article',
            'header',
            'footer',
            'aside',
            'nav',
            'main',
            'li',
            'td',
            'th',
            'blockquote',
            'pre',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'pre',
        ]
    );
    const isInput = createCheckFunction(
        options.inputs ?? [
            'textarea',
            'select',
            'input[type="text"]',
            'input[type="search"]',
            'input[type="email"]',
            'input[type="url"]',
            'input[type="tel"]',
        ]
    );
    const root = options.root;
    const range = options.range;
    const sentenceEndRegexp = options.sentenceEndRegexp ?? /[.!?:](\s+|$)/;
    const periodIsDelimiter = sentenceEndRegexp.test('.');
    const collectBoundaries = !!(whatToShow & TokenType.BOUNDARY);
    const collectSentences = !!(whatToShow & TokenType.SENTENCE);
    const collectBlocks = !!(whatToShow & TokenType.BLOCK);

    let chunk = '';

    let startNode: Text | null = null;
    let endNode: Text | null = null;

    let currentBlockTokens: BoundaryToken[] = [];
    let currentSentenceTokens: BoundaryToken[] = [];

    let startOffset = 0;
    let endOffset = 0;

    let currentBlock: Element | null = null;
    let currentNode: Node | null = null;
    // eslint-disable-next-line no-cond-assign
    tokenIterator: while ((currentNode = walker.nextNode())) {
        if (range) {
            if (
                (range.startContainer.compareDocumentPosition(currentNode) & Node.DOCUMENT_POSITION_PRECEDING) ===
                Node.DOCUMENT_POSITION_PRECEDING
            ) {
                continue;
            }
            if (
                (range.endContainer.compareDocumentPosition(currentNode) & Node.DOCUMENT_POSITION_FOLLOWING) ===
                Node.DOCUMENT_POSITION_FOLLOWING
            ) {
                continue;
            }
        }

        if (ignore(currentNode) || checkDisplayNone(currentNode)) {
            continue;
        }

        const isElement = currentNode.nodeType === Node.ELEMENT_NODE;

        let textValue = '';
        if (isInput(currentNode)) {
            if ((currentNode as HTMLElement).tagName === 'SELECT') {
                const options = (currentNode as HTMLSelectElement).querySelectorAll('option:checked');
                textValue = Array.from(options)
                    .map((option) => option.textContent || '')
                    .join(' ');
            } else {
                textValue = (currentNode as HTMLInputElement).value;
            }
        } else if (!currentNode.textContent?.trim()) {
            for (let i = 0; i < altAttributes.length; i++) {
                const attrName = altAttributes[i];
                if (isElement && (currentNode as Element).hasAttribute(attrName)) {
                    if (attrName === 'aria-labelledby') {
                        const selector = (currentNode as Element).getAttribute(attrName) || '';
                        if (selector) {
                            const label = currentNode.ownerDocument?.querySelector(`[id="${selector}"]`);
                            if (label) {
                                textValue = label.textContent || '';
                            }
                        }
                    } else {
                        textValue = (currentNode as Element).getAttribute(attrName) || '';
                    }
                    break;
                }
                const closestElement = (isElement ? (currentNode as Element) : currentNode.parentElement)?.closest(
                    `[${attrName}]`
                );
                if (closestElement && element.contains(closestElement)) {
                    continue tokenIterator;
                }
            }
        }

        if (isElement) {
            const isBlockElement = isBlock(currentNode) || checkDisplayBlock(currentNode as Element);
            if (isBlockElement || textValue) {
                if (chunk && endNode) {
                    startNode = startNode ?? endNode;

                    const token: BoundaryToken = {
                        type: TokenType.BOUNDARY,
                        text: chunk,
                        startNode,
                        startOffset,
                        endNode,
                        endOffset: (endNode.textContent || '').length,
                        lang: getNodeLang(startNode, root),
                        voiceType: getNodeVoiceType(startNode),
                        voice: getNodeVoice(startNode),
                    };

                    if (collectBoundaries) {
                        yield token;
                    }
                    if (collectSentences) {
                        currentSentenceTokens.push(token);
                    }
                    if (collectBlocks) {
                        currentBlockTokens.push(token);
                    }

                    chunk = '';
                    startNode = null;
                    startOffset = 0;
                }

                if (isBlockElement) {
                    currentBlock = currentNode as Element;

                    if (collectSentences && currentSentenceTokens.length) {
                        yield {
                            type: TokenType.SENTENCE,
                            startNode: currentSentenceTokens[0].startNode,
                            startOffset: currentSentenceTokens[0].startOffset,
                            endNode: currentSentenceTokens[currentSentenceTokens.length - 1].endNode,
                            endOffset: currentSentenceTokens[currentSentenceTokens.length - 1].endOffset,
                            tokens: currentSentenceTokens,
                        } as SentenceToken;
                        currentSentenceTokens = [];
                    }
                    if (collectBlocks && currentBlockTokens.length) {
                        yield {
                            type: TokenType.BLOCK,
                            startNode: currentBlockTokens[0].startNode,
                            startOffset: currentBlockTokens[0].startOffset,
                            endNode: currentBlockTokens[currentBlockTokens.length - 1].endNode,
                            endOffset: currentBlockTokens[currentBlockTokens.length - 1].endOffset,
                            tokens: currentBlockTokens,
                        } as BlockToken;
                        currentBlockTokens = [];
                    }
                }

                if (textValue) {
                    const range = new Range();
                    range.selectNode(currentNode);
                    const token: BoundaryToken = {
                        type: TokenType.BOUNDARY,
                        text: textValue,
                        startNode: range.startContainer,
                        startOffset: range.startOffset,
                        endNode: range.endContainer,
                        endOffset: range.endOffset,
                        lang: getNodeLang(currentNode, root),
                        voiceType: getNodeVoiceType(currentNode),
                        voice: getNodeVoice(currentNode),
                    };

                    if (collectBoundaries) {
                        yield token;
                    }
                    if (collectSentences) {
                        currentSentenceTokens.push(token);
                    }
                    if (collectBlocks) {
                        currentBlockTokens.push(token);
                    }

                    if (isBlockElement) {
                        if (collectSentences && currentSentenceTokens.length) {
                            yield {
                                type: TokenType.SENTENCE,
                                startNode: currentSentenceTokens[0].startNode,
                                startOffset: currentSentenceTokens[0].startOffset,
                                endNode: currentSentenceTokens[currentSentenceTokens.length - 1].endNode,
                                endOffset: currentSentenceTokens[currentSentenceTokens.length - 1].endOffset,
                                tokens: currentSentenceTokens,
                            } as SentenceToken;
                            currentSentenceTokens = [];
                        }
                        if (collectBlocks && currentBlockTokens.length) {
                            yield {
                                type: TokenType.BLOCK,
                                startNode: currentBlockTokens[0].startNode,
                                startOffset: currentBlockTokens[0].startOffset,
                                endNode: currentBlockTokens[currentBlockTokens.length - 1].endNode,
                                endOffset: currentBlockTokens[currentBlockTokens.length - 1].endOffset,
                                tokens: currentBlockTokens,
                            } as BlockToken;
                            currentBlockTokens = [];
                        }
                    }
                }
            }

            continue;
        }

        if (currentBlock && !currentBlock.contains(currentNode)) {
            currentBlock = null;

            if (chunk && endNode) {
                startNode = startNode ?? endNode;

                const token: BoundaryToken = {
                    type: TokenType.BOUNDARY,
                    text: chunk,
                    startNode,
                    startOffset,
                    endNode,
                    endOffset: (endNode.textContent || '').length,
                    lang: getNodeLang(startNode, root),
                    voiceType: getNodeVoiceType(startNode),
                    voice: getNodeVoice(startNode),
                };

                if (collectBoundaries) {
                    yield token;
                }
                if (collectSentences) {
                    currentSentenceTokens.push(token);
                    yield {
                        type: TokenType.SENTENCE,
                        startNode: currentSentenceTokens[0].startNode,
                        startOffset: currentSentenceTokens[0].startOffset,
                        endNode: currentSentenceTokens[currentSentenceTokens.length - 1].endNode,
                        endOffset: currentSentenceTokens[currentSentenceTokens.length - 1].endOffset,
                        tokens: currentSentenceTokens,
                    } as SentenceToken;
                    currentSentenceTokens = [];
                }
                if (collectBlocks) {
                    currentBlockTokens.push(token);
                    yield {
                        type: TokenType.BLOCK,
                        startNode: currentBlockTokens[0].startNode,
                        startOffset: currentBlockTokens[0].startOffset,
                        endNode: currentBlockTokens[currentBlockTokens.length - 1].endNode,
                        endOffset: currentBlockTokens[currentBlockTokens.length - 1].endOffset,
                        tokens: currentBlockTokens,
                    } as BlockToken;
                    currentBlockTokens = [];
                }

                chunk = '';
                startNode = null;
                startOffset = 0;
            }
        }

        const text = currentNode.textContent || '';
        endNode = currentNode as Text;
        let currentStartOffset = 0;
        const regex = /\s+/g;
        let match: RegExpExecArray | null = null;
        // eslint-disable-next-line no-cond-assign
        while ((match = regex.exec(text))) {
            startNode = startNode ?? endNode;
            endOffset = match.index;
            const currentChunk = text.substring(currentStartOffset, match.index);
            if (!chunk && !currentChunk.trim()) {
                startNode = endNode;
                startOffset = currentStartOffset = endOffset + match[0].length;
                continue;
            }

            if (range && range.startContainer === startNode) {
                if (endOffset < range.startOffset) {
                    chunk = '';
                    startNode = endNode;
                    startOffset = currentStartOffset = endOffset + match[0].length;
                    continue;
                }
            }

            if (range && range.endContainer === endNode) {
                if (currentStartOffset > range.endOffset) {
                    chunk = '';
                    startNode = endNode;
                    startOffset = currentStartOffset = endOffset + match[0].length;
                    continue;
                }
            }

            chunk += currentChunk;

            const lang = getNodeLang(startNode, root);
            const token: BoundaryToken = {
                type: TokenType.BOUNDARY,
                text: chunk,
                startNode,
                startOffset,
                endNode,
                endOffset,
                lang,
                voiceType: getNodeVoiceType(startNode),
                voice: getNodeVoice(startNode),
            };
            if (collectBoundaries) {
                yield token;
            }
            if (collectSentences) {
                currentSentenceTokens.push(token);
                // If the pattern includes period and the chunk ends with a notable abbreviation, don't split
                const matchesSentenceEnd = sentenceEndRegexp.test(chunk);
                const notableAbbreviations = (() => {
                    const tokenLang = lang?.toLowerCase() || 'en';
                    const shortLang = tokenLang.split(/[-_]/)[0];

                    return (
                        options.notableAbbreviations?.[tokenLang] ??
                        options.notableAbbreviations?.[shortLang] ??
                        abbrs[shortLang as keyof typeof abbrs] ??
                        abbrs.en
                    );
                })();
                const endsWithAbbreviation =
                    periodIsDelimiter && endsWithNotableAbbreviation(chunk, notableAbbreviations);

                if (matchesSentenceEnd && !endsWithAbbreviation) {
                    yield {
                        type: TokenType.SENTENCE,
                        startNode: currentSentenceTokens[0].startNode,
                        startOffset: currentSentenceTokens[0].startOffset,
                        endNode: token.endNode,
                        endOffset: token.endOffset,
                        tokens: currentSentenceTokens,
                    } as SentenceToken;

                    currentSentenceTokens = [];
                }
            }
            if (collectBlocks) {
                currentBlockTokens.push(token);
            }

            chunk = '';
            startNode = endNode;
            startOffset = currentStartOffset = endOffset + match[0].length;
        }

        chunk += text.substring(currentStartOffset);
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
            lang: getNodeLang(startNode, root),
            voiceType: getNodeVoiceType(startNode),
            voice: getNodeVoice(startNode),
        };
        if (collectBoundaries) {
            yield token;
        }
        if (collectSentences) {
            currentSentenceTokens.push(token);
        }
        if (collectBlocks) {
            currentBlockTokens.push(token);
        }
    }

    if (collectSentences && currentSentenceTokens.length) {
        yield {
            type: TokenType.SENTENCE,
            startNode: currentSentenceTokens[0].startNode,
            startOffset: currentSentenceTokens[0].startOffset,
            endNode: currentSentenceTokens[currentSentenceTokens.length - 1].endNode,
            endOffset: currentSentenceTokens[currentSentenceTokens.length - 1].endOffset,
            tokens: currentSentenceTokens,
        } as SentenceToken;
    }
    if (collectBlocks && currentBlockTokens.length) {
        yield {
            type: TokenType.BLOCK,
            startNode: currentBlockTokens[0].startNode,
            startOffset: currentBlockTokens[0].startOffset,
            endNode: currentBlockTokens[currentBlockTokens.length - 1].endNode,
            endOffset: currentBlockTokens[currentBlockTokens.length - 1].endOffset,
            tokens: currentBlockTokens,
        } as BlockToken;
    }
}
