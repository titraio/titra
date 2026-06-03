const i18nReady = new ReactiveVar(false)
let _i18n = {}
let _debug = true
let _lang = ''
const weekDaysMin = new ReactiveVar([])
const months = new ReactiveVar([])
const setup = (language, lang, debugMode) => {
  _i18n = language
  _debug = debugMode
  _lang = lang
  if (_debug) {
    console.log(`Loading i18n for language ${lang}`)
  }
}
const getLanguage = () => _lang
const t = (key, variables = {}) => {
  if (!key) {
    return false
  }
  const keys = key.split('.')
  let translatedValue = _i18n
  keys.forEach((innerKey) => {
    translatedValue = translatedValue[innerKey] !== undefined ? translatedValue[innerKey] : key
  })

  if (translatedValue === undefined || translatedValue === key) {
    if (_debug) {
      console.warn(`Translation for key ${key} not found.`)
    }
    translatedValue = key
  }

  // Interpolate variables
  if (typeof translatedValue === 'string' && Object.keys(variables).length > 0) {
    Object.entries(variables).forEach(([varKey, varValue]) => {
      translatedValue = translatedValue.replace(new RegExp(`{${varKey}}`, 'g'), varValue)
    })
  }

  return translatedValue
}
let fallbackLocale = {}
import(`dayjs/locale/en-gb`).then((locale) => {
  fallbackLocale = locale
})

const loadLanguage = (language, i18nextDebugMode) => {
  // Meteor.js is not very smart
  // eslint-disable-next no-constant-condition
  if (false) {
    import('../ui/translations/en.json')
    import('dayjs/locale/en')
    import('../ui/translations/de.json')
    import('dayjs/locale/de')
    import('../ui/translations/fr.json')
    import('dayjs/locale/fr')
    import('../ui/translations/zh.json')
    import('dayjs/locale/zh')
    import('../ui/translations/ru.json')
    import('dayjs/locale/ru')
    import('../ui/translations/ukr.json')
    import('dayjs/locale/uk')
    import('../ui/translations/es.json')
    import('dayjs/locale/es')
  }
  import(`../ui/translations/${language}.json`).then((lang) => {
    i18nReady.set(false)
    setup(lang.default, language, i18nextDebugMode)
    import(`dayjs/locale/${language}`).then((locale) => {
      if (!locale.weekdaysMin) {
        weekDaysMin.set(fallbackLocale.weekdaysMin)
      } else {
        weekDaysMin.set(locale.weekdaysMin)
      }
      months.set(locale.months)
      import('dayjs').then((dayjs) => {
        dayjs.locale(language)
      })
    })
    i18nReady.set(true)
    $('html').attr('lang', language)
  }).catch(() => {
    import('../ui/translations/en.json').then((lang) => {
      if (i18nextDebugMode) {
        console.warn('Language not found, using default language en')
      }
      i18nReady.set(false)
      setup(lang.default, 'en', i18nextDebugMode)
      import('dayjs/locale/en-gb').then((locale) => {
        weekDaysMin.set(locale.weekdaysMin)
        months.set(locale.months)
        import('dayjs').then((dayjs) => {
          dayjs.locale('en')
        })
      })
      i18nReady.set(true)
      $('html').attr('lang', 'en')
    })
  })
}
export {
  t, setup, getLanguage, i18nReady, loadLanguage, weekDaysMin, months,
}
