import { Meteor } from 'meteor/meteor'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import bootstrap from 'bootstrap'
import { t } from '../../../utils/i18n.js'
import './projectlist.html'
import Projects from '../../../api/projects/projects'
import './components/projectchart.js'
import './components/allprojectschart.js'
import './components/projectProgress.js'
import './components/dashboardModal.js'
import hex2rgba from '../../../utils/hex2rgba.js'
import { periodToDates } from '../../../utils/periodHelpers.js'
import { showToast } from '../../../utils/frontend_helpers.js'

Template.projectlist.onCreated(function createProjectList() {
  this.subscribe('myprojects', {})
  this.showArchived = new ReactiveVar(false)
  this.projectId = new ReactiveVar(null)
  this.period = new ReactiveVar('all')
  this.startDate = new ReactiveVar(null)
  this.endDate = new ReactiveVar(null)
  this.autorun(() => {
    this.showArchived.set(FlowRouter.getQueryParam('showArchived') === 'true')
    const periodKey = this.data?.periodKey || 'period'; // default fallback
    const value = FlowRouter.getQueryParam(periodKey) || 'all';
    this.period.set(value);
  })
  this.autorun(async () => {
    if(this.period.get() !== 'all') {
      const {startDate, endDate} = await periodToDates(templateInstance.period.get())
      this.startDate.set(startDate)
      this.endDate.set(endDate)
    }
  })
})
Template.projectlist.onRendered(() => {
  // Template.instance().subscribe('myprojects', {})
})
Template.projectlist.helpers({
  projects() {
    const templateInstance = Template.instance()
    const limit = FlowRouter.getQueryParam('limit') ? Number(FlowRouter.getQueryParam('limit')) : 25
    const selector = {}
    if(templateInstance.period?.get() && templateInstance.period.get() !== 'all'){
      selector.$and = [{ $or: [ { startDate: { $exists: false } }, { startDate: { $gte: templateInstance.startDate.get() } }] },
      { $or: [{ endDate: {$exists: false } }, { endDate: { $lte: templateInstance.endDate.get() } }] }]
    }
    if(!templateInstance.showArchived?.get()) {
      if(selector.$and) {
        selector.$and.push({ $or: [{ archived: { $exists: false } }, { archived: false }] })
      } else {
      selector.$or = [{ archived: { $exists: false } }, { archived: false }]
      }
    }
    return Projects.find(selector, { sort: { priority: 1, name: 1 }, limit })
  },
  moreThanOneProject() {
    const selector = {}
    const templateInstance = Template.instance()
    if(templateInstance.period?.get() && templateInstance.period.get() !== 'all'){
      selector.$and = [{ $or: [ { startDate: { $exists: false } }, { startDate: { $gte: templateInstance.startDate.get() } }] },
      { $or: [{ endDate: {$exists: false } }, { endDate: { $lte: templateInstance.endDate.get() } }] }]
    }
    if(!templateInstance.showArchived?.get()) {
      if(selector.$and) {
        selector.$and.push({ $or: [{ archived: { $exists: false } }, { archived: false }] })
      } else {
      selector.$or = [{ archived: { $exists: false } }, { archived: false }]
      }
    }
    return Projects.find(selector, { sort: { priority: 1, name: 1 } }).count() > 1
  },
  hasArchivedProjects: () => Projects.find({}).count()
    !== Projects.find({ $or: [{ archived: { $exists: false } }, { archived: false }] }).count(),
  isProjectOwner(_id) {
    return Projects.findOne({ _id })
      ? (Projects.findOne({ _id }).userId === Meteor.userId()
        || Projects.findOne({ _id })?.admins?.indexOf(Meteor.userId() >= 0)) : false
  },
  colorOpacity(hex, op) {
    return hex2rgba(hex || '#009688', !isNaN(op) ? op : 50)
  },
  archived(_id) {
    return Projects.findOne({ _id }).archived
  },
  projectCount() {
    const selector = {}
    const templateInstance = Template.instance()
    if(templateInstance.period?.get() && templateInstance.period.get() !== 'all'){
      selector.$and = [{ $or: [ { startDate: { $exists: false } }, { startDate: { $gte: templateInstance.startDate.get() } }] },
      { $or: [{ endDate: {$exists: false } }, { endDate: { $lte: templateInstance.endDate.get() } }] }]
    }
    if(!templateInstance.showArchived?.get()) {
      if(selector.$and) {
        selector.$and.push({ $or: [{ archived: { $exists: false } }, { archived: false }] })
      } else {
      selector.$or = [{ archived: { $exists: false } }, { archived: false }]
      }
    }
    return Projects.find(selector, { sort: { priority: 1, name: 1 } }).count()
  },
  projectId: () => Template.instance().projectId,
})

Template.projectlist.events({
  'click .js-delete-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const projectId = event.currentTarget.parentElement.parentElement.id
    if (confirm(t('notifications.project_delete_confirm'))) {
      Meteor.call('deleteProject', { projectId }, (error) => {
        if (!error) {
          showToast(t('notifications.project_delete_success'))
        } else {
          console.error(error)
        }
      })
    }
  },
  'click .js-archive-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const projectId = event.currentTarget.dataset.id
    Meteor.call('archiveProject', { projectId }, (error) => {
      if (!error) {
        showToast(t('notifications.project_archive_success'))
      } else {
        console.error(error)
      }
    })
  },
  'click .js-restore-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const projectId = event.currentTarget.dataset.id
    Meteor.call('restoreProject', { projectId }, (error) => {
      if (!error) {
        showToast(t('notifications.project_restore_success'))
      } else {
        console.error(error)
      }
    })
  },
  'click .js-edit-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const projectId = event.currentTarget.dataset.id
    FlowRouter.go('editproject', { id: projectId })
  },
  'click .js-share': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.projectId.set(event.currentTarget.dataset.id)
    const dashboardModal = new bootstrap.Modal($('.js-dashboard-modal')[0], { focus: false }).toggle()
  },
})

Template.projectlist.onDestroyed(() => {
  $(window).off()
})
