import { Factory } from '@chialab/proteins';

export interface SpeechToken {
    /**
     * The token element.
     */
    token: Element;
    /**
     * The sentence parent element.
     */
    sentence: Element|null;
    /**
     * The text content of the token.
     */
    text: string;
    /**
     * The initial character index of the token in the sentence.
     */
    start: number;
    /**
     * The final character index of the token in the sentence.
     */
    end: number;
}

/**
 * A model class which represents an utterance.
 * @fires Utterance#start
 * @fires Utterance#boundary
 * @fires Utterance#end
 */
export class Utterance extends Factory.Emitter {
    /**
     * Create an Utterance instance.
     * @param tokens A list of tokens contained by the utterance.
     * @param lang The utterance language.
     * @param rate The utterance playback rate.
     */
    constructor(tokens: SpeechToken[], lang: string, rate: number) {
        super();
        this.tokens = tokens;
        this.lang = lang;
        this.rate = rate;
    }

    /**
     * Retrieve the tokens list.
     */
    getTokens() {
        return this.tokens;
    }

    /**
     * Get the first token of the utterance.
     */
    getFirstToken() {
        return this.tokens[0];
    }

    /**
     * Get the last token of the utterance.
     */
    getLastToken() {
        return this.tokens[this.tokens.length - 1];
    }

    /**
     * Get the token at the given character index.
     * @return The found token at the given position.
     */
    getToken(charIndex: number) {
        let token = this.tokens.find(({ start, end }) => charIndex >= start && charIndex < end);
        if (!token) {
            return null;
        }
        return token;
    }

    /**
     * Flags the utterance as started.
     */
    async started() {
        /**
         * Start event.
         *
         * @event Utterance#start
         */
        return await this.trigger('start');
    }

    /**
     * Trigger a token boundary during the speaking.
     */
    async boundary(token: SpeechToken) {
        /**
         * Boundary event.
         *
         * @event Utterance#boundary
         * @type {Token}
         */
        return await this.trigger('boundary', token);
    }

    /**
     * Flags the utterance as ended.
     */
    async ended() {
        /**
         * End event.
         *
         * @event Utterance#end
         */
        return await this.trigger('end');
    }
}
