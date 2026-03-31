import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { Dashboards } from '../../../../../api/dashboards/dashboards'
import Projects from '../../../../../api/projects/projects'
import { t } from '../../../../../utils/i18n.js'
import { showToast, showErrorToast } from '../../../../../utils/frontend_helpers'
import { periodToString } from '../../../../../utils/periodHelpers'
import bootstrap from 'bootstrap'

import './projectDashboards.html'
import '../../components/dashboardModal.js'

Template.projectDashboards.onCreated(function () {
  const tpl = this

  tpl.editingDashboard = new ReactiveVar(null)

  tpl.autorun(() => {
    const projectId = tpl.data?.projectId
    if (projectId) {
      tpl.subscribe('singleProject', projectId)
      tpl.subscribe('myDashboards')
    } else {
      tpl.subscribe('allDashboardsDetails')
    }
  })
})

Template.projectDashboards.helpers({
  showProjectColumn() {
    return !Template.instance().data?.projectId
  },

  dashboards() {
    const projectId = Template.instance().data?.projectId
    if (projectId) {
      return Dashboards.find({ projectId })
    }
    return Dashboards.find({})
  },

  editingDashboard() {
    return Template.instance().editingDashboard.get()
  },

  projectName(projectId) {
    const p = Projects.findOne(projectId)
    return p ? p.name : t('globals.not_found')
  },

  dashboardLink(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId)
    if (dashboard?.slug) {
      return dashboard.slug
    }
    return dashboard?._id || t('globals.not_found')
  },

  dashboardUrl(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId)
    if (dashboard?.slug) {
      return FlowRouter.url('dashboard', { _id: dashboard.slug })
    }
    if (dashboard?._id) {
      return FlowRouter.url('dashboard', { _id: dashboard._id })
    }
    return '#'
  },

  dashboardTimeperiod(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId)
    return dashboard ? periodToString(dashboard.timePeriod) : t('globals.not_found')
  },
})

Template.projectDashboards.events({
  'click .js-create-dashboard': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.editingDashboard.set({})
    Tracker.afterFlush(() => {
      new bootstrap.Modal(templateInstance.$('.js-dashboard-modal')[0], { focus: false }).show()
    })
  },

  'click .js-remove-dashboard': (event, templateInstance) => {
    event.preventDefault()
    const dashboardId = templateInstance.$(event.currentTarget).data('dashboard-id')

    if (confirm(t('administration.confirm_delete'))) {
      Meteor.call('removeDashboard', { dashboardId }, (err) => {
        if (err) {
          showErrorToast('Could not remove dashboard: ' + (err.reason || 'Unknown error'))
        } else {
          showToast('Dashboard removed successfully')
        }
      })
    }
  },

  'click .js-edit-dashboard': (event, templateInstance) => {
    event.preventDefault()
    const dashboardId = templateInstance.$(event.currentTarget).data('dashboard-id')
    const dashboard = Dashboards.findOne(dashboardId)
    if (!dashboard) return

    templateInstance.editingDashboard.set(dashboard)
    Tracker.afterFlush(() => {
      new bootstrap.Modal(templateInstance.$('.js-dashboard-modal')[0], { focus: false }).show()
    })
  },

  'hidden.bs.modal .js-dashboard-modal': (event, templateInstance) => {
    templateInstance.editingDashboard.set(null)
    document.body.classList.remove('modal-open')
    const backdrops = document.querySelectorAll('.modal-backdrop')
    backdrops.forEach((backdrop) => backdrop.remove())
  },
})
