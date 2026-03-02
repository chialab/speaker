import { Emitter, type Event } from './Emitter';
import type { BoundaryToken } from './Tokenizer';

/**
 * Map of comparison symbols (< and >) to spoken words per language.
 */
export type ComparisonSymbolsWords = Record<string, Record<string, string>>;

/**
 * Default regex to match comparison symbols (< and >) in the text.
 * @example /\s([<>])(?=\s|,|$)/g
 */
const DEFAULT_COMPARISON_SYMBOLS_REGEXP = /\s([<>])(?=\s|,|$)/g;

/**
 * Default comparison symbols words.
 * @example { en: { '<': 'less than', '>': 'greater than' } }
 */
const DEFAULT_COMPARISON_SYMBOLS_WORDS: ComparisonSymbolsWords = {
    en: { '<': 'less than', '>': 'greater than' },
    it: { '<': 'minore', '>': 'maggiore' },
    es: { '<': 'menor que', '>': 'mayor que' },
    fr: { '<': 'inférieur à', '>': 'supérieur à' },
    de: { '<': 'kleiner als', '>': 'größer als' },
    pt: { '<': 'menor que', '>': 'maior que' },
};

export interface UtteranceToken {
    /**
     * The token.
     */
    token: BoundaryToken;
    /**
     * The initial character index of the token in the sentence.
     */
    startOffset: number;
    /**
     * The final character index of the token in the sentence.
     */
    endOffset: number;
}

export interface UtteranceStartEvent extends Event {
    data: undefined;
}

export interface UtteranceBoundaryEvent extends Event {
    data: BoundaryToken;
}

export interface UtteranceEndEvent extends Event {
    data: undefined;
}

/**
 * A model class which represents an utterance.
 */
export class Utterance extends Emitter<{
    start: UtteranceStartEvent;
    boundary: UtteranceBoundaryEvent;
    end: UtteranceEndEvent;
}> {
    #tokens: UtteranceToken[] = [];
    #lang: string;
    #voiceType: string | null;
    #voices: string | null;
    #rate = 1;
    #text = '';
    #started = false;
    #ended = false;
    #current: BoundaryToken | null = null;
    #comparisonSymbolsRegexp?: RegExp;
    #comparisonSymbolsWords?: ComparisonSymbolsWords;

    /**
     * Create an Utterance instance.
     * @param tokens A list of tokens contained by the utterance.
     * @param rate The utterance playback rate.
     * @param lang The utterance language.
     * @param voiceType The utterance voice.
     * @param voices The utterance voices.
     */
    constructor(
        rate: number,
        lang: string,
        voiceType?: string | null,
        voices?: string | null,
        comparisonSymbolsRegexp?: RegExp,
        comparisonSymbolsWords?: ComparisonSymbolsWords
    ) {
        super();
        this.#rate = rate;
        this.#lang = lang;
        this.#voiceType = voiceType || null;
        this.#voices = voices || null;
        this.#comparisonSymbolsRegexp = comparisonSymbolsRegexp ?? DEFAULT_COMPARISON_SYMBOLS_REGEXP;
        this.#comparisonSymbolsWords = comparisonSymbolsWords || DEFAULT_COMPARISON_SYMBOLS_WORDS;
    }

    /**
     * Utterance tokens list length.
     */
    get length(): number {
        return this.#tokens.length;
    }

    /**
     * Utterance lang.
     */
    get lang(): string {
        return this.#lang;
    }

    /**
     * Utterance voice type.
     */
    get voiceType(): string | null {
        return this.#voiceType;
    }

    /**
     * Utterance voices.
     */
    get voices(): string | null {
        return this.#voices;
    }

    /**
     * Utterance rate.
     */
    get rate(): number {
        return this.#rate;
    }

    /**
     * Utterance started state.
     */
    get started(): boolean {
        return this.#started;
    }

    /**
     * Utterance ended state.
     */
    get ended(): boolean {
        return this.#ended;
    }

    /**
     * The corrent boundary.
     */
    get current(): BoundaryToken | null {
        return this.#current;
    }

    /**
     * Add token to utterance.
     * @param token The token to add.
     */
    addToken(token: BoundaryToken): void {
        const index = this.#text ? this.#text.length + 1 : this.#text.length;
        let text = token.text.trim();
        text = this.#expandComparisonSymbols(text);

        this.#tokens.push({
            token,
            startOffset: index,
            endOffset: index + text.length,
        });
        if (this.#text) {
            this.#text += text ? ` ${text}` : '';
        } else {
            this.#text = text;
        }
    }

    /** Expand < and > to words so TTS reads them properly. */
    #expandComparisonSymbols(text: string): string {
        const comparisonWords = this.#comparisonSymbolsWords;
        if (!comparisonWords || typeof text !== 'string' || !text) {
            return text;
        }

        const langBase = (this.#lang || '').split(/[-_]/)[0].toLowerCase();
        const wordsMap = comparisonWords[langBase] || comparisonWords['en'];

        if (wordsMap[text]) {
            return wordsMap[text];
        }

        const regex = this.#comparisonSymbolsRegexp ?? DEFAULT_COMPARISON_SYMBOLS_REGEXP;
        return text.replace(regex, (_match, p1) => {
            const symbol = p1 as keyof typeof wordsMap;
            if (!wordsMap[symbol]) {
                return symbol;
            }

            return wordsMap[symbol];
        });
    }

    /**
     * Retrieve the tokens list.
     */
    getTokens(): BoundaryToken[] {
        return this.#tokens.map((token) => token.token);
    }

    /**
     * Get computed text.
     * @returns Computed text string.
     */
    getText(): string {
        return this.#text;
    }

    /**
     * Get the first token of the utterance.
     */
    getFirstToken(): BoundaryToken | null {
        return this.#tokens[0]?.token ?? null;
    }

    /**
     * Get the last token of the utterance.
     */
    getLastToken(): BoundaryToken | null {
        return this.#tokens[this.#tokens.length - 1]?.token ?? null;
    }

    /**
     * Get the token at the given character index.
     * @return The found token at the given position.
     */
    getToken(charIndex: number): BoundaryToken | null {
        return (
            this.#tokens.find(({ startOffset, endOffset }) => charIndex >= startOffset && charIndex <= endOffset)
                ?.token ?? null
        );
    }

    /**
     * Flags the utterance as started.
     */
    async start(): Promise<unknown> {
        this.#started = true;
        return this.trigger('start');
    }

    /**
     * Trigger a token boundary during the speaking.
     */
    async boundary(token: BoundaryToken): Promise<unknown> {
        this.#current = token;
        return this.trigger('boundary', token);
    }

    /**
     * Flags the utterance as ended.
     */
    async end(): Promise<unknown> {
        this.#current = null;
        this.#started = false;
        this.#ended = true;
        return this.trigger('end');
    }
}
