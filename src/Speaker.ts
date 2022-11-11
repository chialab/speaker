import type { Event } from './Emitter';
import type { Token, BoundaryToken, BlockToken, SentenceToken, CheckRule } from './Tokenizer';
import type { HighlighterOptions } from './Highlighter';
import { Emitter } from './Emitter';
import { Utterance } from './Utterance';
import { Adapter } from './Adapter';
import { TokenType, tokenize } from './Tokenizer';
import { Highlighter } from './Highlighter';

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
     * Ignore rules. Can be a selector, a list of selectors or a function.
     */
    ignore?: CheckRule;
    /**
     * List of attributes for alternative text.
     */
     altAttributes?: string[];
}

/**
 * Speaker highlighter options.
 */
export interface SpeakerHighlighterOptions {
    boundaries?: boolean | HighlighterOptions;
    sentences?: boolean | HighlighterOptions;
    blocks?: boolean | HighlighterOptions;
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

/**
 * Create a range that includes all given tokens.
 * @param tokens Tokens list.
 * @returns A selection range.
 */
function createRange(...tokens: Token[]) {
    const range = new Range();
    range.setStart(tokens[0].startNode, tokens[0].startOffset);
    range.setEnd(tokens[tokens.length - 1].endNode, tokens[tokens.length - 1].endOffset);
    return range;
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
    #element: HTMLElement;
    #adapter: Adapter;
    #options: SpeakerOptions;
    #range: Range | null = null;

    get rate() {
        return this.#rate;
    }

    get lang() {
        return this.#lang;
    }

    /**
     * Create a Speaker instance.
     * @param root The root element of the document to speak.
     * @param options A set of options for the library.
     */
    constructor(root: HTMLElement, options: Partial<SpeakerOptions> = {}) {
        super();

        this.#element = root;
        this.#adapter = new Adapter();
        this.#options = {
            rate: 1,
            ignore: '[aria-hidden]',
            altAttributes: ['aria-label', 'aria-labelledby', 'alt', 'data-mathml'],
            ...options,
            lang: normalizeLanguage(options.lang ?? getLang()),
        };
        this.#rate = this.#options.rate;
        this.#lang = this.#options.lang;
    }

    /**
     * Flag for active speech.
     */
    get active() {
        return this.#adapter.active;
    }

    /**
     * Flag for paused speech.
     */
    get paused() {
        return this.#adapter.paused;
    }

    /**
     * Cancel the current speech.
     */
    async cancel() {
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
    async play(range?: Range | null) {
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

        const tokensIterator = tokenize(this.#element, TokenType.ALL, {
            range: range || undefined,
            ignore: this.#options.ignore,
            altAttributes: this.#options.altAttributes,
        });
        for (const token of tokensIterator) {
            switch (token.type) {
                case TokenType.SENTENCE:
                    currentUtterance = null;
                    sentences.push(token);
                    break;
                case TokenType.BLOCK: {
                    const queue: Utterance[] = [];

                    for (let index = 0, len = token.tokens.length; index < len; index++) {
                        const childToken = token.tokens[index];
                        if (!this.#adapter.canSpeech(childToken)) {
                            continue;
                        }

                        const language = normalizeLanguage(childToken.lang ?? this.#lang);
                        const voices = normalizeVoices(childToken.voice || '');

                        if (!currentUtterance || currentUtterance.lang !== language || currentUtterance.voices !== voices) {
                            currentUtterance = new Utterance(language, voices, this.#rate);
                            currentUtterance.on('boundary', (currentToken) => {
                                // a boundary had been met.
                                this.trigger('boundary', {
                                    token: currentToken,
                                    block: token,
                                    sentence: sentences.find((sentenceToken) => sentenceToken.tokens.includes(currentToken)) ?? null,
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
                            return;
                        }
                    } catch (err) {
                        await this.trigger('error', err as Error || new Error('Unknown error'));
                        this.clear();
                        throw err;
                    }

                    sentences = [];

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
    async pause() {
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
    async setRate(rate: number) {
        this.#rate = rate;

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
     * Clear the status of the Speaker.
     */
    private clear() {
        this.#range = null;
    }

    /**
     * Create and handle hihglighter for current reading.
     * @param options Highlighter options.
     */
    setupHighlighter(options: SpeakerHighlighterOptions = {}) {
        const boundaryHighlighter = options.boundaries !== false ? new Highlighter(options.boundaries === true ? {} : options.boundaries) : null;
        const sentenceHighlighter = options.sentences !== false ? new Highlighter(options.sentences === true ? {} : options.sentences) : null;
        const blockHighlighter = options.blocks ? new Highlighter(options.blocks === true ? {} : options.blocks) : null;

        this.on('cancel', () => {
            boundaryHighlighter?.setRange(null);
            sentenceHighlighter?.setRange(null);
            blockHighlighter?.setRange(null);
        });

        this.on('end', () => {
            boundaryHighlighter?.setRange(null);
            sentenceHighlighter?.setRange(null);
            blockHighlighter?.setRange(null);
        });

        this.on('error', () => {
            boundaryHighlighter?.setRange(null);
            sentenceHighlighter?.setRange(null);
            blockHighlighter?.setRange(null);
        });

        let lastBlock: BlockToken | null = null;
        let lastSentence: SentenceToken | null = null;
        this.on('boundary', ({ token, sentence, block }) => {
            if (lastBlock !== block) {
                blockHighlighter?.setRange(null);
                sentenceHighlighter?.setRange(null);
                boundaryHighlighter?.setRange(null);
                blockHighlighter?.setRange(block ? createRange(...block.tokens) : null);
                lastBlock = block;
            }
            if (lastSentence !== sentence) {
                sentenceHighlighter?.setRange(null);
                boundaryHighlighter?.setRange(null);
                sentenceHighlighter?.setRange(sentence ? createRange(...sentence.tokens) : null);
                lastSentence = sentence;
            }
            boundaryHighlighter?.setRange(createRange(token));
        });
    }
}
