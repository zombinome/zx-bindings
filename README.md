# zx-bindings
A very small and low-level lib used to create bindings between model and html-dom. A goal was to provide a way do avoid writing tons of spaghetti code to manipulate DOM, and at the same time to allow absolute control of existing DOM without need to write complex plugins and wrappers.

There is no virtual DOM implemented, original DOM is used instead.
There is no automatic change detection created. User should manually call `ZX.update(element)` to update DOM (done intentionally).
Library supports rpoperty bindings, events and directives.
* Property bindings is used to bind model properties to html element. Change of model would be reflected on DOM, but change in DOM does not affect model.
* Event handlers is used to bind model methods to DOM element events
* Directives is used to control if element would be present in DOM.

Currently, only zx-if and zx-for directives are supported.

Library exports global object ZX, with 3 methods: bind, undind and update.

TODO:
1. Add pairs of directives zx-if, zx-ifx and zx-for, zx-forx that would be applied to element/element childred. Needed to avoid useless wrappers things like <ng-contaier /> in angular.
2. Add more bindings.
3. Add parser to calculate expressions and properties
4. Document everything
