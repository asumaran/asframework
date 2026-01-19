// Tracks which Effect is currently executing, enabling automatic dependency detection
let currentEffect = null;

class Signal {
  constructor(initialValue) {
    this.value = initialValue;
    this.subscribers = new Set();
  }

  get() {
    if (currentEffect) {
      this.subscribers.add(currentEffect);
      currentEffect.dependencies.add(this);
    }
    return this.value;
  }

  set(newValue) {
    if (Object.is(this.value, newValue)) return;
    this.value = newValue;
    // FIX: Copy subscribers before iterating to avoid infinite loops.
    // When an Effect runs, it unsubscribes from all dependencies (clearing them)
    // then re-subscribes during execution. Iterating a live Set while it's
    // being modified can cause unpredictable behavior or infinite loops.
    const subs = [...this.subscribers];
    for (const subscriber of subs) {
      subscriber.run();
    }
  }

  unsubscribe(effect) {
    this.subscribers.delete(effect);
  }
}

class Effect {
  constructor(fn) {
    this.fn = fn;
    this.cleanup = null;
    this.dependencies = new Set();
    this.run();
  }

  run() {
    this.dispose();
    // Clear old subscriptions; they'll be recreated during execution
    // This handles conditional dependencies (e.g., if/else reading different Signals)
    for (const dep of this.dependencies) {
      dep.unsubscribe(this);
    }
    this.dependencies.clear();

    // Support nested Effects by saving/restoring the previous context
    const previousEffect = currentEffect;
    currentEffect = this;
    try {
      const result = this.fn();
      // FIX: Only store cleanup if it's actually a function.
      // Effects can return a cleanup function (e.g., () => clearInterval(id))
      // but they might also return other truthy values accidentally.
      // Without this check, calling this.cleanup() on a non-function crashes.
      this.cleanup = typeof result === 'function' ? result : null;
    } finally {
      currentEffect = previousEffect;
    }
  }

  // Run cleanup before re-execution (e.g., clearInterval, removeEventListener)
  dispose() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
  }

  // Full teardown when Effect is no longer needed
  destroy() {
    this.dispose();
    for (const dep of this.dependencies) {
      dep.unsubscribe(this);
    }
    this.dependencies.clear();
  }
}

// Lazy derived value: consumes Signals like an Effect, but can be read like a Signal
// Only recomputes when dependencies change AND someone reads the value
class Computed {
  constructor(fn) {
    this.fn = fn;
    // Internal Signal stores the cached result and allows others to subscribe
    this.signal = new Signal(undefined);
    // Dirty flag enables lazy evaluation: don't compute until someone reads
    this.dirty = true;
    // Prevents infinite loops when compute() triggers the internal Effect
    this.computing = false;

    // Internal Effect tracks dependencies by running fn()
    // When dependencies change, this Effect re-runs and updates the signal
    this.effect = new Effect(() => {
      // FIX: Prevent infinite loop. Without this check, the following happens:
      // 1. Dependency changes -> this Effect runs
      // 2. fn() executes -> signal.set(result) notifies subscribers
      // 3. If an insert Effect is subscribed to signal, it runs
      // 4. insert Effect reads computed.get() -> dirty is false, returns signal.get()
      // 5. signal.get() re-subscribes insert Effect
      // 6. Back to step 2... but we're still inside signal.set()!
      // The `computing` flag breaks this cycle by skipping re-computation
      // when we're already in the middle of computing.
      if (this.computing) return;

      this.computing = true;
      try {
        // Run fn() to track dependencies AND get the result
        const result = this.fn();
        this.signal.set(result);
        this.dirty = false;
      } finally {
        this.computing = false;
      }
    });
  }

  // Lazy evaluation: only recompute when read and dirty
  get() {
    if (this.dirty) {
      // Recompute outside of any Effect context to avoid subscription issues
      this.computing = true;
      try {
        this.signal.set(this.fn());
        this.dirty = false;
      } finally {
        this.computing = false;
      }
    }
    return this.signal.get();
  }
}

// Public API - functional wrappers
export function createSignal(initialValue) {
  const signal = new Signal(initialValue);
  return [() => signal.get(), (v) => signal.set(v)];
}

export function createEffect(fn) {
  return new Effect(fn);
}

export function createComputed(fn) {
  const computed = new Computed(fn);
  return () => computed.get();
}
