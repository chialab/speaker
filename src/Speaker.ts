import { Adapter } from './Adapter';
import { Emitter, type Event } from './Emitter';
import { createRange } from './Range';
import {
    type BlockToken,
    type BoundaryToken,
    type CheckRule,
    type SentenceToken,
    TokenType,
    TokenWalker,
} from './Tokenizer';
import { Utterance } from './Utterance';

/**
 * Speaker options.
 */
export interface SpeakerOptions {
    /**
     * The initial playback rate for the speaking.
     */
    rate: number;
    /**
     * The default language.
     */
    lang: string;
    /**
     * The root element of the document to speak.
     */
    root?: string | Element;
    /**
     * Ignore rules. Can be a selector, a list of selectors or a function.
     */
    ignore?: CheckRule;
    /**
     * List of attributes for alternative text.
     */
    altAttributes?: string[];
    /**
     * Regular expression for sentence ending detection.
     */
    sentenceEndRegexp?: RegExp;
    /**
     * List of notable abbreviations that should not be treated as sentence endings.
     * Only used when sentenceEndRegexp includes period as delimiter.
     */
    notableAbbreviations?: Record<string, string[]>;
}

/**
 * Speaker highlighter options.
 */
export interface HighlighterOptions {
    boundaries?: boolean;
    sentences?: boolean;
    blocks?: boolean;
}

/**
 * Get document language.
 * @returns A language string.
 */
function getLang() {
    if (typeof document !== 'undefined' && document.documentElement.lang) {
        return document.documentElement.lang;
    }

    if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language;
    }

    return 'en-US';
}

/**
 * Normalize language to RFC 5646 format.
 * @param language The string to normalize.
 * @returns Formatted language string.
 */
function normalizeLanguage(language: string) {
    const splitted = language.split(/[-_]/);
    splitted[0] = splitted[0].substring(0, 2).toLowerCase();
    if (splitted[1]) {
        splitted[1] = splitted[1].substring(0, 2).toUpperCase();
    }
    return splitted.join('-');
}

/**
 * Normalize voices.
 * @param voices A string of comma separated voices.
 * @returns Voices list.
 */
function normalizeVoices(voices: string) {
    if (!voices) {
        return '';
    }

    return voices
        .split(',')
        .map((chunk) => chunk.trim())
        .join(',');
}

export interface SpeakerStartEvent extends Event {
    data: undefined;
}

export interface SpeakerBoundaryEvent extends Event {
    data: {
        token: BoundaryToken;
        sentence: SentenceToken | null;
        block: BlockToken | null;
    };
}

export interface SpeakerEndEvent extends Event {
    data: undefined;
}

export interface SpeakerCancelEvent extends Event {
    data: undefined;
}

export interface SpeakerPlayEvent extends Event {
    data: undefined;
}

export interface SpeakerPauseEvent extends Event {
    data: undefined;
}

export interface SpeakerLoadingEvent extends Event {
    data: undefined;
}

export interface SpeakerErrorEvent extends Event {
    data: Error;
}

/**
 * A Text2Speech library which highlights words when an utterance is speaking.
 * It uses adapters for multiple implementations like native browser speech synthesis or ReadSpeaker.
 * It also uses the chunk method from the @chialab/text-helpers module for tokenization of the document.
 */
