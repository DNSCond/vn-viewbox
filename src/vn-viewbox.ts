// vn-viewbox.ts
/**
 * the base tag for identification
 */
export class VNViewBoxBase extends HTMLElement {
    get [Symbol.toStringTag](): string {
        return `VN-ViewBox(${this.constructor.name})`;
    }
}

/**
 * the variable container. for inheritance only.
 *
 * to disable the storage of variables add `variablesAllowed = false;`
 *
 * variables are prefixed with `data-varset-`

 * Variables cascade upward through parent VNVarContainers.
 * Prefix with 'local-' to prevent upward traversal.
 *
 * @example
 * <vn-viewbox data-varset-player="Alice"> <!-- global -->
 *   <vn-script data-varset-local-temp="secret"> <!-- script-only -->
 */
export class VNVarContainer extends VNViewBoxBase {
    variablesAllowed = true;

    /**
     * return a variable with name.
     */
    getVariable(name: string): string | null {
        if (/^[a-z\-0-9_]+$/i.test(name)) {
            const localname = `data-varset-${name}`;
            const value = this.getAttribute(localname);
            if (typeof value === 'string') return value;
            if (/^local-/i.test(name)) return null;
            let parent: HTMLElement | undefined | null = this;
            // noinspection JSAssignmentUsedAsCondition
            while (parent = parent?.parentElement) {
                if ((parent instanceof VNVarContainer) && parent.variablesAllowed) {
                    return parent.getVariable(name);
                }
            }
        }
        return null;
    }

    setVariable(name: string, value: string | null): void {
        if (name)
            if (this.variablesAllowed) {
                if (/^[a-z\-0-9_]+$/i.test(name)) {
                    const localname = `data-varset-${name}`;
                    if (typeof value === 'string') {
                        this.setAttribute(localname, value);
                    } else {
                        this.removeAttribute(localname);
                    }
                }
            } else if (/^local-/i.test(name)) {
                let parent: HTMLElement | undefined | null = this;
                // noinspection JSAssignmentUsedAsCondition
                while (parent = parent?.parentElement) {
                    if ((parent instanceof VNVarContainer) && parent.variablesAllowed) {
                        parent.setVariable(name, value);
                    }
                }
            }
    }

    delVariable(name: string): void {
        this.setVariable(name, null);
    }

    /**
     * returns all variable as attr nodes.
     */
    getAllVariables(): Attr[] {
        return Array.from(this.attributes, attribute => {
            if (attribute.name.startsWith('data-varset-')) {
                return attribute;
            } else return null;
        }).filter(attribute => attribute) as Attr[];
    }

    /**
     * returns all variable a ans object.
     */
    getAllVariablesAsObject(): { [key: string]: string } {
        // noinspection JSPrimitiveTypeWrapperUsage
        const result: any = new Object;
        this.getAllVariables().forEach(each => void Reflect.set(result, each.name.replace(/^data-varset-/i, String()), each.value));
        return result;
    }

    /**
     * return a variable with name. coerces to a number js style.
     */
    getVariableNumber(name: string): number | null {
        const value = this.getVariable(name);
        if (typeof value === 'string') return +value;
        return null;
    }

    /**
     * return true if a variable with name is present, false otherwise.
     */
    getVariableBoolean(name: string): boolean {
        const value = this.getVariable(name);
        // boolean attributes are HTML attributes, absence equals false.
        return typeof value === 'string';
    }
}

/**
 * the main component.
 *
 * @example
 * ```
 * <vn-viewbox></vn-viewbox>
 * ```
 */
