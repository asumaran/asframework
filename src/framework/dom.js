import { createEffect } from './reactive.js';

// Re-export effect for the JSX compiler
export { createEffect as effect };

// Template cache
const templateCache = new Map();

/**
 * Creates a template from HTML string.
 * Returns a function that clones the template on each call.
 * Called once per JSX expression at module load time.
 */
export function template(html, isSVG = false) {
  let tpl = templateCache.get(html);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.innerHTML = html;
    templateCache.set(html, tpl);
  }
  // Return a function that clones the template
  return () => tpl.content.firstChild.cloneNode(true);
}

/**
 * Inserts dynamic content into the DOM.
 * If accessor is a function (Signal getter), creates a reactive binding.
 */
export function insert(parent, accessor, marker, initial) {
  if (typeof accessor === 'function') {
    // Create a text node to hold the dynamic value
    // This node persists across updates - only its content changes
    let textNode = null;

    createEffect(() => {
      const value = accessor();

      if (!textNode) {
        // First run: create and append text node
        textNode = document.createTextNode(value ?? '');
        if (marker) {
          parent.insertBefore(textNode, marker);
        } else {
          parent.appendChild(textNode);
        }
      } else {
        // Subsequent runs: update existing text node
        textNode.textContent = value ?? '';
      }
    });
  } else {
    // Static value: just append
    const textNode = document.createTextNode(accessor ?? '');
    if (marker) {
      parent.insertBefore(textNode, marker);
    } else {
      parent.appendChild(textNode);
    }
  }
}

/**
 * Event delegation - registers global handlers for specified events.
 */
const delegatedEvents = new Set();

export function delegateEvents(events) {
  for (const event of events) {
    if (!delegatedEvents.has(event)) {
      delegatedEvents.add(event);
      document.addEventListener(event, (e) => {
        let node = e.target;
        const key = `$$${event}`;

        while (node) {
          const handler = node[key];
          if (handler) {
            handler(e);
            if (e.cancelBubble) return;
          }
          node = node.parentNode;
        }
      });
    }
  }
}

/**
 * Adds event listener to a node.
 * If delegate is true, stores handler for delegation.
 */
export function addEventListener(node, name, handler, delegate) {
  if (delegate) {
    node[`$$${name}`] = handler;
  } else {
    node.addEventListener(name, handler);
  }
}

/**
 * Creates a component instance.
 */
export function createComponent(Component, props) {
  return Component(props || {});
}

/**
 * Renders a component into a container.
 */
export function render(code, container) {
  // Clear the container before rendering to ensure fresh content
  container.textContent = '';
  const result = typeof code === 'function' ? code() : code;
  if (result) {
    container.appendChild(result);
  }
  return () => {
    container.textContent = '';
  };
}

/**
 * Spreads props onto an element.
 */
export function spread(node, props, isSVG, skipChildren) {
  for (const key in props) {
    if (key === 'children') continue;
    const value = props[key];

    if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      addEventListener(node, event, value, false);
    } else if (key === 'class' || key === 'className') {
      node.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else {
      node.setAttribute(key, value);
    }
  }
}

/**
 * Assigns props to an element (alias for spread in simple cases).
 */
export function assign(node, props, isSVG, skipChildren) {
  spread(node, props, isSVG, skipChildren);
}

/**
 * Gets the next marker for insertion.
 */
export function getNextMarker(node) {
  return [node.nextSibling, node.parentNode];
}

/**
 * Runs code with an owner context (simplified - just runs it).
 */
export function runWithOwner(owner, fn) {
  return fn();
}

/**
 * Gets the current owner (simplified - returns null).
 */
export function getOwner() {
  return null;
}
