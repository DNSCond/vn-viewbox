// vn-viewbox.ts
export class VNViewBoxBase extends HTMLElement {
}

export class VNViewBox extends VNViewBoxBase {
    #activeScript: VNScript | null = null;
    readonly #style: HTMLStyleElement;

    constructor() {
        super();
        const button = document.createElement('button');
        button.addEventListener('click', () => this.start(), {once: true});
        button.append(Object.assign(document.createElement('slot'), {
            textContent: 'Start Visual Novel', name: 'start-text',
        }));
        this.#style = Object.assign(document.createElement('style'), {textContent: styles});
        this.attachShadow({mode: 'open'})!.append(this.#style, document.createElement('slot'),
            Object.assign(button, {className: 'start-button', type: 'button'}));
    }

    connectedCallback(): void {
    }

    start(): void {
        const autoplay: VNScript | null = this.querySelector('vn-script[autoplay]');
        if (this.shadowRoot && autoplay) {
            Array.from(this.children, function (each) {
                const slot = each.getAttribute('slot');
                if (typeof slot === 'string') {
                    each.setAttribute('data-slot', slot);
                    each.removeAttribute('slot');
                }
            });
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
                div = Object.assign(document.createElement('div'), {className: 'textbox'});
            svg.setAttribute('viewBox', `0 0 1920 1080`);
            this.shadowRoot!.replaceChildren(this.#style, svg, div);
            div.style.position = 'absolute';
            this.#activeScript = autoplay;
            div.style.padding = '0.5em';
            svg.style.height = '100%';
            svg.style.width = '100%';
            div.style.height = '30%';
            div.style.width = '100%';
            div.style.top = '75%';
            div.style.top = '75%';
            // noinspection JSIgnoredPromiseFromCall
            autoplay.run(this);
        }
    }

    activeScript(): VNScript | null {
        return this.#activeScript;
    }

    _setTextElement(text: VNText): void {
        const name = generateUniqueId();
        this.#activeScript!;
        const textbox = Object.assign(document.createElement('slot'), {name});
        this.shadowRoot!.querySelector('div.textbox')!.append(textbox);
        text.setAttribute('slot', name);
    }

    throw(errorValue: any): never {
        const event = new CustomEvent('error', {
            detail: errorValue, cancelable: false,
            bubbles: true, composed: true,
        });
        this.dispatchEvent(event);
        throw errorValue;
    }
}

export class VNScript extends VNViewBoxBase {
    #isPaused = false;

