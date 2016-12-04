// Taken from https://github.com/lodash/lodash/blob/92359257c1f566b655a417498086e145e4e3db1c/vendor/underscore/underscore.js#L810-L849
function throttle (func, wait, options) {
  let timeout, context, args, result
  let previous = 0
  if (!options) options = {}

  const later = function () {
    previous = options.leading === false ? 0 : Date.now()
    timeout = null
    result = func.apply(context, args)
    if (!timeout) context = args = null
  }

  const throttled = function () {
    const now = Date.now()
    if (!previous && options.leading === false) previous = now
    const remaining = wait - (now - previous)
    context = this
    args = arguments

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      previous = now
      result = func.apply(context, args)
      if (!timeout) context = args = null
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining)
    }

    return result
  }

  throttled.cancel = function () {
    clearTimeout(timeout)
    previous = 0
    timeout = context = args = null
  }

  return throttled
}

// Returns true if it is a DOM element
// taken from http://stackoverflow.com/a/384380/3580261
function isElement (o) {
  return (
    typeof window.HTMLElement === 'object'
      ? o instanceof window.HTMLElement // DOM2
      : o && typeof o === 'object' && o !== null && o.nodeType === 1 && typeof o.nodeName === 'string'
  )
}

// taken from http://stackoverflow.com/a/7238344/3580261
function isNodeList (nodes) {
  const stringRepr = Object.prototype.toString.call(nodes)

  return typeof nodes === 'object' &&
      /^[object (HTMLCollection|NodeList|Object)]$/.test(stringRepr) &&
      (typeof nodes.length === 'number') &&
      (nodes.length === 0 || (typeof nodes[0] === 'object' && nodes[0].nodeType > 0))
}

/**
* - Registry -
*
* Maintain a list of elements, a subset which currently pass
* a given criteria, and fire events when elements move in or out.
*/

class InViewRegistry {
  constructor (elements, options) {
    this.options = options
    this.elements = elements
    this.current = []
    this.handlers = { enter: [], exit: [] }
    this.singles = { enter: [], exit: [] }
  }

  /**
  * Check each element in the registry, if an element
  * changes states, fire an event and operate on current.
  */
  check () {
    this.elements.forEach((el) => {
      let passes = this.options.test(el, this.options)
      let index = this.current.indexOf(el)
      let current = index > -1
      let entered = passes && !current
      let exited = !passes && current

      if (entered) {
        this.current.push(el)
        this.emit('enter', el)
      }

      if (exited) {
        this.current.splice(index, 1)
        this.emit('exit', el)
      }
    })
    return this
  }

  /**
  * Register a handler for event, to be fired
  * for every event.
  */
  on (event, handler) {
    this.handlers[event].push(handler)
    return this
  }

  /**
  * Register a handler for event, to be fired
  * once and removed.
  */
  once (event, handler) {
    this.singles[event].unshift(handler)
    return this
  }

  /**
  * Emit event on given element. Used mostly
  * internally, but could be useful for users.
  */
  emit (event, element) {
    while (this.singles[event].length) {
      this.singles[event].pop()(element)
    }
    let length = this.handlers[event].length
    while (--length > -1) {
      this.handlers[event][length](element)
    }
    return this
  }

}

/**
* Check whether an element is in the viewport by
* more than offset px.
*/
function inViewport (element, options) {
  const { top, right, bottom, left, width, height } = element.getBoundingClientRect()

  const intersection = {
    t: bottom,
    r: window.innerWidth - left,
    b: window.innerHeight - top,
    l: right
  }

  const threshold = {
    x: options.threshold * width,
    y: options.threshold * height
  }

  return intersection.t > (options.offset.top + threshold.y) &&
    intersection.r > (options.offset.right + threshold.x) &&
    intersection.b > (options.offset.bottom + threshold.y) &&
    intersection.l > (options.offset.left + threshold.x)
}

/**
* Create and return the inView function.
*/
const inview = () => {
  /**
  * Fallback if window is undefined.
  */
  if (typeof window === 'undefined') return

  /**
  * How often and on what events we should check
  * each registry.
  */
  const interval = 100
  const triggers = ['scroll', 'resize', 'load']

  /**
  * Maintain a hashmap of all registries, a history
  * of selectors to enumerate, and an options object.
  */
  let selectors = { history: [] }
  let options = { offset: {}, threshold: 0, test: inViewport }

  /**
  * Check each registry from selector history,
  * throttled to interval.
  */
  const check = throttle(() => {
    selectors.history.forEach((selector) => {
      selectors[selector].check()
    })
  }, interval)

  /**
  * For each trigger event on window, add a listener
  * which checks each registry.
  */
  triggers.forEach((event) => {
    return window.addEventListener(event, check)
  })

    /**
    * If supported, use MutationObserver to watch the
    * DOM and run checks on mutation.
    */
  if (window.MutationObserver) {
    window.addEventListener('DOMContentLoaded', () => {
      new window.MutationObserver(check).observe(document.body, { attributes: true, childList: true, subtree: true })
    })
  }

    /**
    * The main interface. Take a selector and retrieve
    * the associated registry or create a new one.
    */
  let control = (selector) => {
    // Get an up-to-date list of elements.
    let elements
    // extended API here
    if (typeof selector === 'string') {
      elements = [].slice.call(document.querySelectorAll(selector))
    } else if (isElement(selector)) {
      elements = [ selector ]
    } else if (isNodeList(selector)) {
      elements = [].slice.call(selector)
    } else {
      return
    }
      // If the registry exists, update the elements.
    if (selectors.history.indexOf(selector) > -1) {
      selectors[selector].elements = elements
    } else {
        // If it doesn't exist, create a new registry.
      selectors[selector] = new InViewRegistry(elements, options)
      selectors.history.push(selector)
    }

    return selectors[selector]
  }

    /**
    * Mutate the offset object with either an object
    * or a number.
    */
  control.offset = (o) => {
    if (o === undefined) return options.offset
    const isNum = (n) => {
      return typeof n === 'number'
    }

    ['top', 'right', 'bottom', 'left'].forEach(isNum(o)
      ? (dim) => {
        const ret = options.offset[dim] = o
        return ret
      }
      : (dim) => {
        const ret = isNum(o[dim]) ? options.offset[dim] = o[dim] : null
        return ret
      }
    )
    return options.offset
  }

  /**
  * Set the threshold with a number.
  */
  control.threshold = (n) => {
    const ret = typeof n === 'number' && n >= 0 && n <= 1
      ? options.threshold = n
      : options.threshold
    return ret
  }

  /**
  * Use a custom test, overriding inViewport, to
  * determine element visibility.
  */
  control.test = (fn) => {
    const ret = typeof fn === 'function'
      ? options.test = fn
      : options.test
    return ret
  }

  /**
  * Add proxy for test function, set defaults,
  * and return the interface.
  */
  control.is = (el) => {
    return options.test(el, options)
  }
  control.offset(0)

  return control
}

module.exports = inview