export class Speaker extends Emitter<{
    start: SpeakerStartEvent;
    boundary: SpeakerBoundaryEvent;
    end: SpeakerEndEvent;
    cancel: SpeakerCancelEvent;
    play: SpeakerPlayEvent;
    pause: SpeakerPauseEvent;
    loading: SpeakerLoadingEvent;
    error: SpeakerErrorEvent;
}> {
    #rate: number;
    #lang: string;
    #element: Element;
    #adapter: Adapter;
    #options: SpeakerOptions;
    #range: Range | null = null;
    #tokensWalker: TokenWalker | null = null;
    #currentBoundary: BoundaryToken | null = null;

    get rate(): number {
        return this.#rate;
    }

    get lang(): string {
        return this.#lang;
    }

    /**
     * Create a Speaker instance.
     * @param root The root element of the document to speak.
     * @param options A set of options for the library.
     */
    constructor(root: Element, options: Partial<SpeakerOptions> = {}) {
        super();

        this.#element = root;
        this.#adapter = new Adapter();
        this.#options = {
            rate: 1,
            ignore: '[aria-hidden]',
            altAttributes: ['aria-label', 'aria-labelledby', 'alt', 'data-mathml'],
            ...options,
            lang: normalizeLanguage(options.lang || getLang()),
        };
        this.#rate = this.#options.rate;
        this.#lang = this.#options.lang;
    }

    /**
     * Flag for active speech.
     */
    get active(): boolean {
        return this.#adapter.active;
    }

    /**
     * Flag for paused speech.
     */
    get paused(): boolean {
        return this.#adapter.paused;
    }

    /**
     * Cancel the current speech.
     */
    async cancel(): Promise<void> {
        if (!this.active) {
            throw 'missing active speech';
        }
        try {
            await this.#adapter.cancel();
            this.clear();
            await this.trigger('cancel');
        } catch {
            //
        }
    }

    /**
     * Start or resume a speech.
     * @param range A selection range of tokens to speech.
     */
    async play(range?: Range | null): Promise<void> {
        if (this.active && !range) {
            if (!this.paused) {
                return;
            }

            try {
                await this.#adapter.play();
                await this.trigger('play');
            } catch (err) {
                await this.trigger('error', err as Error);
            }

            return;
        }

        if (this.active) {
            await this.cancel();
        }

        this.#range = range || null;

        await this.trigger('loading');

        let played = false;
        let currentUtterance: Utterance | null = null;
        let sentences: SentenceToken[] = [];
        let boundaries: BoundaryToken[] = [];

        this.#tokensWalker = new TokenWalker(this.#element, TokenType.ALL, {
            range: range || undefined,
            ignore: this.#options.ignore,
            root: this.#options.root,
            altAttributes: this.#options.altAttributes,
            sentenceEndRegexp: this.#options.sentenceEndRegexp,
            notableAbbreviations: this.#options.notableAbbreviations,
        });

        let token: SentenceToken | BlockToken | BoundaryToken | null = null;
        while ((token = this.#tokensWalker.nextToken())) {
            switch (token.type) {
                case TokenType.BOUNDARY:
                    boundaries.push(token as BoundaryToken);
                    break;
                case TokenType.SENTENCE:
                    currentUtterance = null;
                    sentences.push(token);
                    break;
                case TokenType.BLOCK: {
                    const queue: Utterance[] = [];

                    for (let index = 0, len = token.tokens.length; index < len; index++) {
                        const childToken = token.tokens[index];
                        if (!boundaries.includes(childToken)) {
                            continue;
                        }
                        if (!this.#adapter.canSpeech(childToken)) {
                            continue;
                        }

                        const language = normalizeLanguage(childToken.lang || this.#lang);
                        const voices = normalizeVoices(childToken.voice || '') || null;

                        if (
                            !currentUtterance ||
                            currentUtterance.lang !== language ||
                            currentUtterance.voices !== voices
                        ) {
                            currentUtterance = new Utterance(this.#rate, language, childToken.voiceType, voices);
                            currentUtterance.on('boundary', (currentToken) => {
                                // a boundary had been met.
                                this.#currentBoundary = currentToken as BoundaryToken;
                                this.trigger('boundary', {
                                    token: currentToken,
                                    block: token as BlockToken,
                                    sentence:
                                        sentences.find((sentenceToken) =>
                                            sentenceToken.tokens.includes(currentToken)
                                        ) ?? null,
                                });
                            });
                            queue.push(currentUtterance);
                        }

                        if (currentUtterance.length || childToken.text.trim()) {
                            currentUtterance.addToken(childToken);
                        }
                    }

                    currentUtterance = null;

                    try {
                        if (!played) {
                            await this.trigger('loading');
                        }
                        const dfd = await this.#adapter.play(queue);
                        if (!played) {
                            await this.trigger('play');
                            played = true;
                        }

                        try {
                            await dfd.promise();
                        } catch {
                            this.clear();
                            await this.trigger('cancel');
                            return;
                        }
                    } catch (err) {
                        await this.trigger('error', (err as Error) || new Error('Unknown error'));
                        this.clear();
                        throw err;
                    }

                    sentences = [];
                    boundaries = [];

                    break;
                }
            }
        }

        this.clear();
        await this.trigger('end');
    }

    /**
     * Pause a speech.
     */
    async pause(): Promise<void> {
        if (!this.active) {
            throw 'missing active speech';
        }
        try {
            await this.#adapter.pause();
            await this.trigger('pause');
        } catch {
            //
        }
    }

    /**
     * Set rate. Stop and play again if running.
     * @param rate The rate value to set.
     */
    async setRate(rate: number): Promise<void> {
        this.#rate = rate;

        this.restart();
    }

    /**
     *  Stop and play again if speaking is active.
     */
    async restart(): Promise<void> {
        const active = this.active;
        const paused = this.paused;
        const range = this.#range;
        let cancelPromise = Promise.resolve();
        if (active) {
            cancelPromise = this.#adapter.cancel();
            this.clear();
        }

        await cancelPromise;

        if (active && !paused) {
            // restart the playback with the new rate.
            await this.play(range);
        }
    }

    /**
     * Rewind to the previous sentence or block.
     */
    async rewind(): Promise<void> {
        if (!this.active || !this.#tokensWalker) {
            throw 'missing active speech';
        }
        const boundary = this.#currentBoundary;
        this.#adapter.cancel(true);
        this.#tokensWalker.currentToken = boundary;
        this.#tokensWalker.previousGroup(TokenType.SENTENCE);
    }

    /**
     * Forward to the next sentence or block.
     */
    async forward(): Promise<void> {
        if (!this.active || !this.#tokensWalker) {
            throw 'missing active speech';
        }
        const boundary = this.#currentBoundary;
        this.#adapter.cancel(true);
        this.#tokensWalker.currentToken = boundary;
        this.#tokensWalker.nextGroup(TokenType.SENTENCE);
    }

    /**
     * Clear the status of the Speaker.
     */
    private clear() {
        this.#range = null;
        this.#tokensWalker = null;
        this.#currentBoundary = null;
    }

    /**
     * Create and handle hihglighter for current reading.
     * @param options Highlighter options.
     */
    setupHighlighter(options: HighlighterOptions = {}): void {
        if (typeof Highlight !== 'function' || typeof CSS !== 'object' || typeof CSS.highlights !== 'object') {
            // eslint-disable-next-line no-console
            console.warn('Missing support for Highlight API.');
            return;
        }
        const blocksHighlight = options.blocks ? new Highlight() : null;
        const sentencesHighlight = options.sentences ? new Highlight() : null;
        const boundariesHighlight = options.boundaries ? new Highlight() : null;

        if (blocksHighlight) {
            CSS.highlights.set('speaker-blocks-highlight', blocksHighlight);
        }
        if (sentencesHighlight) {
            CSS.highlights.set('speaker-sentences-highlight', sentencesHighlight);
        }
        if (boundariesHighlight) {
            CSS.highlights.set('speaker-boundaries-highlight', boundariesHighlight);
        }

        this.on('start', () => {
            boundariesHighlight?.clear();
            sentencesHighlight?.clear();
            blocksHighlight?.clear();
        });

        this.on('cancel', () => {
            boundariesHighlight?.clear();
            sentencesHighlight?.clear();
            blocksHighlight?.clear();
        });

        this.on('end', () => {
            boundariesHighlight?.clear();
            sentencesHighlight?.clear();
            blocksHighlight?.clear();
        });

        this.on('error', () => {
            boundariesHighlight?.clear();
            sentencesHighlight?.clear();
            blocksHighlight?.clear();
        });

        let lastBlock: BlockToken | null = null;
        let lastSentence: SentenceToken | null = null;
        this.on('boundary', ({ token, sentence, block }) => {
            if (lastBlock !== block) {
                blocksHighlight?.clear();
                sentencesHighlight?.clear();
                boundariesHighlight?.clear();
                if (block) {
                    blocksHighlight?.add(createRange(...block.tokens));
                }
                lastBlock = block;
            }
            if (lastSentence !== sentence) {
                sentencesHighlight?.clear();
                boundariesHighlight?.clear();
                if (sentence) {
                    sentencesHighlight?.add(createRange(...sentence.tokens));
                }
                lastSentence = sentence;
            }
            boundariesHighlight?.clear();
            boundariesHighlight?.add(createRange(token));
        });
    }
}
