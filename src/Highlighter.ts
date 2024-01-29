import { compareRanges, getClientRects } from './Range';

/**
 * Highlighter creation options.
 */
export interface HighlighterOptions {
    root?: Element;
    containerClass?: string;
    rectClass?: string;
}

/**
 * An range-based highlighter class.
 */
export class Highlighter {
    #options: HighlighterOptions;
    #root: Element;
    #element: Element;
    #currentRange: Range | null = null;
    #shown = false;
    #observer?: ResizeObserver;

    constructor(options: HighlighterOptions = {}) {
        const root = options.root ?? document.body;
        const element = root.ownerDocument.createElement('div');
        element.classList.add(options.containerClass ?? 'highlighter');

        this.#element = element;
        this.#root = root;
        this.#options = options;
    }

    /**
     * Set active range to highlight.
     * @param range
     */
    setRange(range: Range | null) {
        if (
            (range && !this.#currentRange) ||
            (!range && this.#currentRange) ||
            (range && !compareRanges(range, this.#currentRange as Range))
        ) {
            this.#currentRange = range;
            this.update();
        }
        if (range) {
            if (!this.#shown) {
                this.show();
            }
        } else if (this.#shown) {
            this.hide();
        }
    }

    /**
     * Show highlighting rects.
     */
    show() {
        this.#shown = true;

        if (!this.#element.isConnected) {
            this.#root.appendChild(this.#element);
        }

        if (this.#observer) {
            this.#observer.disconnect();
        }
        this.#observer = new ResizeObserver(this._oundUpdate);
        this.#observer.observe(this.#root);

        this.#root.removeEventListener('scroll', this._oundUpdate);
        this.#root.addEventListener('scroll', this._oundUpdate, true);
    }

    /**
     * Hide highlighting rects.
     */
    hide() {
        this.#shown = false;

        if (this.#observer) {
            this.#observer.disconnect();
        }

        this.#root.removeEventListener('scroll', this._oundUpdate);

        if (this.#element.isConnected) {
            this.#root.removeChild(this.#element);
            this.#element.innerHTML = '';
        }
    }

    /**
     * Update rects position.
     */
    update() {
        if (!this.#currentRange) {
            return;
        }

        const rootRect = this.#root.getBoundingClientRect();
        const rects = getClientRects(this.#currentRange);
        const element = this.#element;
        const childNodes = element.children;
        let i;
        for (i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const box = (childNodes.item(i) || this.createRectElement()) as HTMLDivElement;
            if (childNodes.length === i) {
                element.appendChild(box);
            }
            Object.assign(box.style, {
                top: `${rect.top - rootRect.top}px`,
                left: `${rect.left - rootRect.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
            });
        }
        while (i <= childNodes.length - 1) {
            element.removeChild(childNodes.item(childNodes.length - 1) as Element);
        }
    }

    /**
     * Bound `update`for listeners.
     */
    private _oundUpdate = () => {
        this.update();
    };

    /**
     * Create the rect element.
     * @returns A div element.
     */
    private createRectElement() {
        const element = this.#element.ownerDocument.createElement('div');
        element.classList.add(this.#options.rectClass ?? 'highlighter-rect');

        return element;
    }
}
