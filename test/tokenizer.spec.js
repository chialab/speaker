import { tokenize, TokenType } from '@chialab/speaker';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

describe('tokenizer', () => {
    let container;
    beforeEach(() => {
        container = document.createElement('article');
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container) {
            document.body.removeChild(container);
        }
    });

    test('should handle empty text', () => {
        const tokens = [...tokenize(container)];
        expect(tokens).toHaveLength(0);
    });

    test('should handle simple text', () => {
        container.innerHTML = 'Lorem ipsum dol<strong>or</strong> sit';

        const tokens = [...tokenize(container, TokenType.BOUNDARY)];
        expect(tokens).toHaveLength(4);
        expect(tokens[0]).toMatchObject({
            type: 1,
            text: 'Lorem',
            startOffset: 0,
            endOffset: 5,
            lang: 'en',
            voice: null,
        });
        expect(tokens[1]).toMatchObject({
            type: 1,
            text: 'ipsum',
            startOffset: 6,
            endOffset: 11,
            lang: 'en',
            voice: null,
        });
        expect(tokens[2]).toMatchObject({
            type: 1,
            text: 'dolor',
            startOffset: 12,
            endOffset: 0,
            lang: 'en',
            voice: null,
        });
        expect(tokens[3]).toMatchObject({
            type: 1,
            text: 'sit',
            startOffset: 1,
            endOffset: 4,
            lang: 'en',
            voice: null,
        });
    });

    test('should handle sentences', () => {
        container.innerHTML = 'Lorem ipsum. Lorem ipsum. Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY | TokenType.SENTENCE)];
        expect(tokens).toHaveLength(9);
        expect(tokens[2]).toMatchObject({
            type: 2,
            startOffset: 0,
            endOffset: 12,
        });
        expect(tokens[2].tokens).toHaveLength(2);
        expect(tokens[5].tokens).toHaveLength(2);
        expect(tokens[8].tokens).toHaveLength(2);
    });

    test('should handle blocks', () => {
        container.innerHTML = '<p>Lorem ipsum.</p><p>Lorem ipsum.</p>';

        const tokens = [...tokenize(container, TokenType.BOUNDARY | TokenType.BLOCK)];
        expect(tokens).toHaveLength(6);
        expect(tokens[2]).toMatchObject({
            type: 4,
            startOffset: 0,
            endOffset: 12,
        });
        expect(tokens[2].tokens).toHaveLength(2);
        expect(tokens[5].tokens).toHaveLength(2);
    });

    test('should handle sentences and blocks', () => {
        container.innerHTML = '<p>Lorem ipsum</p><p>Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container)];
        expect(tokens).toHaveLength(12);
        expect(tokens[2]).toMatchObject({
            type: 2,
            startOffset: 0,
            endOffset: 11,
        });
        expect(tokens[3]).toMatchObject({
            type: 4,
            startOffset: 0,
            endOffset: 11,
        });
    });

    test('should ignore hidden tokens', () => {
        container.innerHTML = '<p>Lorem <span style="display: none">ipsum</span>dolor sit</p>';

        const tokens = [...tokenize(container, TokenType.BOUNDARY)];
        expect(tokens).toHaveLength(3);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[1]).toMatchObject({ text: 'dolor' });
        expect(tokens[2]).toMatchObject({ text: 'sit' });
    });

    test('should ignore tokens by selector', () => {
        container.innerHTML =
            '<p>Lorem <span class="ignore">ipsum</span>dolor sit</p><p class="ignore">Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY, { ignore: '.ignore' })];
        expect(tokens).toHaveLength(5);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[1]).toMatchObject({ text: 'dolor' });
        expect(tokens[2]).toMatchObject({ text: 'sit' });
        expect(tokens[3]).toMatchObject({ text: 'Lorem' });
        expect(tokens[4]).toMatchObject({ text: 'ipsum' });
    });

    test('should ignore tokens by selector list', () => {
        container.innerHTML =
            '<p>Lorem <span class="ignore1">ipsum</span>dolor sit</p><p class="ignore2">Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY, { ignore: ['.ignore1', '.ignore2'] })];
        expect(tokens).toHaveLength(5);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[1]).toMatchObject({ text: 'dolor' });
        expect(tokens[2]).toMatchObject({ text: 'sit' });
        expect(tokens[3]).toMatchObject({ text: 'Lorem' });
        expect(tokens[4]).toMatchObject({ text: 'ipsum' });
    });

    test('should ignore tokens by function', () => {
        container.innerHTML = '<p>Lorem ipsum</p>dolor sit';

        const tokens = [
            ...tokenize(container, TokenType.BOUNDARY, { ignore: (node) => node.textContent === 'dolor sit' }),
        ];
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[1]).toMatchObject({ text: 'ipsum' });
    });

    test('should should split block elements', () => {
        container.innerHTML =
            '<div>Lorem <p>ipsum</p> dolor sit <span style="display: block;">amet</span> consectetur</div>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).toHaveLength(16);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[3]).toMatchObject({ text: 'ipsum' });
        expect(tokens[6]).toMatchObject({ text: 'dolor' });
        expect(tokens[7]).toMatchObject({ text: 'sit' });
        expect(tokens[10]).toMatchObject({ text: 'amet' });
        expect(tokens[13]).toMatchObject({ text: 'consectetur' });
    });

    test('should use alternative text', () => {
        container.innerHTML =
            '<p>Lorem ipsum</p><img alt="alternative text" style="display: block;">dolor <span aria-label="amet">sit</span>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).toHaveLength(11);
        expect(tokens[0]).toMatchObject({ text: 'Lorem' });
        expect(tokens[1]).toMatchObject({ text: 'ipsum' });
        expect(tokens[4]).toMatchObject({ text: 'alternative text' });
        expect(tokens[7]).toMatchObject({ text: 'dolor' });
        expect(tokens[8]).toMatchObject({ text: 'amet' });
    });

    test('should use aria-labelledby', () => {
        container.innerHTML =
            '<p aria-labelledby="label">Lorem ipsum</p><div id="label" aria-hidden="true">dolor sit</div>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).toHaveLength(3);
        expect(tokens[0]).toMatchObject({ text: 'dolor sit' });
    });
});
