import { Modal } from 'bootstrap'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { t } from '../../../../utils/i18n'
import { showErrorToast, showToast } from '../../../../utils/frontend_helpers'
import { sanitizeSlug } from '../../../../utils/sanitizer'

import Projects from '../../../../api/projects/projects'
import '../../details/components/periodpicker.js'
import './dashboardModal.html'

dayjs.extend(utc)
dayjs.extend(customParseFormat)

Template.dashboardModal.onCreated(function dashboardModalCreated() {
  this.subscribe('myprojects', {})
  this.slugAvailable = new ReactiveVar(null)
  this.slugSanitized = new ReactiveVar(null)
  this.passwordInserted = new ReactiveVar(null)
  this.dashboardId = new ReactiveVar(null)
  this.currentPeriod = new ReactiveVar(null)
})

Template.dashboardModal.onRendered(() => {
})

Template.dashboardModal.helpers({
  projects() {
    return Projects.find(
      { $or: [{ archived: { $exists: false } }, { archived: false }] },
      { sort: { priority: 1, name: 1 } },
    )
  },

  editMode() {
    return !!Template.instance().data?.editDashboard?._id
  },

  dashboardId() {
    return Template.instance().dashboardId.get()
  },

  selectedProjectName() {
    const tpl = Template.instance()
    const editDashboard = tpl.data?.editDashboard
    if (editDashboard?.projectId) {
      return Projects.findOne(editDashboard.projectId)?.name || ''
    }
    const projectId = tpl.data?.projectId?.get?.() || tpl.data?.projectId
    if (projectId) {
      return Projects.findOne(projectId)?.name || ''
    }
    return ''
  },

  dashboardURL() {
    const dashboardId = Template.instance().dashboardId.get()
    if (dashboardId.slug) {
      return FlowRouter.url('dashboard', { _id: dashboardId.slug })
    }
    if (dashboardId._id) {
      return FlowRouter.url('dashboard', { _id: dashboardId._id })
    }
    return ''
  },

  slugStatus() {
    return Template.instance().slugAvailable.get()
  },

  slugSanitized() {
    return Template.instance().slugSanitized.get()
  },

  slugStatusOn() {
    if (Template.instance().slugAvailable.get() != null) {
      return true
    }
    return false
  },

  passwordWarningOn() {
    const tpl = Template.instance()
    if (tpl.data?.editDashboard?.password) {
      return false
    }
    return !tpl.passwordInserted.get()
  },

  editPassword() {
    const editDashboard = Template.instance().data?.editDashboard
    return editDashboard?.password ? '******' : ''
  },

  editSlug() {
    const editDashboard = Template.instance().data?.editDashboard
    return editDashboard?.slug || ''
  },

  editStartDate() {
    const editDashboard = Template.instance().data?.editDashboard
    const date = editDashboard?.startDate ? dayjs(editDashboard.startDate) : null
    return date?.isValid() ? date.format('YYYY-MM-DD') : ''
  },

  editEndDate() {
    const editDashboard = Template.instance().data?.editDashboard
    const date = editDashboard?.endDate ? dayjs(editDashboard.endDate) : null
    return date?.isValid() ? date.format('YYYY-MM-DD') : ''
  },

  isSelectedPeriod(value) {
    const tpl = Template.instance()
    const editDashboard = tpl.data?.editDashboard
    const period = tpl.currentPeriod.get() || editDashboard?.timePeriod
    return period === value ? 'selected' : ''
  },

  showCustomDates() {
    const tpl = Template.instance()
    return tpl.currentPeriod.get() === 'custom'
  },
})

Template.dashboardModal.events({
  'click .js-create-dashboard': (event, templateInstance) => {
    event.preventDefault()
    let startDate, endDate
    const period = document.getElementById('dashboardPeriod')?.value
    if (period === 'custom') {
      startDate = document.getElementById('customStartDate')?.value
      endDate = document.getElementById('customEndDate')?.value
    } else {
      startDate = 'N/A'
      endDate = 'N/A'
    }
    const password = document.getElementById('dashboard-password')?.value
    const slug = document.getElementById('dashboard-slug')?.value

    Meteor.call('addDashboard', {
      projectId: typeof templateInstance.data.projectId?.get === 'function'
        ? templateInstance.data.projectId.get()
        : templateInstance.data.projectId, timePeriod: period, startDate, endDate, password, slug,
    }, (error, _id) => {
      if (error) {
        showErrorToast(t('dashboard.createFailed') + '\n' + error.reason)
      } else {
        showToast(t('dashboard.createdSuccessfully'))
        templateInstance.dashboardId.set({ _id, slug })
      }
    })
  },

  'click .js-save-dashboard': (event, templateInstance) => {
    event.preventDefault()
    const editDashboard = templateInstance.data?.editDashboard
    if (!editDashboard) return

    const dashboardId = editDashboard._id
    const timePeriod = document.getElementById('dashboard-period')?.value || editDashboard.timePeriod
    const startDate = timePeriod === 'custom' ? document.getElementById('customStartDate')?.value : undefined
    const endDate = timePeriod === 'custom' ? document.getElementById('customEndDate')?.value : undefined
    const slug = document.getElementById('dashboard-slug')?.value?.trim()
    const password = document.getElementById('dashboard-password')?.value?.trim() || undefined

    Meteor.call('updateDashboard', {
      dashboardId,
      timePeriod,
      startDate,
      endDate,
      slug,
      password,
    }, (err) => {
      if (err) {
        showErrorToast(t('dashboard.updateFailed') + ': ' + (err.reason || t('notifications.unknown_error')))
      } else {
        showToast(t('dashboard.updatedSuccessfully'))
        Modal.getInstance(templateInstance.$('.js-dashboard-modal')[0])?.hide()
      }
    })
  },

  'change #dashboard-period': function (event, template) {
    template.currentPeriod.set(event.target.value)
  },

  'click #togglePassword': (event, template) => {
    const input = template.$('#dashboard-password')
    const icon = template.$('#eyeIcon')

    if (input.attr('type') === 'password') {
      input.attr('type', 'text')
      icon.removeClass('fa-eye').addClass('fa-eye-slash')
    } else {
      input.attr('type', 'password')
      icon.removeClass('fa-eye-slash').addClass('fa-eye')
    }
  },

  'keyup #dashboard-slug': (event, template) => {
    const slug = event.target.value.trim()
    const editDashboard = template.data?.editDashboard

    if (!slug) {
      template.slugAvailable.set(null)
      template.slugSanitized.set(false)
      return
    }

    const sanitizedSlug = sanitizeSlug(slug)

    if (sanitizedSlug !== slug) {
      template.slugSanitized.set(true)
      event.target.value = sanitizedSlug
    }

    Meteor.call('checkDashboardSlug', {
      slug: sanitizedSlug,
      currentDashboardId: editDashboard?._id,
    }, (err, res) => {
      if (err) {
        template.slugAvailable.set(null)
      } else {
        template.slugAvailable.set(res)
      }
    })
  },

  'keyup #dashboard-password': (event, template) => {
    const password = event.target.value.trim()
    template.passwordInserted.set(!!password)
  },
})