export class VNViewBox extends VNVarContainer {
    #activeScript: VNScript | null = null;
    readonly #style: HTMLStyleElement;
    #readyState = true;

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
        const waitFor = this.waitForElementsArray() ?? Array();
        if (waitFor?.length > 0) {
            this.#readyState = false;
            const timeout = this.elementWaitTimeout ?? (6 * 1000),
                timeoutPromiseResolvers = Promise.withResolvers();
            setTimeout(timeoutPromiseResolvers.reject, timeout);
            // =/^[a-z][^\/>A-Z]*-[^\/>A-Z]*$/.test
            Promise.race([Promise.allSettled(waitFor.map(elementName =>
                customElements.whenDefined(elementName))), timeoutPromiseResolvers.promise]
            ).then(undefined, rejected => {
                const elements = waitFor.flatMap(elementName =>
                    !customElements.get(elementName) ? elementName : Array());
                console.error(`some elements have not loaded, in particular [${elements.join(',\x20')}]`);
                throw rejected;
            }).finally(() => void (this.#readyState = true));
        }
    }

    checkHealth(): void {
        this.querySelectorAll("*").forEach(each => void (each as any).checkHealth?.(this));
    }

    /**
     * start the visual novel, optionally pass a VNScript. the VNScript will loop over its children sequentially.
     */
    start(manualplay?: VNScript): Promise<unknown> {
        if (!this.#readyState) {
            throw Error('readyState is false. wait for the elements to load');
        }
        let play: VNScript | null;
        if (manualplay instanceof VNScript) {
            play = manualplay;
        } else {
            play = this.querySelector('vn-script[autoplay]');
        }
        if (this.shadowRoot && play) {
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
            div.style.padding = '0.5em';
            this.#activeScript = play;
            svg.style.height = '100%';
            svg.style.width = '100%';
            div.style.height = '30%';
            div.style.width = '100%';
            div.style.top = '75%';
            return play.run(this);
        }
        return Promise.resolve(undefined);
    }

    /**
     * the current active script.
     */
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

    set waitForElements(value: string | Array<string> | null) {
        if (Array.isArray(value)) {
            value = value.join('\x20');
        }
        if (value === null) this.removeAttribute('wait-for-element');
        else this.setAttribute('wait-for-element', value.toLowerCase());
    }

    get waitForElements(): string | null {
        return this.getAttribute('wait-for-element');
    }

    waitForElementsArray(): Array<string> | null {
        const {waitForElements} = this;
        if (waitForElements === null) return waitForElements;
        return waitForElements.toLowerCase().split(/\s+/g);
    }

    /**
     * get the timeout
     */
    get elementWaitTimeout(): number | null {
        const timeout = this.getAttribute('element-wait-timeout');
        if (timeout === null) return null;
        return +timeout;
    }

    /**
     * set a timeout
     */
    set elementWaitTimeout(value: number | null) {
        if (value === null) this.removeAttribute('element-wait-timeout');
        else this.setAttribute('element-wait-timeout', `${+value}`);
    }
}

/**
 * the main worker of the experience.
 */
export class VNScript extends VNVarContainer {
    #currentElement: null | Element = null;
    #noskip = false;

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    /**
     * run the script.
     *
     * fires a `'vn-scriptstart'` event. then loops over each child and calls its `vnExecute` method if it has one,
     * otherwise it skips the element. `<template>` elements are cloned and parsed as scripts then executed.
     *
     * each element moved to fires a `'vn-exec'` event that bubbles, is composed and is cancelable,
     * when canceled the entire VNScript enters an async halt. fire `'vn-resume'` to resume operations.
     *
     * fires `'vn-scriptend'` when there are no more children after the currentElement
     * and therefore `nextElementSibling` is null.
     */
    async run(vnViewBox: VNViewBox): Promise<void> {
        if (this.#currentElement) throw TypeError('his.#currentElement is not null');
        const event = new CustomEvent('vn-scriptstart', {
            detail: {'this': this}, cancelable: false,
            bubbles: true, composed: true,
        }), preload_weakset = new WeakSet;
        this.dispatchEvent(event);
        this.#currentElement = this.firstElementChild;
        this.#noskip = false;
        if (this.#currentElement) {
            // noinspection JSAssignmentUsedAsCondition
            do {
                this.#noskip = false;
                let lookahead: Element | null = this.#currentElement;
                for (let i = 0; i < 5; i++) {
                    if (preload_weakset.has(lookahead as WeakKey)) continue;
                    else if (lookahead !== null) preload_weakset.add(lookahead);
                    (lookahead as VNPreloadedExecutableTag)?.vnPreload?.(vnViewBox, this);
                    (lookahead = lookahead?.nextElementSibling ?? null);
                }
                if (!this.contains(this.#currentElement)) {
                    throw new DOMException("this.#currentElement must be within this", 'HierarchyRequestError');
                } else if (this.#currentElement instanceof HTMLTemplateElement) {
                    const script = this.ownerDocument.createElement('vn-script') as VNScript;
                    script.replaceChildren(this.#currentElement.content.cloneNode(true));
                    this.insertAdjacentElement('afterend', script);
                    await script.run(vnViewBox);
                } else if ('vnExecute' in this.#currentElement) {
                    const execEvent = new CustomEvent('vn-exec', {
                            bubbles: true, cancelable: true,
                            detail: {vn: vnViewBox}, composed: false,
                        }), abortController = new AbortController,
                        {signal} = abortController, {promise, resolve} = Promise.withResolvers();
                    promise.then(() => void abortController.abort(), () => void abortController.abort());
                    vnViewBox.addEventListener('vn-resume', resolve, {signal, once: true});
                    if (!this.#currentElement.dispatchEvent(execEvent)) {
                        await promise;
                        continue;
                    } else resolve(undefined);
                    await Promise.try(() => (this.#currentElement as VNExecutableTag).vnExecute(vnViewBox, this)
                    ).catch(error => vnViewBox.throw(error));
                }
            } while (this.#noskip || (this.#currentElement = this.#currentElement.nextElementSibling));
            const event = new CustomEvent('vn-scriptend', {
                detail: {'this': this}, cancelable: false,
                bubbles: true, composed: true,
            });
            this.dispatchEvent(event);
        }
    }

    /**
     * programmatically sets the currentElement to the one given, the element is not skipped.
     */
    setCurrentElement(to: Element): void {
        this.#currentElement = to;
        this.#noskip = true;
    }

    get preloadEnabled(): boolean {
        return this.hasAttribute('preload-enabled');
    }

    set preloadEnabled(value: boolean | null) {
        setBooleanAttribute(this, 'preload-enabled', value);
    }
}

/**
 * Pauses script execution until an external event handler resolves.
 *
 * CRITICAL: This element MUST be used with an event listener that calls resolve(),
 * otherwise the script will hang forever (or until timeout).
 *
 * its detail has the following TypeScript shape.
 * `{details: {vn: VNViewBox, currentScript: VNScript}, resolve: (value: unknown) => void,
 * reject: (reason?: any) => void, 'this': VNEvent}`.
 *
 * @example
 * <vn-event timeout="5000"></vn-event>
 *
 * @warning The timeout RESOLVES with 'TimeoutError' string, does NOT reject.
 * @warning If no event handler calls resolve/reject and preventDefault is called, execution never continues.
 *
 * @attribute timeout - Milliseconds before auto-resolving with 'TimeoutError'
 */
export class VNEvent extends VNViewBoxBase {
    vnExecute(vn: VNViewBox, currentScript: VNScript): Promise<unknown> | void {
        const {promise, resolve, reject} = Promise.withResolvers<unknown>(),
            details = {vn, currentScript}, event = new CustomEvent('vn-event', {
                detail: {details, resolve, reject, 'this': this},
                cancelable: true, bubbles: true, composed: true,
            }), {timeout} = this;
        if (Number.isSafeInteger(timeout) && (timeout as number) > 0)
            setTimeout(() => resolve('TimeoutError'), timeout as number);
        const cancelled = !this.dispatchEvent(event);
        if (cancelled) return promise;//.then(promiseValue => ({cancelled, promiseValue}));
    }

    /**
     * get the timeout
     */
    get timeout(): number | null {
        const timeout = this.getAttribute('timeout');
        if (timeout === null) return null;
        return +timeout;
    }

    /**
     * set a timeout
     */
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

export abstract class VNPreloadedExecutableTag extends VNViewBoxBase {
    // the promise is ignored.
    abstract vnPreload(vn: VNViewBox, currentScript: VNScript): Promise<unknown | void> | unknown | void;
}

/**
 * the main text display. supports `{{this-syntax}}` for variables which can be turned off with the `noInterpolate` attribute.
 *
 * @warning VNText interpolation happens once at execution time.
 * Dynamic updates to variables won't reflect in already-displayed text.
 * but will the next time this element is encountered.
 */
export class VNText extends VNInternalExecutableTag {
    readonly #button: HTMLButtonElement | null = null;
    #interpolated = false;

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
        this.interpolateText();
        this.querySelectorAll('vn-getvar').forEach(each => void (each as VNGetVar).interpolate(vn));
        // vn.activeScript()!.setCurrentElement(placeholder);
        vn.append(this);
        vn._setTextElement(this);
        this.#button!.addEventListener('click', resolve);
        return promise.then(() => void placeholder.replaceWith(this));
    }

    interpolateText(): void {
        if (this.#interpolated || this.noInterpolate) {
            return;
        }
        this.#interpolated = true;
        const walker = this.ownerDocument.createTreeWalker(this, NodeFilter.SHOW_TEXT, null), targets = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent?.includes('{{')) {
                targets.push(node);
            }
        }
        targets.forEach(textNode => this.processSingleNode(textNode as Text));
    }

    processSingleNode(textNode: Text): void {
        const fragment = new DocumentFragment,
            text = textNode.textContent,
            regex = /\{\{(.+?)}}/g, node = textNode;
        let lastIndex = 0, match: RegExpMatchArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (match.index! > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const getVar = this.ownerDocument.createElement('vn-getvar');
            getVar.setAttribute('name', match[1]!.trim());
            fragment.appendChild(getVar);
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        node.parentNode!.replaceChild(fragment, node);
    }

    get noInterpolate(): boolean {
        return this.hasAttribute('noInterpolate');
    }

    set noInterpolate(value: boolean) {
        setBooleanAttribute(this, 'noInterpolate', value);
    }
}

/**
 * placeholder tag.
 */
class VNPointerTag extends VNInternalExecutableTag {
    vnExecute(_vn: VNViewBox) {
    }
}

/**
 * visual novels are known for their branching paths. when a `VNChoice` is encountered its `VNOpt`s are displayed as options.
 */
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

/**
 * jump to any tag in the script. if the currentScript does not contain that tag then nothing happens.
 */
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

    /**
     * resolve the jumpto settings and return a html element or null if it isnt found.
     */
    resolveJumpTo(vn: VNViewBox, currentScript?: VNScript): Element | null {
        const {jumpTo, jumpToVariable} = this;
        let where = jumpTo;
        if (jumpToVariable !== null) {
            where = vn.getVariable(jumpToVariable) ?? null;
        }
        if (where !== null) {
            const element = this.ownerDocument.getElementById(where);
            // cross script jumps can be done later.
            if (element) if ((currentScript ?? vn)?.contains(element)) {
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

    checkHealth(vn: VNViewBox): void {
        if (this.resolveJumpTo(vn) === null) console.error(this, 'cannot find its jump target');
    }
}

/**
 * an option for a `vn-choice`
 */
export class VNOpt extends VNJumpTo {
    // vnExecute will not be executed as long as it is a child of VNChoice.
}

/**
 * a string interpolated variable. will be installed in a VNText with no `noInterpolate` attribute.
 */
export class VNGetVar extends VNInternalExecutableTag {
    interpolate(vn: VNViewBox): void {
        const {name} = this, variable = typeof name == 'string' ? (vn.getVariable(name) ?? null) : null;
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

/**
 * sets or deletes a variable.
 */
export class VNSetVar extends VNInternalExecutableTag {
    vnExecute(vn: VNViewBox, currentScript: VNScript): void {
        const {name, value, scope, operator, deleteVariable} = this;
        if (typeof name === 'string') {
            let newValue = value;
            if (!deleteVariable) {
                const existingVariable = (scope === 'script' ? currentScript : vn).getVariable(name as string);
                const oldValue = +(value ?? 0), existingVariableAsNumber = +(existingVariable ?? 0);
                switch (operator?.toLowerCase()) {
                    case 'concat-space':
                        newValue = (existingVariable ?? "") + '\x20' + (value ?? "");
                        break;
                    case 'concat':
                        newValue = (existingVariable ?? "") + (value ?? "");
                        break;
                    case '+':
                    case 'add':
                        newValue = String((+existingVariableAsNumber) + (+oldValue));
                        break;
                    case '-':
                    case 'sub':
                    case 'subtract':
                        newValue = String(existingVariableAsNumber - oldValue);
                        break;
                    case '*':
                    case 'mul':
                    case 'multiply':
                        newValue = String(existingVariableAsNumber * oldValue);
                        break;
                    case '/':
                    case 'div':
                    case 'divide':
                        newValue = String(existingVariableAsNumber / oldValue);
                        break;
                    case '%':
                    case 'rem':
                    case 'remainder':
                        newValue = String(existingVariableAsNumber % oldValue);
                        break;
                    case '~':
                    case 'not':
                    case 'bitwise-not':
                        newValue = String(~existingVariableAsNumber);
                        break;
                    case '&':
                    case 'and':
                    case 'bitwise-and':
                        newValue = String(existingVariableAsNumber & oldValue);
                        break;
                    case '|':
                    case 'or':
                    case 'bitwise-or':
                        newValue = String(existingVariableAsNumber | oldValue);
                        break;
                    case '^':
                    case 'xor':
                    case 'bitwise-xor':
                        newValue = String(existingVariableAsNumber ^ oldValue);
                        break;
                    case '**':
                    case 'exp':
                    case 'exponentiation':
                        newValue = String(existingVariableAsNumber ** oldValue);
                        break;
                }
            }
            (scope === 'script' ? currentScript : vn).setVariable(name as string,
                deleteVariable ? null : (newValue ?? this.textContent?.trim() ?? null));
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

    get operator(): string | null {
        return this.getAttribute('operator');
    }

    set operator(value: string | null) {
        if (value === null) this.removeAttribute('operator');
        else this.setAttribute('operator', value);
    }

    get scope(): string | null {
        return this.getAttribute('scope');
    }

    set scope(value: string | null) {
        if (value === null) this.removeAttribute('scope');
        else this.setAttribute('scope', value);
    }

    get deleteVariable(): boolean {
        return this.hasAttribute('delete-attr');
    }

    set deleteVariable(value: boolean) {
        setBooleanAttribute(this, 'delete-attr', value);
    }
}

/**
 * Conditional branching container.
 *
 * Children are evaluated in order:
 * - `<vn-and>`/`<vn-or>`/`<vn-not>`: Update accumulator (starts as true for AND/OR, false for NOT)
 * - `<vn-script>`: Executes if accumulator is true, then resets accumulator to true
 * - `<vn-else>`: Executes ONLY if no script has run yet in this VNIf
 *
 * @example
 * <vn-if>
 *   <vn-and operator="equals" variable-left="hp" value-right="0"></vn-and>
 *   <vn-script>You died!</vn-script>
 *   <vn-and operator="greater-than" variable-left="score" value-right="100"></vn-and>
 *   <vn-script>High score!</vn-script>
 *   <vn-else>Game continues...</vn-else>
 * </vn-if>
 *
 * @attribute evaluation-type - "run-all" executes all matching branches, otherwise stops at first match
 * @warning these only allow basic operations. to do anything mildly complex use {@link VNEvent} and javascript.
 */
export class VNIf extends VNExecutableTag {
    async vnExecute(vn: VNViewBox, _currentScript: VNScript): Promise<void> {
        let currentElement = this.firstElementChild,
            value = true, anythingRan = false;
        if (currentElement) do {
            const logical = (currentElement as any).logical;
            if (logical) {
                value = (currentElement as any).executeLogic(logical, value, vn);
            } else if (currentElement instanceof VNElse) {
                if (!anythingRan) await currentElement.run(vn);
                if (this.evaluationType !== 'run-all') return;
            } else if (currentElement instanceof VNScript) {
                if (value) await currentElement.run(vn);
                anythingRan = true;
                // Inside vnExecute method:
                value = true; // Reset accumulator for next condition block
                // IMPORTANT: Each <vn-script> (or other executable) gets a fresh accumulator.
                // Without this reset, a previous false would cascade through remaining OR conditions.
                if (this.evaluationType !== 'run-all') return;
            }
        } while ((currentElement = currentElement.nextElementSibling));
    }

    get evaluationType(): string | null {
        return this.getAttribute('evaluation-type');
    }

    set evaluationType(value: 'run-one' | 'run-all' | null) {
        if (value === null) this.removeAttribute('evaluation-type');
        else this.setAttribute('evaluation-type', value);
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

class VNElse extends VNScript {
    override variablesAllowed = false;
}

class VNWait extends VNExecutableTag {
    vnExecute(_vn: VNViewBox, _currentScript: VNScript): Promise<unknown | void> | unknown | void {
        const {duration} = this;
        if (typeof duration === 'number') {
            return new Promise(resolve => void setTimeout(resolve, duration));
        }
    }

    /**
     * get the duration in milliseconds
     */
    get duration(): number | null {
        const duration = this.getAttribute('duration');
        if (duration === null) return null;
        return +duration;
    }

    /**
     * set a duration in milliseconds
     */
    set duration(value: number | null) {
        if (value === null) this.removeAttribute('duration');
        else this.setAttribute('duration', `${+value}`);
    }
}

export class VNBranch extends VNInternalExecutableTag {
    async vnExecute(vn: VNViewBox, currentScript: VNScript): Promise<void> {
        // Collect weighted options
        const options: Array<{ option: VNOpt, weight: number }> = [];
        let totalWeight = 0;

        for (const opt of this.querySelectorAll('vn-opt')) {
            const weight = Number(opt.getAttribute('weight')) || 1;
            options.push(Object.freeze({option: opt as VNOpt, weight}));
            totalWeight += weight;
        }
        const selected = await vnRandomWeighted<VNOpt>(this, options);

        if (this.contains(selected)) selected.vnExecute(vn, currentScript);
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
    'vn-getvar': VNGetVar,
    'vn-setvar': VNSetVar,
    'vn-jumpto': VNJumpTo,
    'vn-branch': VNBranch,
    'vn-event': VNEvent,
    'vn-text': VNText,
    'vn-else': VNElse,
    'vn-wait': VNWait,
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

export async function vnRandomIntEvent(eventTarget: EventTarget, min: number, max: number): Promise<number> {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw RangeError("min or max arent safe integers");
    if (min > max) throw RangeError("min cannot be greater than max");
    const {promise, resolve} = Promise.withResolvers<number>();
    if (eventTarget.dispatchEvent(new CustomEvent("vn-random", {
        detail: Object.freeze({min, max, resolve, eventTarget}),
        cancelable: true, bubbles: true, composed: true,
    }))) resolve(randomInt(min, max));
    return promise.then(Number).then(number => {
        if (number < +min) throw RangeError("the number is less than minimum allowed");
        if (number >= max) throw RangeError("the number is more or equal than maximum allowed");
        if (Number.isSafeInteger(number)) return number;
        throw RangeError("the number is not a safe integer");
    });
}

export async function vnRandomWeighted<T>(eventTarget: EventTarget, options: Array<{
    option: T, weight: number
}>): Promise<T> {
    const totalWeight = options.reduce((prev, curr) => prev + curr.weight, 0),
        {promise, resolve, reject} = Promise.withResolvers<T>();
    if (Number.isSafeInteger(totalWeight)) {
        if (eventTarget.dispatchEvent(new CustomEvent("vn-random-weighted", {
            detail: Object.freeze({options, resolve, eventTarget}),
            cancelable: true, bubbles: true, composed: true,
        }))) {
            let random = await vnRandomIntEvent(eventTarget, Number(), totalWeight);
            let selected: T | null = null;
            for (const {option, weight} of options) {
                random -= weight;
                if (random <= 0) {
                    selected = option;
                    break;
                }
            }
            if (selected !== null) resolve(selected);
            else reject(TypeError('no suitable found'));
        }
    } else reject(RangeError('totalWeight isnt a safe integer, did you use floats or non numeric strings?'));
    return promise;
}

// For integer random (since vnRandomIntEvent implies integer)
function randomInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw RangeError("min or max arent safe integers");
    return Math.floor(Math.random() * (max - min)) + min;
}
