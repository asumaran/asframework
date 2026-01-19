import { createSignal } from './framework/reactive.js';

// Only state that needs to persist across HMR
export const [count, setCount] = createSignal(0);
export const [name, setName] = createSignal('World');

// Interval here to avoid multiple intervals on HMR
setInterval(() => setCount(count() + 1), 1000);
