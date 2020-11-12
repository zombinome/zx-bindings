import { ZX } from './zx-bindings.js';

class DemoComponent {
    constructor(htmlElement) {
        this.showItems = true;

        this.items = [];

        this.element = htmlElement;
        ZX.bind(htmlElement, this);
        this.updateUI();
    }

    addItem() {
        this.items.push({ text: '' });
        this.updateUI();
    }

    removeItem(item) {
        this.items = this.items.filter(x => x !== item);
        this.updateUI();
    }

    /**
     *
     * @param {Event}  eventArgs
     * @param item
     */
    onTextEntered(eventArgs, item) {
        item.text = eventArgs.target.value;
        this.updateUI();
    }

    updateUI() {
        ZX.update(this.element);
    }
}

const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', () => {
    const element = document.getElementById('example-component');
    element.style.display = '';
    const component = new DemoComponent(element);

    startBtn.style.display = 'none';
});
