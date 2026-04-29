// vn-viewbox.ts
export class VNViewBoxBase extends HTMLElement {
    get [Symbol.toStringTag](): string {
        return `VN-ViewBox(${this.constructor.name})`;
    }
}

export class VNViewBox extends VNViewBoxBase {
    #activeScript: VNScript | null = null;
    readonly #style: HTMLStyleElement;

    constructor() {
        super();
        const button = this.ownerDocument.createElement('button');
        button.addEventListener('click', () => this.start(), {once: true});
        button.append(Object.assign(this.ownerDocument.createElement('slot'), {
            textContent: 'Start Visual Novel', name: 'start-text',
        }));
        this.#style = Object.assign(this.ownerDocument.createElement('style'), {textContent: styles});
        this.attachShadow({mode: 'open'})!.append(this.#style, this.ownerDocument.createElement('slot'),
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
            const svg = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'),
                div = Object.assign(this.ownerDocument.createElement('div'), {className: 'textbox'});
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
        const textbox = Object.assign(this.ownerDocument.createElement('slot'), {name});
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

    getVariable(name: string): string | null | undefined {
        if (name && /^[a-z\-0-9_]+$/i.test(name)) {
            const localname = `data-varset-${name}`;
            return this.getAttribute(localname);
        }
        return undefined;
    }

    setVariable(name: string, value: string | null | undefined): void {
        if (name && /^[a-z\-0-9_]+$/i.test(name)) {
            const localname = `data-varset-${name}`;
            if (typeof value === 'string') {
                this.setAttribute(localname, value);
            } else {
                this.removeAttribute(localname);
            }
        }
    }
}

export class VNScript extends VNViewBoxBase {
    #isPaused = false;
    #currentElement: null | Element = null;
    #noskip = false;

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    async run(vnViewBox: VNViewBox): Promise<void> {
        const event = new CustomEvent('vn-scriptstart', {
            detail: null, cancelable: false,
            bubbles: true, composed: true,
        });
        this.dispatchEvent(event);
        this.#currentElement = this.firstElementChild;
        this.#noskip = false;
        if (this.#currentElement) {
            // noinspection JSAssignmentUsedAsCondition
            do {
                this.#noskip = false;
                if (this.#isPaused) {
                    // Return a promise that resolves when resume() is called
                    await new Promise(resolve => vnViewBox.addEventListener(
                        'vn-resume', resolve, {once: true}));
                    this.#isPaused = false;
                }
                if (!this.contains(this.#currentElement)) {
                    throw new DOMException("this.#currentElement must be within this", 'HierarchyRequestError');
                } else if ('vnExecute' in this.#currentElement) {
                    const execEvent = new CustomEvent('vn-exec', {
                        bubbles: true, cancelable: true, detail: {vn: vnViewBox},
                    });
                    if (!this.#currentElement.dispatchEvent(execEvent)) {
                        this.#isPaused = true;
                        continue;
                    }
                    await (this.#currentElement as VNExecutableTag).vnExecute(vnViewBox, this);
                }
            } while (this.#noskip || (this.#currentElement = this.#currentElement.nextElementSibling));
            const event = new CustomEvent('vn-scriptend', {
                detail: null, cancelable: false,
                bubbles: true, composed: true,
            });
            this.dispatchEvent(event);
        }
    }

    setCurrentElement(to: Element): void {
        this.#currentElement = to;
        this.#noskip = true;
    }
}

export class VNEvent extends VNViewBoxBase {
    vnExecute(vn: VNViewBox, currentScript: VNScript): Promise<unknown> {
        const {promise, resolve, reject} = Promise.withResolvers<unknown>(),
            details = {vn, currentScript}, event = new CustomEvent('vn-event', {
                detail: {details, resolve, reject, 'this': this},
                cancelable: false, bubbles: true, composed: true,
            }), {timeout} = this;
        if (Number.isSafeInteger(timeout) && (timeout as number) > 0)
            setTimeout(() => resolve('TimeoutError'), timeout as number);
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
    abstract vnExecute(vn: VNViewBox, currentScript: VNScript): Promise<unknown | void> | unknown | void;
}

abstract class VNInternalExecutableTag extends VNExecutableTag {
    constructor(slotType: 'named' | 'manual' = 'named') {
        super();
        this.attachShadow({mode: 'open', slotAssignment: slotType}).append(this.ownerDocument.createElement('slot'));
    }
}

export class VNText extends VNInternalExecutableTag {
    readonly #button: HTMLButtonElement | null = null;

    constructor(text?: string) {
        super();
        if (typeof text === 'string') {
            this.textContent = String(text);
        }
        this.#button = this.ownerDocument.createElement('button');
        this.shadowRoot!.append(Object.assign(this.#button, {type: 'button', textContent: 'Next'}));
    }

    vnExecute(vn: VNViewBox): Promise<void> {
        const placeholder = new VNPointerTag, {promise, resolve} = Promise.withResolvers<unknown>();
        this.insertAdjacentElement('afterend', placeholder);
        this.querySelectorAll('vn-getvar').forEach(each => void (each as VNGetVar).interpolate(vn));
        // vn.activeScript()!.setCurrentElement(placeholder);
        vn.append(this);
        vn._setTextElement(this);
        this.#button!.addEventListener('click', resolve);
        return promise.then(() => void placeholder.replaceWith(this));
    }
}

class VNPointerTag extends VNInternalExecutableTag {
    vnExecute(_vn: VNViewBox) {
    }
}

export class VNChoice extends VNInternalExecutableTag {
    constructor() {
        super('manual');
        this.shadowRoot!.replaceChildren();
    }

    vnExecute(vn: VNViewBox, currentScript: VNScript): Promise<void> {
        let slotindex = 0;
        const {promise, resolve} = Promise.withResolvers<VNOpt>(),
            abortController = new AbortController, {signal} = abortController,
            buttonlist = this.ownerDocument.createElement('ul');
        for (const opt of this.querySelectorAll('vn-opt')) {
            if (opt.parentElement === this) {
                const slot = this.ownerDocument.createElement('slot'),
                    button = this.ownerDocument.createElement('button'),
                    li = this.ownerDocument.createElement('li');
                slot.textContent = 'slot-' + String(slotindex++);
                button.append(slot);
                li.append(button);
                buttonlist.append(li);
                slot.assign(opt);
                button.addEventListener('click', () => {
                    abortController.abort();
                    resolve(opt as VNOpt);
                }, {signal});
            }
        }
        this.shadowRoot!.replaceChildren(buttonlist);
        return promise.then(vnopt => {
            buttonlist.remove();
            vnopt.vnExecute(vn, currentScript);
        });
    }
}

export class VNJumpTo extends VNViewBoxBase {
    get jumpTo(): string | null {
        return this.getAttribute('jumpto');
    }

    set jumpTo(where: string | null) {
        if (where === null) this.removeAttribute('jumpto');
        else this.setAttribute('jumpto', where);
    }

    get jumpToVariable(): string | null {
        return this.getAttribute('jumpto-variable');
    }

    set jumpToVariable(where: string | null) {
        if (where === null) this.removeAttribute('jumpto-variable');
        else this.setAttribute('jumpto-variable', where);
    }

    resolveJumpTo(vn: VNViewBox, currentScript: VNScript): Element | null {
        const {jumpTo, jumpToVariable} = this;
        let where = jumpTo;
        if (jumpToVariable !== null) {
            where = vn.getVariable(jumpToVariable) ?? null;
        }
        if (where !== null) {
            const element = this.ownerDocument.getElementById(where);
            // cross script jumps can be done later.
            if (element) if (currentScript.contains(element)) {
                return element;
            }
        }
        return null;
    }

    vnExecute(vn: VNViewBox, currentScript: VNScript): void {
        const element = this.resolveJumpTo(vn, currentScript);
        if (element) {
            currentScript.setCurrentElement(element);
        }
    }
}

export class VNOpt extends VNJumpTo {
    // vnExecute will not be executed as long as it is a child of VNChoice.
}


export class VNGetVar extends VNInternalExecutableTag {
    interpolate(vn: VNViewBox): void {
        const {name} = this, variable = vn.getVariable(name ?? '') ?? null;
        if (typeof variable === 'string') {
            this.shadowRoot!.replaceChildren(variable);
        }
    }

    override vnExecute(_vn: VNViewBox, _currentScript: VNScript): void {
    }

    get name(): string | null {
        return this.getAttribute('name');
    }

    set name(value: string | null) {
        if (value === null) this.removeAttribute('name');
        else this.setAttribute('name', value);
    }
}

export class VNSetVar extends VNInternalExecutableTag {
    vnExecute(vn: VNViewBox, _currentScript: VNScript): void {
        const {name, value} = this;
        if (typeof name === 'string') {
            vn.setVariable(name as string, (value ?? this.textContent?.trim()) || null);
        }
    }

    get name(): string | null {
        return this.getAttribute('name');
    }

    set name(value: string | null) {
        if (value === null) this.removeAttribute('name');
        else this.setAttribute('name', value);
    }

    get value(): string | null {
        return this.getAttribute('value');
    }

    set value(value: string | null) {
        if (value === null) this.removeAttribute('value');
        else this.setAttribute('value', value);
    }
}

export class VNIf extends VNExecutableTag {
    async vnExecute(vn: VNViewBox, _currentScript: VNScript): Promise<void> {
        let currentElement = this.firstElementChild, value = true;
        if (currentElement) do {
            const logical = (currentElement as any).logical;
            if (logical) {
                value = (currentElement as any).executeLogic(logical, value, vn);
            } else if ((currentElement instanceof VNScript) && value) {
                await currentElement.run(vn);
                // reset the accumulator for else if branches.
                value = true;
            }
        } while ((currentElement = currentElement.nextElementSibling));
    }
}

class VNLogic extends VNViewBoxBase {
    executeLogic(logical: 'AND' | 'OR' | 'NOT', accumulator: boolean, vn: VNViewBox): boolean {
        if (logical === 'NOT') return !accumulator;
        let value = false, inverted = false;
        let operator = this.operator?.toLowerCase();
        const {variableLeft, variableRight, valueLeft, valueRight} = this;
        let left = valueLeft ?? NaN, right = valueRight ?? NaN;
        if (typeof variableLeft === 'string') left = vn.getVariable(variableLeft) ?? NaN;
        if (typeof variableRight === 'string') right = vn.getVariable(variableRight) ?? NaN;
        const rawOperator = operator;
        if (operator?.startsWith('not-')) {
            operator = operator.slice(4);
            inverted = true;
        }
        switch (operator) {
            case 'greater-than-or-equals':
                value = +left >= +right;
                break;
            case 'less-than-or-equals':
                value = +left <= +right;
                break;
            case 'greater-than':
                value = +left > +right;
                break;
            case 'less-than':
                value = +left < +right;
                break;
            case 'equals':
                value = left === right;
                break;
            default:
                console.warn(`${rawOperator} (${typeof operator}) is not a valid operator`);
        }
        if (inverted) value = !value;
        switch (logical) {
            case 'AND':
                return accumulator && value;
            case 'OR':
                return accumulator || value;
            default:
        }
        return value;
    }

    get operator(): string | null {
        return this.getAttribute('operator');
    }

    set operator(value: string | null) {
        if (value === null) this.removeAttribute('operator');
        else this.setAttribute('operator', value);
    }

    // directions
    get valueLeft(): string | null {
        return this.getAttribute('value-Left');
    }

    set valueLeft(value: string | null) {
        if (value === null) {
            this.removeAttribute('value-Left');
        } else this.setAttribute('value-Left', value);
    }

    get variableLeft(): string | null {
        return this.getAttribute('variable-Left');
    }

    set variableLeft(value: string | null) {
        if (value === null) {
            this.removeAttribute('variable-Left');
        } else this.setAttribute('variable-Left', value);
    }

    get valueRight(): string | null {
        return this.getAttribute('value-Right');
    }

    set valueRight(value: string | null) {
        if (value === null) {
            this.removeAttribute('value-Right');
        } else this.setAttribute('value-Right', value);
    }

    get variableRight(): string | null {
        return this.getAttribute('variable-Right');
    }

    set variableRight(value: string | null) {
        if (value === null) {
            this.removeAttribute('variable-Right');
        } else this.setAttribute('variable-Right', value);
    }
}

export class VNAnd extends VNLogic {
    readonly logical = 'AND';
}

export class VNOr extends VNLogic {
    readonly logical = 'OR';
}

export class VNNOT extends VNLogic {
    readonly logical = 'NOT';
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
    'vn-getvar': VNGetVar,
    'vn-setvar': VNSetVar,
    'vn-jumpto': VNJumpTo,
    'vn-event': VNEvent,
    'vn-text': VNText,
    'vn-opt': VNOpt,
    'vn-and': VNAnd,
    'vn-not': VNNOT,
    'vn-or': VNOr,
    'vn-if': VNIf,
};
for (const [name, constructor] of Object.entries(elements)) {
    customElements.define(name, constructor);
}
await Promise.all(Object.keys(elements).map(elementName => customElements.whenDefined(elementName)));

export function generateUniqueId(length: number = 16): string {
    if (!Number.isSafeInteger(length)) {
        throw RangeError('length isnt a safe integer');
    }
    // @ts-ignore
    return crypto.getRandomValues(new Uint8Array(length)).toBase64();
}

export function setBooleanAttribute(element: HTMLElement, name: string, value: boolean | null | string): void {
    if (typeof value === 'string') {
        element.setAttribute(name, value);
    } else switch (value) {
        case null:
            element.toggleAttribute(name, false);
            break;
        case false:
        case true:
            element.toggleAttribute(name, Boolean(value));
            break;
        default:
            throw TypeError(name + ' is a boolean attribute. only string, true, false, null allowed');
    }
}
