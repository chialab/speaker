import { TokenType, tokenize } from '@chialab/speaker';
import { expect } from '@chialab/ginsenghino';

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

    it('should handle empty text', () => {
        const tokens = [...tokenize(container)];
        expect(tokens).to.have.lengthOf(0);
    });

    it('should handle simple text', () => {
        container.innerHTML = 'Lorem ipsum dol<strong>or</strong> sit';

        const tokens = [...tokenize(container, TokenType.BOUNDARY)];
        expect(tokens).to.have.lengthOf(4);
        expect(tokens[0]).to.include({
            type: 1,
            text: 'Lorem',
            startOffset: 0,
            endOffset: 5,
            lang: null,
            voice: null,
        });
        expect(tokens[1]).to.include({
            type: 1,
            text: 'ipsum',
            startOffset: 6,
            endOffset: 11,
            lang: null,
            voice: null,
        });
        expect(tokens[2]).to.include({
            type: 1,
            text: 'dolor',
            startOffset: 12,
            endOffset: 0,
            lang: null,
            voice: null,
        });
        expect(tokens[3]).to.include({
            type: 1,
            text: 'sit',
            startOffset: 1,
            endOffset: 4,
            lang: null,
            voice: null,
        });
    });

    it('should handle sentences', () => {
        container.innerHTML = 'Lorem ipsum. Lorem ipsum. Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY | TokenType.SENTENCE)];
        expect(tokens).to.have.lengthOf(9);
        expect(tokens[2]).to.include({
            type: 2,
            startOffset: 0,
            endOffset: 12,
        });
        expect(tokens[2].tokens).to.have.lengthOf(2);
        expect(tokens[5].tokens).to.have.lengthOf(2);
        expect(tokens[8].tokens).to.have.lengthOf(2);
    });

    it('should handle blocks', () => {
        container.innerHTML = '<p>Lorem ipsum.</p><p>Lorem ipsum.</p>';

        const tokens = [...tokenize(container, TokenType.BOUNDARY | TokenType.BLOCK)];
        expect(tokens).to.have.lengthOf(6);
        expect(tokens[2]).to.include({
            type: 4,
            startOffset: 0,
            endOffset: 12,
        });
        expect(tokens[2].tokens).to.have.lengthOf(2);
        expect(tokens[5].tokens).to.have.lengthOf(2);
    });

    it('should handle sentences and blocks', () => {
        container.innerHTML = '<p>Lorem ipsum</p><p>Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container)];
        expect(tokens).to.have.lengthOf(12);
        expect(tokens[2]).to.include({
            type: 2,
            startOffset: 0,
            endOffset: 11,
        });
        expect(tokens[3]).to.include({
            type: 4,
            startOffset: 0,
            endOffset: 11,
        });
    });

    it('should ignore tokens by selector', () => {
        container.innerHTML = '<p>Lorem <span class="ignore">ipsum</span>dolor sit</p><p class="ignore">Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY, { ignore: '.ignore' })];
        expect(tokens).to.have.lengthOf(5);
        expect(tokens[0]).to.include({ text: 'Lorem' });
        expect(tokens[1]).to.include({ text: 'dolor' });
        expect(tokens[2]).to.include({ text: 'sit' });
        expect(tokens[3]).to.include({ text: 'Lorem' });
        expect(tokens[4]).to.include({ text: 'ipsum' });
    });

    it('should ignore tokens by selector list', () => {
        container.innerHTML = '<p>Lorem <span class="ignore1">ipsum</span>dolor sit</p><p class="ignore2">Lorem ipsum</p>Lorem ipsum';

        const tokens = [...tokenize(container, TokenType.BOUNDARY, { ignore: ['.ignore1', '.ignore2'] })];
        expect(tokens).to.have.lengthOf(5);
        expect(tokens[0]).to.include({ text: 'Lorem' });
        expect(tokens[1]).to.include({ text: 'dolor' });
        expect(tokens[2]).to.include({ text: 'sit' });
        expect(tokens[3]).to.include({ text: 'Lorem' });
        expect(tokens[4]).to.include({ text: 'ipsum' });
    });

    it('should ignore tokens by function', () => {
        container.innerHTML = '<p>Lorem ipsum</p>dolor sit';

        const tokens = [...tokenize(container, TokenType.BOUNDARY, { ignore: (node) => node.textContent === 'dolor sit' })];
        expect(tokens).to.have.lengthOf(2);
        expect(tokens[0]).to.include({ text: 'Lorem' });
        expect(tokens[1]).to.include({ text: 'ipsum' });
    });

    it('should should split block elements', () => {
        container.innerHTML = '<div>Lorem <p>ipsum</p> dolor sit <span style="display: block;">amet</span> consectetur</div>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).to.have.lengthOf(16);
        expect(tokens[0]).to.include({ text: 'Lorem' });
        expect(tokens[3]).to.include({ text: 'ipsum' });
        expect(tokens[6]).to.include({ text: 'dolor' });
        expect(tokens[7]).to.include({ text: 'sit' });
        expect(tokens[10]).to.include({ text: 'amet' });
        expect(tokens[13]).to.include({ text: 'consectetur' });
    });

    it('should use alternative text', () => {
        container.innerHTML = '<p>Lorem ipsum</p><img alt="alternative text" style="display: block;">dolor <span aria-label="amet">sit</span>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).to.have.lengthOf(11);
        expect(tokens[0]).to.include({ text: 'Lorem' });
        expect(tokens[1]).to.include({ text: 'ipsum' });
        expect(tokens[4]).to.include({ text: 'alternative text' });
        expect(tokens[7]).to.include({ text: 'dolor' });
        expect(tokens[8]).to.include({ text: 'amet' });
    });

    it('should use aria-labelledby', () => {
        container.innerHTML = '<p aria-labelledby="label">Lorem ipsum</p><div id="label" aria-hidden="true">dolor sit</div>';

        const tokens = [...tokenize(container, TokenType.ALL)];
        expect(tokens).to.have.lengthOf(3);
        expect(tokens[0]).to.include({ text: 'dolor sit' });
    });
});
