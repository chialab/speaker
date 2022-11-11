/**
 * Normalize range rects.
 * Sometimes browsers duplicate rectangles or create two split rectangles unnecessarily.
 * @param original The origin rect list.
 * @returns A normalized list of rects.
 */
function normalizeRects(original: DOMRectList) {
    const rects: DOMRect[] = [];
    const collected: DOMRect[] = [];

    for (let i = 0; i < original.length; i++) {
        const rect = original[i];
        if (!rect.width || !rect.height) {
            // remove empty
            continue;
        }
        if (collected.find((r) => r.top === rect.top && r.left === rect.left && r.width === rect.width && r.height === rect.height)) {
            // remove duplicates
            continue;
        }

        collected.push(rect);

        const last = rects[rects.length - 1];
        if (!last || last.top !== rect.top || last.height !== rect.height || ((rect.left - (last.left + last.width)) > 1)) {
            rects.push(new DOMRect(rect.left, rect.top, rect.width, rect.height));
        } else {
            last.width += rect.width;
        }
    }

    return rects;
}

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
    #lastFrameRequest: number | null = null;
    #shown = false;

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
        this.#currentRange = range;
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
        this.liveUpdate(false);
        this.#root.appendChild(this.#element);
    }

    /**
     * Hide highlighting rects.
     */
    hide() {
        this.#shown = false;
        this.liveUpdate(false);
        this.#lastFrameRequest = null;
        this.#root.removeChild(this.#element);
        this.#element.innerHTML = '';
    }

    /**
     * Update rects position.
     */
    update() {
        if (!this.#currentRange) {
            return;
        }

        const rects = normalizeRects(this.#currentRange.getClientRects());
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
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
            });
        }
        while (i <= childNodes.length - 1) {
            element.removeChild(childNodes.item(childNodes.length - 1) as Element);
        }
    }

    /**
     * Create the rect element.
     * @returns A div element.
     */
    private createRectElement() {
        const element = this.#element.ownerDocument.createElement('div');
        element.classList.add(this.#options.rectClass ?? 'highlighter-rect');

        return element;
    }

    /**
     * Start or stop live update.
     * @param active Should enable or disable live update.
     */
    private liveUpdate(active: boolean) {
        if (active) {
            this.update();
            this.#lastFrameRequest = requestAnimationFrame(() => this.liveUpdate(true));
        } else {
            if (this.#lastFrameRequest) {
                cancelAnimationFrame(this.#lastFrameRequest);
            }
        }
    }
}
