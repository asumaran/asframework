# Closing the Loop: JSX-Based UI Construction in a Signal-Reactive Framework

This project is a tangible answer to the question: *"How would you build a front-end framework from scratch?"*

The [original proposal](https://gist.github.com/asumaran/547979087194ce35458ed323d6a28f91) focused on a fine-grained reactive core using **Signals**, inspired by Solid.js. The key idea was to avoid a Virtual DOM and instead update DOM nodes directly when state changes, achieving surgical precision and `O(1)` update complexity.

A follow-up question rightly pointed out a gap: **how is the UI initially constructed?**

This working demo answers that by bridging the developer experience of **JSX** with the performance of a **compile-time, signal-based engine**. This document walks through that entire process.

---

## The Core Philosophy: Compile JSX to Signals

Instead of interpreting JSX at runtime like React, this framework uses a compiler (`babel-plugin-jsx-dom-expressions`) to transform it at build time.

*   **You write:** Familiar, declarative JSX components.
*   **The compiler creates:** Highly-optimized JavaScript that makes direct, efficient calls to a tiny runtime library.
*   **The runtime:** Uses the reactive core (Signals, Effects) to create real DOM nodes and bind them directly to your state.

Let's follow the journey of a simple `<Counter />` component.

---

## Part 1: Writing the Component

We start with code that feels like React but has a key difference: `count` is not a value, but a "getter" function. You call `count()` to get its value. This is the heart of the Signal pattern.

```jsx
// State is defined using our reactive primitive
const [count, setCount] = createSignal(0);

// The component is just a function that returns DOM nodes via JSX
const Counter = () => (
  <div>
    <h1>Count: {count()}</h1>
    <button onClick={() => setCount(count() + 1)}>+</button>
  </div>
);

// We render it into the DOM
render(() => <Counter />, document.getElementById('app'));
```

---

## Part 2: The Magic of Compilation

This is where the VDOM is eliminated. The compiler receives the JSX and outputs optimized DOM instructions. It's smart enough to separate static and dynamic parts.

Consider this line:
`<h1>Count: {count()}</h1>`

The compiler sees that "Count: " is static and `{count()}` is dynamic. It doesn't generate `React.createElement`. Instead, it generates this:

```javascript
// 1. Create a <template> for the static parts (parsed only once)
const _tmpl$ = template(`<h1>Count: </h1>`);

// 2. In the component, clone the template to get a real <h1>
const h1_element = _tmpl$.cloneNode(true);

// 3. Bind the dynamic part (the signal) to the element
insert(h1_element, count); // `count` is the getter function
```

This approach is incredibly efficient:
*   **Template Caching:** The static HTML (`<h1>Count: </h1>`) is parsed from a string only **once** per application load, not on every render.
*   **Cheap Instantiation:** Creating new elements is a simple `cloneNode()` call, which is much faster than re-creating elements from scratch.
*   **Direct Binding:** There is no diffing. The `insert` function knows exactly where to put the dynamic value and how to update it.

---

## Part 3: The Runtime - Making it Interactive

The compiled code relies on a minimal runtime (`dom.js` and `reactive.js`) to function. The most important runtime function is `insert()`.

Let's look at what `insert(h1_element, count)` does under the hood.

1.  It checks if the `accessor` (`count`) is a function. It is, so it knows this is a reactive binding.
2.  It creates an `Effect`. An `Effect` is a wrapper that re-runs a function whenever a Signal read inside it changes.
3.  **On its first run**, the Effect:
    a. Calls `count()`. This reads the signal, automatically subscribing this Effect to any future changes.
    b. Creates a new Text Node with the value (e.g., `document.createTextNode('0')`).
    c. Appends this text node to the `<h1>` element. The DOM is now `<h1>Count: 0</h1>`.
4.  **When `setCount(1)` is called later**:
    a. The `count` Signal notifies all its subscribers.
    b. Our `Effect` is a subscriber, so it runs its function again.
    c. It calls `count()` again, which now returns `1`.
    d. It updates the `textContent` of the *exact same Text Node* it created earlier. **This is the only DOM operation that occurs.**

This is the "surgically precise" update. The system doesn't need to check the `<h1>` or any other part of the DOM. It updates exactly what changed, and nothing else.

### Runtime Details

The compiled code uses a minimal runtime (`~3KB`) that handles:

#### 3.1 Template Caching

The `<template>` element parses HTML once and is cached in a Map. The function returns a **cloning function**, not the node directly. Each component instance calls this function to get a fresh clone. You can see the implementation in [`src/framework/dom.js`](https://github.com/asumaran/asframework/blob/main/src/framework/dom.js#L10-L19).

#### 3.2 Reactive Insertion

This is the core of dynamic content binding. The `insert()` function:

*   Takes a `parent` DOM element, an `accessor` (which can be a static value or a Signal getter function), and an optional `marker` (for precise placement).
*   If `accessor` is a function (a Signal getter), it creates a `createEffect` internally. This effect reads the Signal, creates a `TextNode` (on first run), and updates its `textContent` on subsequent runs.
*   The `TextNode` reference is kept in a closure, allowing surgical updates without re-querying the DOM.

You can review the complete `insert` function and other DOM helpers in the runtime file: [`src/framework/dom.js`](https://github.com/asumaran/asframework/blob/main/src/framework/dom.js).

---

## Building Blocks of Reactivity

The reactive core (`reactive.js`) is built on a few fundamental primitives.

| Primitive | Role | Analogy |
| :--- | :--- | :--- |
| **`createSignal`** | Holds state. | A single cell in a spreadsheet. |
| **`createEffect`** | Listens to Signals and produces side-effects (like updating the DOM). | A script that runs when a spreadsheet cell changes. |
| **`createComputed`**| Listens to Signals and derives a new, readable Signal. | A spreadsheet cell with a formula (`=A1*B1`). |

`createComputed` is particularly powerful for creating derived state that is also reactive, without cluttering your components with effects. It only re-calculates its value when its dependencies change.

```jsx
const [price, setPrice] = createSignal(100);
// priceWithTax is a read-only Signal that automatically updates when 'price' changes.
const priceWithTax = createComputed(() => price() * 1.16);

// In JSX, you can just read it like any other signal:
<p>Total: {priceWithTax()}</p>
```

You can see the full implementation, which includes an internal Signal and an Effect to track dependencies, in [`src/framework/reactive.js`](https://github.com/asumaran/asframework/blob/main/src/framework/reactive.js#L112-L166).

---

## Why This Architecture? A Comparison

This compiler-first, signal-based approach offers a different set of trade-offs compared to the popular Virtual DOM model.

| Aspect | Virtual DOM (React) | Compiled Signals (This Demo) |
| :--- | :--- | :--- |
| **Update Mechanism** | Compares a VDOM tree against a new one and patches the DOM. | A Signal directly notifies the specific DOM element that needs to change. |
| **Update Cost** | `O(n)` where `n` is the number of components in the subtree. | `O(1)`. The update cost is constant, regardless of component size. |
| **Memory** | Holds a complete copy of the virtual DOM tree in memory. | Holds a graph of signal-to-effect subscriptions in memory. |
| **Initial Render** | Creates VDOM nodes, then creates real DOM nodes. | The compiler creates optimized instructions to build the DOM directly. |
| **Developer Tools** | Excellent tooling to inspect the VDOM tree. | Debugging can be more direct (it's just functions and DOM nodes). |

---

## Implementation Pitfalls & Known Limitations

Building a reactive system from scratch comes with subtle challenges. Here are some of the known issues and mitigation strategies implemented or considered in this demo:

### 1. Hot Module Replacement (HMR) Granularity

While runtime updates are surgically precise (only affected text nodes change), **HMR during development re-creates the entire component DOM tree**. This is because:

1.  Component functions re-execute on HMR
2.  `template().cloneNode()` creates fresh DOM nodes
3.  New Effects are created, old ones disposed

**Current mitigation:** The demo uses the store pattern - Signals are defined in a separate module that doesn't receive HMR updates:

```javascript
// store.js - This module doesn't get HMR updates
import { createSignal } from './framework/reactive.js';

export const [count, setCount] = createSignal(0);
export const [name, setName] = createSignal('World');
```

```javascript
// main.jsx - Imports from store, accepts HMR
import { count, setCount, name, setName } from './store.js';

// ... component code ...

if (import.meta.hot) {
  import.meta.hot.accept();
}
```

This way, Signal instances persist across HMR updates while the component DOM gets re-created with the current values.

### 2. Reactive System Implementation Pitfalls

When implementing the reactive primitives, several subtle bugs can cause infinite loops or crashes. These are crucial details for robust framework development, and their solutions are implemented in the current codebase:

*   **Subscriber Iteration:** When a Signal notifies its subscribers, one must iterate over a *copy* of the subscriber set. Iterating over the live set can lead to unpredictable behavior if an effect modifies subscriptions during its execution. [See the fix in `Signal.set()`](https://github.com/asumaran/asframework/blob/main/src/framework/reactive.js#L26-L30).

*   **Infinite Loops in `Computed`:** A `Computed` value that is re-evaluating can trigger effects that read from it, causing a re-entrancy loop. This is prevented by using a `computing` flag to break the cycle. [See the re-entrancy guard](https://github.com/asumaran/asframework/blob/main/src/framework/reactive.js#L131-L132).

*   **Effect Cleanup Validation:** Effects can return a cleanup function. The implementation must validate that the return value is actually a function before attempting to call it. [See the type check in `Effect.run()`](https://github.com/asumaran/asframework/blob/main/src/framework/reactive.js#L70).

---

## Core Trade-Offs & Future Considerations

No architecture is perfect. This proof-of-concept, while performant, highlights several challenges that a production-grade framework would need to solve. Acknowledging these is key to understanding the design trade-offs and potential avenues for future enhancement.

#### 1. High CPU Usage from Redundant Computations (The "Diamond Problem")
The current reactive system is **synchronous and un-batched**. When multiple Signals that are dependencies of the same `Computed` value are updated in sequence, the `Computed` will re-evaluate multiple times, causing redundant CPU work.

**Future Improvement:** Implement a **batching scheduler**. Signal setters would not trigger effects immediately. Instead, they would mark dependencies as "dirty" and enqueue an update. The scheduler would then run once at the end of the synchronous tick, processing all changes and ensuring each `Computed` or `Effect` runs only once with the latest state.

#### 2. Memory Leaks from Undisposed Effects
For every `{value}` in the JSX, an `Effect` is created. If that part of the UI is removed, the `Effect` currently remains in memory—a memory leak. They continue to subscribe to Signals and execute, wasting CPU and preventing garbage collection.

**Future Improvement:** Introduce a **disposal or ownership mechanism**. The framework would need to track the hierarchy of components and their associated effects. When a component is "unmounted", it would be responsible for calling a `.destroy()` method on all its child effects, properly unsubscribing them from all Signals and allowing the Garbage Collector to reclaim the memory.

#### 3. The Fine-Grained Memory Model
This architecture trades upfront memory (to store the fine-grained subscription graph) for `O(1)` update performance. In UIs with tens of thousands of dynamic elements, this could lead to high memory usage.

**Future Consideration:** The common solution for very large, dynamic lists in signal-based frameworks is **list virtualization**, where only the elements currently visible on screen are actually rendered and tracked.

---

## Summary

By combining a familiar JSX authoring experience with a powerful build-time compiler, this architecture delivers on the original proposal's goal: a truly reactive system that bypasses the overhead of a Virtual DOM, enabling surgical, `O(1)` updates directly to the DOM.

It demonstrates a deep appreciation for the trade-offs in modern front-end design, prioritizing runtime performance while acknowledging the complexities of memory management and update scheduling.