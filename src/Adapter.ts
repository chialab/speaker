import { merge } from '@chialab/proteins';
import { Utterance } from './Utterance';

/**
 * Speech synthesis voices loader is async in Chrome.
 * Promisify it.
 */
const VOICES_PROMISE: Promise<Array<SpeechSynthesisVoice>> = new Promise((resolve) => {
    const getVoices = () => {
        let voices = speechSynthesis.getVoices();
        if (voices.length) {
            voices = [...voices].filter((voice) => voice.localService);
            resolve(voices);
            return true;
        }
        return false;
    };
    if (!getVoices()) {
        speechSynthesis.onvoiceschanged = getVoices;
    }
});

export interface SynthesisOptions {
    /**
     * A list of preferred voice names to use.
     */
    preferredVoices: string[];
}

/**
 * Default options for Synthesis adapter.
 */
const DEFAULT_OPTIONS: SynthesisOptions = {
    preferredVoices: [
        'Google Deutsch',
        'Google US English',
        'Google UK English Female',
        'Google español',
        'Google español de Estados Unidos',
        'Google français',
        'Google हिन्दी',
        'Google Bahasa Indonesia',
        'Google italiano',
        'Google 日本語',
        'Google 한국의',
        'Google Nederlands',
        'Google polski',
        'Google português do Brasil',
        'Google русский',
        'Google 普通话（中国大陆）',
        'Google 粤語（香港）',
        'Google 國語（臺灣）',
        'Alice',
        'Amelie',
        'Anna',
        'Ellen',
        'Fiona',
        'Joana',
        'Ioana',
        'Monica',
        'Karen',
        'Luciana',
        'Laura',
        'Milena',
        'Samantha',
        'Sara',
    ],
};

/**
 * A Text2Speech adapter which uses native browser SpeechSynthesis.
 */
export class Adapter {
    private options: SynthesisOptions;
    private utterances?: Utterance[];
    private currentSpeechUtterance?: SpeechSynthesisUtterance;

    /**
     * Create an instance of the Synthesis adapter.
     * @param options A set of options for Synthesis.
     */
    constructor(options: Partial<SynthesisOptions> = {}) {
        this.options = merge(DEFAULT_OPTIONS, options);
    }

    /**
     * Get the pause state of the adapter.
     */
    get paused() {
        return speechSynthesis.paused;
    }

    /**
     * Check if the adapter is supported by the browser.
     */
    async support() {
        return !!speechSynthesis;
    }

    /**
     * Cancel the current speaking.
     */
    async cancel(): Promise<void> {
        if (!this.currentSpeechUtterance) {
            speechSynthesis.cancel();
            return;
        }

        let utterance = this.currentSpeechUtterance;
        return new Promise((resolve) => {
            delete this.currentSpeechUtterance;
            utterance.addEventListener('end', () => resolve());
            speechSynthesis.cancel();
        });
    }

    /**
     * Pause the current speaking.
     */
    async pause() {
        speechSynthesis.pause();
    }

    /**
     * Start or resume a speaking.
     * @param utterances A list of utterances to speak.
     */
    async play(utterances?: Utterance[]) {
        if (utterances) {
            // store utterances queue.
            this.utterances = utterances;
            return this.speakToken(await VOICES_PROMISE, 0);
        }

        // Just resume the playback.
        speechSynthesis.resume();
    }

    /**
     * Speak a token.
     * @param voices A list of available voices.
     * @param index The index of the token to speech.
     */
    private speakToken(voices: SpeechSynthesisVoice[], index: number) {
        if (!this.utterances) {
            return;
        }

        console.log(voices);

        let utterances = this.utterances;
        let utterance = utterances[index];
        let text = utterance.getTokens().map((token) => token.text).join(' ');
        let speechUtterance = new SpeechSynthesisUtterance(text);
        // we need to save a reference of the utterance in order to prevent gc. ¯\_(ツ)_/¯
        this.currentSpeechUtterance = speechUtterance;

        // listen SpeechSynthesisUtterance events in order to trigger Utterance callbacks
        speechUtterance.addEventListener('start', () => {
            utterance.started();
        });
        speechUtterance.addEventListener('boundary', ({ charIndex }) => {
            utterance.boundary(utterance.getToken(charIndex));
        });

        speechUtterance.addEventListener('end', () => {
            if (!this.currentSpeechUtterance) {
                return;
            }
            delete this.currentSpeechUtterance;
            utterance.ended();
            if (index !== utterances.length - 1) {
                this.speakToken(voices, index + 1);
            }
        });

        // setup utterance properties.
        let voice = this.getVoice(voices, utterance.lang);
        speechUtterance.voice = voice;
        speechUtterance.lang = voice.lang;
        speechUtterance.rate = utterance.rate;

        // add the utterance to the queue.
        speechSynthesis.speak(speechUtterance);
    }

    /**
     * Get a voice for the requested language.
     * @param {Array<SpeechSynthesisVoice>} voices A list of available voices.
     * @param {string} lang The requested language.
     * @return {SpeechSynthesisVoice}
     */
    private getVoice(voices, lang) {
        let { preferredVoices } = this.options;

        lang = lang.toLowerCase().replace('_', '-');
        let availableVoices = voices.filter((voice) => {
            let voiceLang = voice.lang.toLowerCase().replace('_', '-');
            let shortVoiceLang = voiceLang.split('-')[0];
            return voiceLang === lang || shortVoiceLang === lang;
        });

        return availableVoices.find((voice) => preferredVoices.includes(voice.name)) || availableVoices[0];
    }

    /**
     * Check if a token can be spoken by the adapter.
     * @param token The token to check.
     */
    canSpeech(token: Element) {
        return !token.closest('math, [data-mathml]');
    }
}

// ensure that speech synthesis is stop on page load.
speechSynthesis.cancel();

// ensure that speech will stop on page unload.
window.addEventListener('beforeunload', () => {
    speechSynthesis.cancel();
});
