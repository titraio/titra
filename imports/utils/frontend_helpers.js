import namedavatar from 'namedavatar'
import { i18nReady, t } from './i18n.js'
import { Globalsettings } from '../api/globalsettings/globalsettings.js'
import { projectResources } from '../api/users/users.js'
import Projects from '../api/projects/projects.js'

function getGlobalSetting(name) {
  return Globalsettings.findOne({ name }) ? Globalsettings.findOne({ name }).value : false
}

function getUserSetting(field) {
  check(field, String)
  if ((Meteor.isClient && !Meteor.loggingIn()) && Meteor.user() && Meteor.user().profile) {
    return typeof Meteor.user().profile[field] !== 'undefined' && !Number.isNaN(Meteor.user().profile[field]) ? Meteor.user().profile[field] : getGlobalSetting(field)
  }
  return getGlobalSetting(field) ? getGlobalSetting(field) : false
}

function addToolTipToTableCell(value) {
  if (value) {
    const toolTipElement = $('<span/>').text(value)
    toolTipElement.addClass('js-tooltip')
    toolTipElement.attr('data-bs-toggle', 'tooltip')
    toolTipElement.attr('data-bs-placement', 'left')
    toolTipElement.attr('title', toolTipElement.text())
    return toolTipElement.get(0).outerHTML
  }
  return ''
}

async function getWeekDays(date) {
  if (date) {
    const dayjs = await import('dayjs')
    const isoWeek = await import('dayjs/plugin/isoWeek')
    dayjs.default.extend(isoWeek.default)
    const calendar = date.clone().isoWeekday(getUserSetting('startOfWeek'))
    return new Array(7).fill(0).map((value, index) => (calendar.add(index, 'day').format(getGlobalSetting('weekviewDateFormat'))))
  }
  return false
}

function numberWithUserPrecision(number) {
  return getUserSetting('precision') ? Number(number).toFixed(getUserSetting('precision')) : Number(number).toFixed(getGlobalSetting('precision'))
}

function timeInUserUnit(time) {
  if (!time || time === 0) {
    return false
  }
  const precision = getUserSetting('precision')
  const hoursToDays = getUserSetting('hoursToDays') ? getUserSetting('hoursToDays') : getGlobalSetting('hoursToDays')
  if (getUserSetting('timeunit') === 'd') {
    const convertedTime = Number(time / hoursToDays).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  if (getUserSetting('timeunit') === 'm') {
    const convertedTime = Number(time * 60).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  if (time) {
    return Number(time).toFixed(precision)
  }
  return false
}
function displayUserAvatar(meteorUser) {
  if (meteorUser?.profile?.avatar) {
    return `<img src="${meteorUser.profile.avatar}" alt="${meteorUser.profile.name}" style="height:25px" class="rounded"/>`
  }
  namedavatar.config({
    nameType: 'initials',
    backgroundColors:
      [(meteorUser?.profile?.avatarColor
        ? meteorUser.profile.avatarColor : '#455A64')],
    minFontSize: 2,
  })
  const rawSVG = namedavatar.getSVG(meteorUser?.profile?.name ? meteorUser.profile.name : false)
  rawSVG.classList = 'rounded'
  rawSVG.style.width = '25px'
  rawSVG.style.height = '25px'
  return rawSVG.outerHTML
}
function validateEmail(email) {
  if (Meteor.loginWithLDAP) {
    return true
  }
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(String(email).toLowerCase())
}
function validatePassword(pwd) {
  const strongRegex = /^(?=.{14,})(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*\W).*$/g
  const mediumRegex = /^(?=.{10,})(((?=.*[A-Z])(?=.*[a-z]))|((?=.*[A-Z])(?=.*[0-9]))|((?=.*[a-z])(?=.*[0-9]))).*$/g
  const enoughRegex = /(?=.{8,}).*/g
  if (pwd.length === 0) {
    return { valid: false, message: t('login.password_insufficient') }
  }
  if (enoughRegex.test(pwd) === false) {
    return { valid: false, message: t('login.password_insufficient') }
  }
  if (strongRegex.test(pwd)) {
    return { valid: true, message: t('login.password_strong') }
  }
  if (mediumRegex.test(pwd)) {
    return { valid: true, message: t('login.password_medium') }
  }
  if (pwd.length > 50) {
    return { valid: false, message: t('login.password_insufficient') }
  }
  return { valid: true, message: t('login.password_weak') }
}
async function emojify(match) {
  const emojiImport = await import('node-emoji')
  return emojiImport.emojify(match)
}
function getUserTimeUnitVerbose() {
  if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile && i18nReady.get()) {
    switch (getUserSetting('timeunit')) {
      case 'm':
        return t('globals.minute_plural')
      case 'h':
        return t('globals.hour_plural')
      case 'd':
        return t('globals.day_plural')
      default:
        return t('globals.hour_plural')
    }
  }
  return false
}
function getUserTimeUnitAbbreviated() {
  if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile && i18nReady.get()) {
    switch (getUserSetting('timeunit')) {
      case 'm':
        return t('globals.unit_minute_short')
      case 'h':
        return t('globals.unit_hour_short')
      case 'd':
        return t('globals.unit_day_short')
      default:
        return t('globals.unit_hour_short')
    }
  }
  return false
}
function showToast(message) {
  import('bootstrap').then((bs) => {
    $('.toast').removeClass('d-none')
    $('.toast-body').text(message)
    new bs.Toast($('.toast').get(0), { delay: 2000 }).show()
  })
}
function showErrorToast(message) {
  import('bootstrap').then((bs) => {
    const $toast = $('.toast')
    $toast.removeClass('d-none bg-success').addClass('bg-danger')
    $toast.find('.toast-body').text(message)
    new bs.Toast($toast.get(0), { delay: 4000 }).show()
  })
}
function waitForElement(templateInstance, selector) {
  const targetElement = templateInstance?.view.firstNode().parentElement
    ? templateInstance?.view.firstNode().parentElement : document
  return new Promise((resolve) => {
    let element = targetElement?.querySelector(selector)
    if (element) {
      resolve(element)
    } else if (targetElement) {
      const observer = new MutationObserver((mutations, obs) => {
        element = targetElement.querySelector(selector)
        if (element) {
          obs.disconnect()
          resolve(element)
        }
      })
      observer.observe(targetElement, {
        childList: true,
        subtree: true,
      })
    }
  })
}
/**
 * Mapper function for the dailyTimecard method.
 * @param {Object} entry - The entry to map.
 * @returns {Object} The mapped entry.
 */
