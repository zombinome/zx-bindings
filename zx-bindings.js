const $context = Symbol('bindingContext');

//Expression compilation
function generateFunctionForExpression(expr, knownVariables, resultTransform) {
    const regExpr = /(?<p>\.\s*)?(?<t>[_\w$][_\w\d$]*)(?<m>\s*\()?/g;
    const modelDeclarations = [];
    const kvDeclarations = [];
    const exprTransformed = expr.replace(regExpr, function(match, p, t, m) {
        if (p) {
            return match;
        }

        if (knownVariables.includes(t)) {
            if (!kvDeclarations.includes(t)) {
                kvDeclarations.push(t);
            }

            return `${p || ''}$$v.${t}${m || ''}`;
        }

        if (!modelDeclarations.includes(t)) {
            modelDeclarations.push(t);
        }

        return `${p || ''}$$m.${t}${m || ''}`;
    });

    const varsBlock = modelDeclarations.map(varName => `let ${varName} = $$m.${varName};`).join('\n');
    const knownVarsBlock = kvDeclarations.map(varName => `let ${varName} = $$v.${varName};`).join('\n');

    return new Function('$$m', '$$v', varsBlock + '\n' + knownVarsBlock + '\n' + resultTransform(exprTransformed));
}

function generateFunctionForInvokeExpression(expr, knownVariables, eventArg) {
    const regExpr = /(?<p>\.\s*)?(?<t>[_\w$][_\w\d$]*)(?<m>\s*\()?/g;
    const modelDeclarations = [];
    const kvDeclarations = [];
    const exprTransformed = expr.replace(regExpr, function (match, p, t, m) {
        if (p) {
            return match;
        }

        if (t === eventArg) {
            return match;
        }

        if (knownVariables.includes(t)) {
            if (!kvDeclarations.includes(t)) {
                kvDeclarations.push(t);
            }

            return `${p || ''}$$v.${t}${m || ''}`;
        }

        if (!modelDeclarations.includes(t)) {
            modelDeclarations.push(t);
        }

        return `${p || ''}$$m.${t}${m || ''}`;
    });

    const varsBlock = modelDeclarations.map(varName => `let ${varName} = $$m.${varName};`).join('\n');
    const knownVarsBlock = kvDeclarations.map(varName => `let ${varName} = $$v.${varName};`).join('\n');

    return new Function('$$m', '$$v', eventArg, varsBlock + '\n' + knownVarsBlock + '\n' + exprTransformed);
}

const letKeyword = 'let ';
const indexByKeyword = 'index by ';
const _indexKeyword = '$index';
const _itemKeyword = '$item';
function defaultCollectionGetter(model) { return model; }

/**
 * @param expr {string}
 * @param scopedVariableNames {string[]}
 */
function parseForExpression(expr, scopedVariableNames) {
    const modifiedScopedVariableNames = Array.from(scopedVariableNames);
    if(!modifiedScopedVariableNames.includes(_itemKeyword)) {
        modifiedScopedVariableNames.push(_itemKeyword);
    }

    if (!modifiedScopedVariableNames.includes(_indexKeyword)) {
        modifiedScopedVariableNames.push(_indexKeyword);
    }

    const tokens = expr.split(';').map(x => x.trim());
    const itemDeclaration = tokens.find(x => x.startsWith(letKeyword));
    let collectionGetter = defaultCollectionGetter;
    let itemExpr = _itemKeyword;
    if (itemDeclaration) {
        const match = /let\s+(?<is>[_$\w][_$\w\d]*)\s+of\s+(?<cs>[_$\w].*)/.exec(itemDeclaration);
        if (match && match.groups && match.groups.is && match.groups.cs) {
            itemExpr = match.groups.is;
            collectionGetter = generateFunctionForExpression(match.groups.cs, modifiedScopedVariableNames, expr => `return ${expr};`);
        }
    }

    if (!modifiedScopedVariableNames.includes(itemExpr)) {
        modifiedScopedVariableNames.push(itemExpr);
    }
    const itemVariable = itemExpr === _itemKeyword ? null : itemExpr;

    const indexDeclaration = tokens.find(x => x.startsWith(indexByKeyword));
    const indexExpr = indexDeclaration ? indexDeclaration.substring(indexByKeyword.length).trim() : _indexKeyword;
    let itemIdentityIsIndex = true;
    let itemIdentityGetter = null;
    if (indexExpr !== _indexKeyword) {
        itemIdentityIsIndex = false;
        itemIdentityGetter = generateFunctionForExpression(indexExpr, modifiedScopedVariableNames, expr => `return ${expr};`)
    }

    return {
        collectionGetter,
        itemVariable,
        itemIdentityIsIndex,
        itemIdentityGetter,
        scopedVariableNames: modifiedScopedVariableNames
    };
}

// Binding
class BindingContext {
    /**
     * @param htmlElement {Element}
     * @param model {*}
     * @param scopedVariables {Object.<string, *>}
     * @param parent {BindingContext}
     */
    constructor(htmlElement, model, scopedVariables, parent) {
        /** @type {Element} */ this.element = htmlElement;
        this.model = model;

        /** @type {PropertyBinding[]}  */ this.propertyBindings = [];
        /** @type {DirectiveBinding[]} */ this.directiveBindings = [];
        /** @type {EventBinding[]}     */ this.eventBindings = [];
        /** @type {Object.<string, *>} */ this.scopedVariables = scopedVariables || {};

        /** @type {BindingContext[]}   */ this.children = [];
        ///** @type {BindingContext}     */ this.parent = parent || null;
    }
}

/**
 * @param element {Element}
 * @param model {*}
 * @param currentContext {BindingContext}
 * @param parentContext {BindingContext}
 * @param scopedVariables {string[]}
 * @return {BindingContext}
 */
function bindInternal(element, model, scopedVariables, currentContext, parentContext) {
    const existingBindings = findBindings(element);
    const config = ZX.config;


    const bindingKeys = Object.keys(existingBindings);
    const hasSlotBinding = bindingKeys.includes(ZX.config.componentSlotName);

    let bindChildren = element.childElementCount > 0 && !hasSlotBinding;
    if (bindingKeys.length > 1 || bindingKeys.length === 1 && !hasSlotBinding) {
        currentContext = element[$context] = currentContext || new BindingContext(element, model, {}, parentContext);
        if (parentContext) {
            parentContext.children.push(currentContext);
        }

        for (let bindingName of bindingKeys) {
            const expr = existingBindings[bindingName];
            if (config.propertyBinders[bindingName]) {
                const binding = new config.propertyBinders[bindingName](currentContext, expr, scopedVariables);
                currentContext.propertyBindings.push(binding)
            }
            else if (config.directives[bindingName]) {
                const binding = new config.directives[bindingName](currentContext, expr, scopedVariables);
                currentContext.directiveBindings.push(binding);
            }
            else if (config.eventBinders[bindingName]) {
                const binding = config.eventBinders[bindingName](currentContext, expr, scopedVariables);
                currentContext.eventBindings.push(binding);
            }

            if (bindingName === config.componentSlotName) {
                bindChildren = false;
            }
        }

        if (currentContext.directiveBindings.length > 1) {
            currentContext.directiveBindings.sort((a, b) => a.weight - b.weight);
        }
    }

    if (bindChildren) {
        for (let childElement of element.children) {
            bindInternal(childElement, model, scopedVariables, null, currentContext || parentContext);
        }
    }
}

/**
 * @param context {BindingContext}
 * @param scopedVariables {Object.<string, *>}
 */
function updateInternal(context, scopedVariables) {
    context.scopedVariables = scopedVariables;
    for (let directive of context.directiveBindings) {
        if (!directive.execute(context)) {
            return;
        }
    }

    for (let propertyBinding of context.propertyBindings) {
        propertyBinding.execute(context);
    }

    for (let childContext of context.children) {
        updateInternal(childContext, scopedVariables);
    }
}

// Bindings
/**
 * @implements {PropertyBinding}
 */
class InnerTextBinding {
    /**
     * @param context {BindingContext}
     * @param expr {string}
     * @param knownVariables {string[]}
     */
    constructor(context, expr, knownVariables) {
        this.value = generateFunctionForExpression(expr, knownVariables, expr => `return ${expr};`);
    }

    execute(context) {
        context.element.innerText = this.value(context.model, context.scopedVariables);
    }
}

// Directives
/**
 * @implements {DirectiveBinding}
 */
class IfDirective {
    weight = 5;

    /**
     * @param context {BindingContext}
     * @param expr {string}
     * @param knownVariables {string[]}
     */
    constructor(context, expr, knownVariables) {
        this.check = generateFunctionForExpression(expr, knownVariables, expr => `return !!(${expr});`);
        this.anchor = document.createComment("IF: " + expr);
        context.element.parentElement.insertBefore(this.anchor, context.element)
    }

    /**
     * @public
     * @param context
     * @return {boolean}
     */
    execute(context) {
        if (this.check(context.model, [])) {
            const next = this.anchor.nextSibling;
            if (next) {
                this.anchor.parentElement.insertBefore(context.element, next);
            }
            else {
                this.anchor.parentNode.appendChild(context.element);
            }

            return true;
        }
        else {
            context.element.remove();
            return false;
        }
    }

    dispose(context) {
        this.anchor.remove();
        this.anchor = null;
    }
}

/**
 * @param htmlNodes {NodeList}
 * @param identity {*}
 * @param rootContext {BindingContext}
 * @constructor
 */
function ForItem(htmlNodes, identity, rootContext) {
    /** @type {Node[]} */ this.htmlNodes = [];
    /** @type {*} */ this.identity = identity;
    /** @type {BindingContext} */ this.rootContext = rootContext;
}

/**
 * @implements {DirectiveBinding}
 */
class ForDirective {
    weight = 10;

    /**
     * @param context {BindingContext}
     * @param expr {string}
     * @param knownVariables {string[]}
     */
    constructor(context, expr, knownVariables) {
        this.templateElements = document.createDocumentFragment();
        DocumentFragment.prototype.append.apply(this.templateElements, context.element.childNodes);

        this.cfg = parseForExpression(expr, knownVariables);
        /** @type {ForItem[]} */ this.childItems = [];
    }

    execute(context) {
        /** @type {*[]} */ const collection = this.cfg.collectionGetter(context.model);
        let changeLayout = false;
        let index = 0;
        for (; index < collection.length; index++) {
            const modelItem = collection[index];
            const identity = this.cfg.itemIdentityIsIndex ? index : this.cfg.itemIdentityGetter(modelItem);

            // Adding new elements
            if (index >= this.childItems.length) {
                this.childItems[index] = this.createChildContext(context, modelItem, identity);
                changeLayout = true;
            }
            else {
                // Looking for existing element
                // General idea is that after all moves, items that should be deleted will be moved in the end of array
                const otherIndex = this.childItems.findIndex(x => x.identity === identity);
                if (otherIndex >= 0) {
                    if (otherIndex !== index) { // If current item position changed from last update
                        const temp = this.childItems[index];
                        this.childItems[index] = this.childItems[otherIndex];
                        this.childItems[otherIndex] = temp;
                    }

                    changeLayout = true;
                }
                else if (otherIndex < 0) { // This is new item that should be added
                    this.childItems[this.childItems.length] = this.childItems[index];
                    this.childItems[index] = this.createChildContext(context, modelItem, identity);

                    changeLayout = true;
                }
            }

            /** @type {ForItem} */ const childItem = this.childItems[index];
            childItem.rootContext.model = modelItem;
            const sv =  this.buildScopedVariables(childItem, index, context);
            updateInternal(childItem.rootContext, sv);
        }

        const elementsToRemove = [];
        for (; index < this.childItems.length; index++) {
            const childItem = this.childItems[index];
            for (let node of childItem.htmlNodes) {
                elementsToRemove.push(node);
            }

            childItem.rootContext.children.forEach(ZX.unbind);
        }
        if (elementsToRemove.length) {
            const fragment = document.createDocumentFragment();
            DocumentFragment.prototype.append.apply(fragment, elementsToRemove);
            fragment.innerHTML = '';
        }

        this.childItems.length = collection.length;
        if (changeLayout) { // Restructuring UI layout
            const allElements = [];
            for (/** @type {ForItem} */ let item of this.childItems) {
                for (let node of item.htmlNodes) {
                    allElements.push(node);
                }
            }

            const fragment = document.createDocumentFragment();
            DocumentFragment.prototype.append.apply(fragment, allElements);
            context.element.append(fragment);
        }

        return true;
    }

    dispose(context) {
        this.childItems.forEach(item => ZX.unbind(item.rootContext));
        this.childItems = null;
    }

    /**
     * @private
     * @param directiveContext {BindingContext}
     * @param itemModel {*}
     * @param identity {*}
     * @return {ForItem}
     */
    createChildContext(directiveContext, itemModel, identity) {
        const nodes = this.templateElements.cloneNode(true).childNodes;
        const rootContext = new BindingContext(null, itemModel, directiveContext.scopedVariables, null);

        const item = new ForItem(nodes, identity, rootContext);
        for (let node of nodes) {
            item.htmlNodes.push(node);
            if (node.nodeType === Node.ELEMENT_NODE) {
                bindInternal(node, directiveContext.model, this.cfg.scopedVariableNames, null, rootContext);
            }
        }

        return item;
    }

    /**
     * @private
     * @param item {ForItem}
     * @param index {number}
     * @param directiveContext {BindingContext}
     */
    buildScopedVariables(item, index, directiveContext) {
        const scopedVariables = Object.create(directiveContext.scopedVariables);
        scopedVariables[_indexKeyword] = index;
        scopedVariables[_itemKeyword] = item.rootContext.model;
        if (this.cfg.itemVariable) {
            scopedVariables[this.cfg.itemVariable] = item.rootContext.model;
        }

        return scopedVariables;
    }
}

// Event bindings
class EventBinding {
    /**
     * @param event {string}
     * @param context {BindingContext}
     * @param expr {string}
     * @param knownVariables {string[]}
     */
    constructor(event, context, expr, knownVariables) {
        this.event = event;
        this.invoke = generateFunctionForInvokeExpression(expr, knownVariables, '$event');
        this.handleEvent = this.handleEvent.bind(this, context);

        context.element.addEventListener(event, this.handleEvent);
    }

    /**
     * @param context {BindingContext}
     * @param eventArgs {Event}
     */
    handleEvent(context, eventArgs) {
        this.invoke(context.model, context.scopedVariables, eventArgs);
    }

    dispose(context) {
        context.element.removeEventListener(this.event, this.handleEvent);
    }
}

class BindingConfig {
    constructor() {
        this.prefix = 'zx-';

        this.componentSlotName = 'slot';

        this.propertyBinders = {
            'inner-text': InnerTextBinding
        };

        this.directives = {
            'if': IfDirective,
            'for': ForDirective
        };

        this.eventBinders = {
            click: (element, expr, context) => new EventBinding('click', element, expr, context),
            change: (element, expr, context) => new EventBinding('change', element, expr, context)
        };
    }
}

/**
 * @param htmlElement {Element}
 * @returns {string[]}
 */
function findBindings(htmlElement) {
    const result = {};
    for (let attribute of htmlElement.attributes) {
        const name = attribute.name;
        if (name.startsWith(ZX.config.prefix)) {
            result[name.substring(ZX.config.prefix.length)] = attribute.value || '';
        }
    }

    return result;
}


export class ZX {
    static config = new BindingConfig();

    /**
     * Binds model to html element
     * @param element {HTMLElement}
     * @param model {*}
     * @public
     */
    static bind(element, model) {
        const context = element[$context] = new BindingContext(element, model, {}, null);
        bindInternal(element, model, [], context, null);
    }

    /**
     * Unbinds html element from model
     * @param element
     * @public
     */
    static unbind(element) {
        const argIsContext = element.constructor === BindingContext;

        const context = argIsContext ? element : element[$context];
        if (context) {
            context.propertyBindings = [];
            context.eventBindings.forEach(binding => binding.dispose(context));
            context.eventBindings = [];
            context.directiveBindings.forEach(binding => binding.dispose(context));
            context.directiveBindings = [];

            context.children.forEach(ZX.unbind);
            context.element[$context] = null;
            context.element = null;
        }

        if (!argIsContext && !element.attributes[ZX.prefix + ZX.config.componentSlotName]) {
            element.children.forEach(ZX.unbind);
        }
    }

    /**
     * Updates HTML according to model
     * @param element {Element}
     * @public
     */
    static update(element) {
        const context = element[$context];
        if (context) {
            updateInternal(context, context.scopedVariables);
        }
        else {
            for (let childElement of element.children) {
                ZX.update(childElement);
            }
        }
    }
}

/**
 * @interface PropertyBinding
 */

/**
 * @function
 * @name PropertyBinding#execute
 * @param {BindingContext} context
 */

/**
 * @interface DirectiveBinding
 */

/**
 * @function
 * @name DirectiveBinding#execute
 * @param {BindingContext} context
 * @returns {boolean}
 */

/**
 * @function
 * @name DirectiveBinding#dispose
 * @param {BindingContext} context
 */

/**
 * @property DirectiveBinding#weight {number}
 */