import { Modal } from 'bootstrap'
import { t } from '../../utils/i18n.js'

class BsDialogs {
  get optionsDefault() {
    return {
      centered: true,
      backdrop: 'static',
      keyboard: true,
      focus: true,
      close: true,
      size: '',
      fullscreen: null,
      scrollable: false,
    }
  }

  constructor(options = {}) {
    this.recalculateZIndex()
    this._options = { ...this.optionsDefault, ...options }
    this._bs_options = {
      backdrop: this._options.backdrop,
      keyboard: this._options.keyboard,
      focus: this._options.focus,
    }
    this._modal_div = document.createElement('div')
    this._modal_div.className = 'modal fade'
    this._modal_div.tabIndex = -1
    this._modal_div.insertAdjacentHTML('beforeend', this.modalHtml())
    this._modal_header = this._modal_div.querySelector('h5.modal-title')
    this._modal_body = this._modal_div.querySelector('div.modal-body')
    this._modal_footer = this._modal_div.querySelector('div.modal-footer')
    this._modal_close = this._modal_div.querySelector('button.btn-close')
    document.body.appendChild(this._modal_div)
  }

  modalHtml() {
    const cls = ['modal-dialog']
    if (this._options.centered) {
      cls.push('modal-dialog-centered')
    }
    if (this._options.size !== '') {
      cls.push(`modal-${this._options.size}`)
    }
    if (this._options.fullscreen !== null) {
      if (this._options.fullscreen === '') {
        cls.push('modal-fullscreen')
      } else {
        cls.push(`modal-fullscreen-${this._options.fullscreen}`)
      }
    }
    if (this._options.scrollable) {
      cls.push('modal-dialog-scrollable')
    }

    let closeBtn = '<button type="button" class="btn-close" data-ret="" aria-label="Close"></button>'
    if (!this._options.close) {
      closeBtn = ''
    }

    return `<div class="${cls.join(' ')}">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title"></h5>${closeBtn}
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>
  </div>`
  }

  serializeForm(frm) {
    const retDict = {}
    const selectors = frm.querySelectorAll('input')
    selectors.forEach((selector) => {
      if (selector.dataset.name) {
        if (selector.type === 'checkbox') {
          if (selector.checked && selector.name) {
            try {
              retDict[selector.name].push(selector.dataset.name)
            } catch {
              retDict[selector.name] = []
              retDict[selector.name].push(selector.dataset.name)
            }
          }
        } else {
          retDict[selector.dataset.name] = selector.value
        }
      } else if (selector.type === 'radio') {
        if (selector.checked && selector.name) {
          retDict[selector.name] = selector.value
        }
      }
    })
    return retDict
  }

  recalculateZIndex() {
    document.addEventListener('shown.bs.modal', (e) => {
      const el = e.target
      const allModal = document.querySelectorAll('.modal')
      let zIndex = 1040
      allModal.forEach((modalElement) => {
        if (getComputedStyle(modalElement).display !== 'none') zIndex += 10
      })
      el.style.zIndex = zIndex.toString()
      setTimeout(() => {
        const modalBackdrop = document.querySelectorAll('.modal-backdrop')
        modalBackdrop.forEach((backdropElement) => {
          if (!backdropElement.classList.contains('modal-stack')) {
            backdropElement.style.zIndex = (zIndex - 1).toString()
            backdropElement.classList.add('modal-stack')
          }
        })
      }, 0)
    })
  }

  custom(header, body, buttons = []) {
    this._modal_header.innerHTML = header
    this._modal_body.innerHTML = body
    for (const button of buttons) {
      const btnEl = document.createElement('button')
      btnEl.className = `btn ${button[1]}`
      btnEl.textContent = button[0]
      btnEl.dataset.ret = button[2]
      this._modal_footer.appendChild(btnEl)
    }
    this._modal_bs = new Modal(this._modal_div, this._bs_options)
    this._modal_bs.show()
    return new Promise((resolve, reject) => {
      for (const button of this._modal_div.querySelectorAll('button[data-ret]')) {
        button.addEventListener('click', (e) => {
          this.close()
          if (e.target.dataset.ret === '') {
            e.target.dataset.ret = undefined
          }
          resolve(e.target.dataset.ret === 'true')
        })
      }
      this._modal_div.addEventListener('hidden.bs.modal', () => {
        resolve(false)
        this.close()
      })
    })
  }

  async confirm(header, body) {
    return this.custom(header, body, [[t('globals.cancel'), 'btn-secondary', 'false'], [t('globals.ok'), 'btn-primary', 'true']])
  }

  async yesNo(header, body) {
    return this.custom(header, body, [[t('globals.no'), 'btn-secondary', 'false'], [t('globals.yes'), 'btn-primary', 'true']])
  }

  async alert(header, body) {
    return this.custom(header, body, [[t('globals.ok'), 'btn-primary', 'true']])
  }

  form(header, okBtnText, form) {
    this._modal_header.innerHTML = header
    this._modal_body.innerHTML = form
    this._modal_bs = new Modal(this._modal_div, this._bs_options)
    this._form_el = this._modal_body.querySelector('form')
    //
    const submitBtn = document.createElement('button')
    submitBtn.hidden = true
    submitBtn.type = 'submit'
    this._form_el.appendChild(submitBtn)
    //
    const okBtn = document.createElement('button')
    okBtn.className = 'btn btn-primary'
    okBtn.textContent = okBtnText
    okBtn.onclick = () => submitBtn.click()
    this._modal_footer.appendChild(okBtn)
    //
    this._modal_bs.show()
  }

  async onsubmit(loop = false) {
    return new Promise((resolve, reject) => {
      this._form_el.onsubmit = (e) => {
        e.preventDefault()
        resolve(this.serializeForm(this._form_el))
        if (!loop) {
          this.close()
        }
      }

      this._modal_close.onclick = () => {
        resolve(false)
        this.close()
      }

      this._modal_div.addEventListener('hidden.bs.modal', () => {
        resolve(false)
        this.close()
      })
    })
  }

  close() {
    try {
      this._modal_bs.hide()
      this._modal_div.remove()
    } catch (error) {
    //   console.error(error)
    }
  }

  set appendBody(el) {
    this._modal_body.appendChild(el)
  }
}

export default BsDialogs