function dailyTimecardMapper(entry) {
  let { totalHours } = entry
  if (Meteor.user()) {
    if (getUserSetting('timeunit') === 'd') {
      totalHours = Number(entry.totalHours / getUserSetting('hoursToDays'))
    }
    if (getUserSetting('timeunit') === 'm') {
      totalHours = Number(entry.totalHours * 60)
    }
  }
  const mapping = {
    date: entry._id.date,
    projectId: Projects.findOne({ _id: entry._id.projectId })?.name,
    userId: projectResources.findOne({ _id: entry._id.userId })?.name,
    totalHours,
  }
  if (!getGlobalSetting('showResourceInDetails')) {
    delete mapping.userId
  }
  return mapping
}
/**
 * Mapper function for the totalHoursForPeriod publication.
 * @param {Object} entry - The entry to map.
 * @returns {Object} The mapped entry.
 */
function totalHoursForPeriodMapper(entry) {
  let { totalHours } = entry
  if (Meteor.user()) {
    if (getUserSetting('timeunit') === 'd') {
      totalHours = Number(entry.totalHours / getUserSetting('hoursToDays'))
    }
    if (getUserSetting('timeunit') === 'm') {
      totalHours = Number(entry.totalHours * 60)
    }
  }
  const mapping = {
    projectId: Projects.findOne({ _id: entry._id.projectId })?.name,
    userId: projectResources.findOne({ _id: entry._id.userId })?.name,
    totalHours,
  }
  if (!getGlobalSetting('showResourceInDetails')) {
    delete mapping.userId
  }
  return mapping
}

export {
  addToolTipToTableCell,
  getWeekDays,
  timeInUserUnit,
  displayUserAvatar,
  validateEmail,
  validatePassword,
  emojify,
  getGlobalSetting,
  numberWithUserPrecision,
  getUserSetting,
  getUserTimeUnitVerbose,
  getUserTimeUnitAbbreviated,
  showToast,
  showErrorToast,
  waitForElement,
  dailyTimecardMapper,
  totalHoursForPeriodMapper,
}
