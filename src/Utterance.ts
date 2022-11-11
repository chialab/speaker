import type { BoundaryToken } from './Tokenizer';
import type { Event } from './Emitter';
import { Emitter } from './Emitter';

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
    #voices: string;
    #rate: number;
    #text: string = '';

    /**
     * Create an Utterance instance.
     * @param tokens A list of tokens contained by the utterance.
     * @param lang The utterance language.
     * @param voices The utterance voices.
     * @param rate The utterance playback rate.
     */
    constructor(lang: string, voices: string, rate: number) {
        super();
        this.#lang = lang;
        this.#voices = voices;
        this.#rate = rate;
    }

    /**
     * Utterance tokens list length.
     */
    get length() {
        return this.#tokens.length;
    }

    /**
     * Utterance lang.
     */
    get lang() {
        return this.#lang;
    }

    /**
     * Utterance voices.
     */
    get voices() {
        return this.#voices;
    }

    /**
     * Utterance rate.
     */
    get rate() {
        return this.#rate;
    }

    /**
     * Add token to utterance.
     * @param token The token to add.
     */
    addToken(token: BoundaryToken) {
        const index = this.#text ? this.#text.length + 1 : this.#text.length;
        const text = token.text.trim();

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

    /**
     * Retrieve the tokens list.
     */
    getTokens() {
        return this.#tokens.map((token) => token.token);
    }

    /**
     * Get computed text.
     * @returns Computed text string.
     */
    getText() {
        return this.#text;
    }

    /**
     * Get the first token of the utterance.
     */
    getFirstToken() {
        return this.#tokens[0]?.token ?? null;
    }

    /**
     * Get the last token of the utterance.
     */
    getLastToken() {
        return this.#tokens[this.#tokens.length - 1]?.token ?? null;
    }

    /**
     * Get the token at the given character index.
     * @return The found token at the given position.
     */
    getToken(charIndex: number) {
        return this.#tokens.find(({ startOffset, endOffset }) => charIndex >= startOffset && charIndex <= endOffset)?.token ?? null;
    }

    /**
     * Flags the utterance as started.
     */
    async started() {
        return this.trigger('start');
    }

    /**
     * Trigger a token boundary during the speaking.
     */
    async boundary(token: BoundaryToken) {
        return this.trigger('boundary', token);
    }

    /**
     * Flags the utterance as ended.
     */
    async ended() {
        return this.trigger('end');
    }
}
