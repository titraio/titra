import './timeline.html'
import './editTimeEntryModal.js'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { Modal } from 'bootstrap'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import Projects from '../../../../api/projects/projects'
import Timecards from '../../../../api/timecards/timecards'
import { getGlobalSetting, getWeekDays } from '../../../../utils/frontend_helpers'

Template.timeline.onCreated(function timelineCreated() {
  this.subscribe('myprojects', {})
  dayjs.extend(utc)
  this.startDate = new ReactiveVar(dayjs.utc().subtract(2, 'week'))
  this.endDate = new ReactiveVar(dayjs.utc().add(2, 'week'))
  this.dateRange = new ReactiveVar([])
  this.projectList = new ReactiveVar([])
  this.timesheetData = new ReactiveVar([])
  this.tcid = new ReactiveVar()
  this.selectedProjectId = new ReactiveVar()
  this.selectedDate = new ReactiveVar()
  this.autorun(() => {
    if (FlowRouter.getQueryParam('date')) {
      this.startDate.set(dayjs.utc(FlowRouter.getQueryParam('date')).startOf('week').subtract(2))
      this.endDate.set(dayjs.utc(FlowRouter.getQueryParam('date')).endOf('week').add(2))
    }
  })
  this.autorun(() => {
    if (this.startDate.get() && this.endDate.get()) {
      this.periodTimecardsSub = this.subscribe(
        'periodTimecards',
        {
          startDate: this.startDate.get().toDate(),
          endDate: this.endDate.get().toDate(),
          userId: Meteor.userId(),
        },
      )
    }
  })
  this.autorun(() => {
    if (this.periodTimecardsSub.ready()) {
      const timecards = Timecards.find({}).fetch()
      const projects = [...new Set(timecards.map((entry) => entry.projectId))]
      this.projectList.set(projects)
    }
  })
  this.autorun(() => {
    const startDate = this.startDate.get()
    const endDate = this.endDate.get()
    const dateRange = []
    for (let i = startDate; i.isBefore(endDate); i = i.add(1, 'day')) {
      dateRange.push(i.toDate())
    }
    this.dateRange.set(dateRange)
  })
})

Template.timeline.helpers({
  projects() {
    return Projects.find({})
  },
  projectList() {
    return Template.instance().projectList.get()
  },
  weekDays() {
    return getWeekDays(Template.instance().startDate.get())
  },
  dateRange() {
    return Template.instance().dateRange.get()
  },
  formatDate(date) {
    return dayjs(date).format(getGlobalSetting('weekviewDateFormat'))
  },
  getProjectName(projectId) {
    return Projects.findOne({ _id: projectId })?.name
  },
  getTimeEntriesForDateAndProject(date, projectId) {
    return Timecards.find({ projectId, date: dayjs.utc(date).startOf('day').toDate() })
  },
  getProjectColor(projectId) {
    return Projects.findOne({ _id: projectId })?.color
  },
  highlightToday(date) {
    return dayjs.utc(date).format(getGlobalSetting('weekviewDateFormat')) === dayjs.utc().format(getGlobalSetting('weekviewDateFormat')) ? 'bg-primary' : ''
  },
  tcid: () => Template.instance().tcid,
  selectedDate: () => Template.instance().selectedDate,
  selectedProjectId: () => Template.instance().selectedProjectId,
})
Template.timeline.onRendered(() => {
  document.querySelector(`[data-date="${dayjs.utc().format(getGlobalSetting('weekviewDateFormat'))}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  const templateInstance = Template.instance()
  templateInstance.startObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        templateInstance.startDate.set(templateInstance.startDate.get().subtract(1, 'week'))
        templateInstance.startObserver.unobserve(entry.target)
        templateInstance.$('tbody tr:nth-child(2)')[0].scrollIntoView()
        Meteor.setTimeout(() => {
          templateInstance.startObserver.observe(templateInstance.$('tbody tr:first-child')[0])
        }, 500)
      }
    })
  }, { threshold: 1 })
  templateInstance.endObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        templateInstance.endDate.set(templateInstance.endDate.get().add(1, 'week'))
        templateInstance.endObserver.disconnect()
        templateInstance.endObserver.observe(templateInstance.$('tbody tr:last-child')[0])
      }
    })
  }, { threshold: 1 })
  templateInstance.endObserver.observe(templateInstance.$('tbody tr:last-child')[0])
  Meteor.setTimeout(() => {
    templateInstance.startObserver.observe(templateInstance.$('tbody tr:first-child')[0])
  }, 1000)
})

Template.timeline.events({
  'click .js-add-time-entry-date': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.selectedDate.set(event.currentTarget.dataset.date)
    templateInstance.selectedProjectId.set()
    templateInstance.tcid.set()
    new Modal(templateInstance.$('#edit-tc-entry-modal')[0], { focus: false }).show()
  },
  'click .js-edit-time-entry': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.tcid.set(event.currentTarget.dataset.tcid)
    templateInstance.selectedDate.set()
    templateInstance.selectedProjectId.set()
    new Modal(templateInstance.$('#edit-tc-entry-modal')[0], { focus: false }).show()
  },
  'click .js-add-time-entry-project': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.selectedDate.set(event.currentTarget.dataset.date)
    templateInstance.selectedProjectId.set(event.currentTarget.dataset.projectid)
    templateInstance.tcid.set()
    new Modal(templateInstance.$('#edit-tc-entry-modal')[0], { focus: false }).show()
  },
})
