import { Dropdown } from 'bootstrap'
import { emojify } from './frontend_helpers'

const DEFAULTS = {
  threshold: 2,
  maximumItems: 5,
  highlightTyped: true,
  highlightClass: 'text-primary',
  label: 'label',
  value: 'value',
  showValue: false,
  showValueBeforeLabel: false,
}

class Autocomplete {
  constructor(field, options) {
    this.field = field
    this.options = { ...DEFAULTS, ...options }
    this.dropdown = null

    field.parentNode.classList.add('dropdown')
    field.setAttribute('data-bs-toggle', 'dropdown')
    field.classList.add('dropdown-toggle')

    const dropdown = ce('<div class="dropdown-menu"></div>')
    if (this.options.dropdownClass) { dropdown.classList.add(this.options.dropdownClass) }

    insertAfter(dropdown, field)

    this.dropdown = new Dropdown(field, this.options.dropdownOptions)
    field.addEventListener('click', (e) => {
      if (this.createItems() === 0) {
        e.stopPropagation()
        this.dropdown.hide()
      } else if (field.value === '') {
        this.renderIfNeeded()
      }
    })
    field.addEventListener('input', () => {
      if (this.options.onInput) { this.options.onInput(this.field.value) }
      this.renderIfNeeded()
    })
    field.addEventListener('focus', (e) => {
      if (this.field.value === '') {
        this.field.click()
      }
    })
    field.addEventListener('keydown', (e) => {
      if (e.keyCode === 27) {
        this.dropdown.hide()
        return
      }
      if (e.keyCode === 40) {
        this.renderIfNeeded()
        this.dropdown._menu.children[0]?.focus()
      }
    })
    field.addEventListener('focusout', (e) => {
      if (e.relatedTarget?.className !== 'dropdown-item') {
        this.dropdown.hide()
      }
    })
  }

  setData(data) {
    this.options.data = data
    // this.renderIfNeeded()
  }

  renderIfNeeded() {
    if (this.createItems() > 0) { this.dropdown.show() } else { this.field.click() }
  }

  createItem(lookup, item) {
    let label
    const sanitizedLabel = $('<span/>').text(item.label).get(0).innerHTML
    if (this.options.highlightTyped) {
      const idx = removeDiacritics(sanitizedLabel)
        .toLowerCase()
        .indexOf(removeDiacritics(lookup).toLowerCase())
      const className = Array.isArray(this.options.highlightClass) ? this.options.highlightClass.join(' ')
        : (typeof this.options.highlightClass === 'string' ? this.options.highlightClass : '')
      label = `${sanitizedLabel.substring(0, idx)
      }<span class="${className}">${sanitizedLabel.substring(idx, idx + lookup.length)}</span>${
        sanitizedLabel.substring(idx + lookup.length, sanitizedLabel.length)}`
    } else {
      label = sanitizedLabel
    }

    if (this.options.showValue) {
      if (this.options.showValueBeforeLabel) {
        label = `${item.value} ${label}`
      } else {
        label += ` ${item.value}`
      }
    }
    const button = ce('<button type="button" class="dropdown-item"></button>')
    const span = ce('<span></span>')
    let icon
    if (item.wekan) {
      icon = ce(`<img style="width:15px;" class="me-1" src="${window.__meteor_runtime_config__.ROOT_URL_PATH_PREFIX || ''}/img/wekan.png" alt="Wekan"/>`)
    } else if (item.zammad) {
      icon = ce(`<img style="width:15px;" class="me-1" src="${window.__meteor_runtime_config__.ROOT_URL_PATH_PREFIX || ''}/img/zammad.svg" alt="Zammad"/>`)
    } else if (item.gitlab) {
      icon = ce(`<img style="width:15px;" class="me-1" src="${window.__meteor_runtime_config__.ROOT_URL_PATH_PREFIX || ''}/img/gitlab.svg" alt="GitLab"/>`)
    }
    button.setAttribute('data-label', item.label)
    button.setAttribute('data-value', item.value)
    emojify(sanitizedLabel).then((finalLabel) => { span.textContent = finalLabel })
    if (icon) {
      button.appendChild(icon)
    }
    button.appendChild(span)
    return button
  }

  createItems() {
    const lookup = this.field.value
    if (lookup.length < this.options.threshold) {
      this.dropdown.hide()
      return 0
    }

    const items = this.field.nextSibling
    items.innerHTML = ''

    const keys = Object.keys(this.options.data)

    let count = 0
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const entry = this.options.data[key]
      const item = {
        label: this.options.label ? entry[this.options.label] : key,
        value: this.options.value ? entry[this.options.value] : entry,
        wekan: entry.wekan,
        zammad: entry.zammad,
        gitlab: entry.gitlab,
      }

      if (removeDiacritics(item.label).toLowerCase()
        .indexOf(removeDiacritics(lookup).toLowerCase()) >= 0) {
        items.appendChild(this.createItem(lookup, item))
        if (this.options.maximumItems > 0 && ++count >= this.options.maximumItems) { break }
      }
    }

    this.field.nextSibling.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const dataLabel = e.currentTarget.getAttribute('data-label')
        const dataValue = e.currentTarget.getAttribute('data-value')

        this.field.value = dataLabel
        this.field.setAttribute('data-value', dataValue)
        if (this.options.onSelectItem) {
          this.options.onSelectItem({
            value: dataValue,
            label: dataLabel,
          })
        }

        this.dropdown.hide()
      })
      item.addEventListener('keydown', (e) => {
        if (e.keyCode === 13) {
          const dataLabel = e.currentTarget.getAttribute('data-label')
          const dataValue = e.currentTarget.getAttribute('data-value')

          this.field.value = dataLabel
          this.field.setAttribute('data-value', dataValue)
          if (this.options.onSelectItem) {
            this.options.onSelectItem({
              value: dataValue,
              label: dataLabel,
            })
          }

          this.dropdown.hide()
        }
      })
    })

    return items.childNodes.length
  }
}

/**
 * @param html
 * @returns {Node}
 */
function ce(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.firstChild
}

/**
 * @param elem
 * @param refElem
 * @returns {*}
 */
function insertAfter(elem, refElem) {
  return refElem.parentNode.insertBefore(elem, refElem.nextSibling)
}

/**
 * @param {String} str
 * @returns {String}
 */
function removeDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default Autocomplete