    #currentElement: null | Element = null;

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    async run(vnViewBox: VNViewBox): Promise<void> {
        const event = new CustomEvent('vnscriptstart', {
            detail: null, cancelable: false,
            bubbles: true, composed: true,
        });
        this.dispatchEvent(event);
        this.#currentElement = this.firstElementChild;
        if (this.#currentElement) {
            // noinspection JSAssignmentUsedAsCondition
            do {
                if (this.#isPaused) {
                    // Return a promise that resolves when resume() is called
                    await new Promise(resolve => this.addEventListener(
                        'vn-resume', resolve, {once: true}));
                }
                if (!this.contains(this.#currentElement)) {
                    throw new DOMException("this.#currentElement must be within this", 'HierarchyRequestError');
                } else if (this.#currentElement instanceof VNEvent) {
                    await this.#currentElement.launchEvent(this);
                } else if ('vnExecute' in this.#currentElement) {
                    const execEvent = new CustomEvent('vn-exec', {
                        bubbles: true, cancelable: true, detail: {vn: vnViewBox},
                    }), canContinue = this.#currentElement.dispatchEvent(execEvent);
                    if (!canContinue) {
                        this.#isPaused = true;
                        continue;
                    }
                    await (this.#currentElement as any).vnExecute(vnViewBox);
                }
            } while (this.#currentElement = this.#currentElement.nextElementSibling);
            const event = new CustomEvent('vnscriptend', {
                detail: null, cancelable: false,
                bubbles: true, composed: true,
            });
            this.dispatchEvent(event);
        }
    }

    _setCurrentElement(to: Element): void {
        this.#currentElement = to;
    }
}

export class VNEvent extends VNViewBoxBase {
    launchEvent(details: any, cancelable = false): Promise<unknown> {
        const {promise, resolve, reject} = Promise.withResolvers<unknown>();
        const event = new CustomEvent('vnscriptstart', {
            detail: {details, resolve, reject, 'this': this}, cancelable,
            bubbles: true, composed: true,
        }), {timeout} = this;
        if (Number.isSafeInteger(timeout) && (timeout as number) > 0)
            setTimeout(() => reject('TimeoutError'), timeout as number);
        const cancelled = !this.dispatchEvent(event);
        return promise.then(promiseValue => ({cancelled, promiseValue}));
    }

    get timeout(): number | null {
        const timeout = this.getAttribute('timeout');
        if (timeout === null) return null;
        return +timeout;
    }

    set timeout(value: number | null) {
        if (value === null) this.removeAttribute('timeout');
        else this.setAttribute('timeout', `${+value}`);
    }
}

export abstract class VNExecutableTag extends VNViewBoxBase {
    constructor() {
        super();
        this.attachShadow({mode: 'open'}).append(document.createElement('slot'));
    }

    abstract vnExecute(vn: VNViewBox): Promise<void> | void;
}

export class VNText extends VNExecutableTag {
    readonly #button: HTMLButtonElement | null = null;

    constructor(text?: string) {
        super();
        if (typeof text === 'string') {
            this.textContent = String(text);
        }
        this.#button = document.createElement('button');
        this.shadowRoot!.append(Object.assign(this.#button, {type: 'button', textContent: 'Next'}))
    }

    vnExecute(vn: VNViewBox): Promise<void> | void {
        const placeholder = new VNPointerTag, {promise, resolve} = Promise.withResolvers<unknown>();
        this.insertAdjacentElement('afterend', placeholder);
        vn.activeScript()!._setCurrentElement(placeholder);
        vn.append(this);
        vn._setTextElement(this);
        this.#button!.addEventListener('click', resolve);
        return promise.then(() => undefined);
    }
}

class VNPointerTag extends VNExecutableTag {
    vnExecute(vn: VNViewBox) {
    }
}

class VNChoice extends VNExecutableTag {
    vnExecute(vn: VNViewBox) {
    }
}

class VNOpt extends VNExecutableTag {
    vnExecute(vn: VNViewBox) {
    }
}

const styles = `:host {
    display: block;
    position: relative;
    width: 100%;
    max-width: 1280px; /* Or 1920px */
    aspect-ratio: 16 / 9;
    margin: 0 auto;
    overflow: hidden;
    background: #000;
    border: 1px solid gray;
}

div.textbox {
    background: #fFf;
}

button.start-button {
    position: absolute;
    
    /* Horizontal Centering */
    left: 50%;
    transform: translateX(-50%);
    
    /* Vertical Placement at 70% */
    top: 70%;
    
    /* Optional: Ensure it stays above backgrounds */
    z-index: 10;
    
    font-size: 1.75em;
}`;
const elements = {
    'vn-pointertag': VNPointerTag,
    'vn-viewbox': VNViewBox,
    'vn-script': VNScript,
    'vn-choice': VNChoice,
    'vn-event': VNEvent,
    'vn-text': VNText,
    'vn-opt': VNOpt,
};
for (const [name, constructor] of Object.entries(elements)) {
    customElements.define(name, constructor);
}
await Promise.all(Object.keys(elements).map(elementName => customElements.whenDefined(elementName)));

export function generateUniqueId(length: number = 32): string {
    if (!Number.isSafeInteger(length)) throw RangeError('length isnt a safe integer');
    // @ts-ignore
    return crypto.getRandomValues(new Uint8Array(length)).toBase64();
}
