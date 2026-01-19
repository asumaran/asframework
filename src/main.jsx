import { createComputed } from './framework/reactive.js';
import { render } from './framework/dom.js';
import { count, setCount, name, setName } from './store.js';

// Computed values - recreated on HMR, but that's fine since they derive from persisted signals
const charCount = createComputed(() => name().length);
const doubleCount = createComputed(() => count() * 2);

const App = () => (
  <div>
    {/* Input binding - two-way reactivity */}
    <input
      type="text"
      value={name()}
      onInput={(e) => setName(e.target.value)}
      data-1p-ignore
      placeholder="Enter your name"
    />
    <h1>Hello {name()}!!</h1>
    <p>Characters: {charCount} (computed)</p>

    <hr />

    {/* Counter - auto-increment + manual controls */}
    <h2>Count: {count()}</h2>
    <p>Doubled: {doubleCount} (computed)</p>
    <button onClick={() => setCount(count() + 1)}>+</button>
    <button onClick={() => setCount(count() - 1)}>-</button>
    <button onClick={() => setCount(0)}>Reset</button>
  </div>
);

const container = document.getElementById('app');
container.textContent = '';

render(() => <App />, container);

// Accept HMR updates for this module
if (import.meta.hot) {
  import.meta.hot.accept();
}
