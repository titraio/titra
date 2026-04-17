import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { Popover } from 'bootstrap'
import './magicPopup.html'
import './projectsearch.js'
import { t } from '../../../../utils/i18n.js'
import { googleAPI } from '../../../../utils/google/google_client.js'
import { getUserSetting, showToast } from '../../../../utils/frontend_helpers'
import Projects from '../../../../api/projects/projects'

Template.magicPopup.onCreated(function magicPopupCreated() {
  this.magicData = new ReactiveVar([])
  this.showPopup = new ReactiveVar(false)
  dayjs.extend(isoWeek)
  this.subscribe('myProjects')
})
const getMagicData = (templateInstance) => {
  let startDate = FlowRouter.getQueryParam('date') ? dayjs.utc(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').toDate() : dayjs.utc().startOf('day').toDate()
  let endDate = dayjs.utc(startDate).add(1, 'day').toDate()
  if (FlowRouter.getQueryParam('view') === 'w') {
    startDate = FlowRouter.getQueryParam('date') ? dayjs.utc(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').startOf('day').isoWeekday(getUserSetting('startOfWeek')).toDate() : dayjs.utc().startOf('day').isoWeekday(getUserSetting('startOfWeek')).toDate()
    endDate = FlowRouter.getQueryParam('date')
      ? dayjs.utc(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').add(6, 'day').toDate()
      : dayjs.utc().endOf('day').isoWeekday(getUserSetting('startOfWeek')).add(6, 'day')
        .toDate()
  }
  if (FlowRouter.getQueryParam('view') === 'm') {
    startDate = FlowRouter.getQueryParam('date') ? dayjs.utc(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').startOf('month').toDate() : dayjs.utc().startOf('month').toDate()
    endDate = FlowRouter.getQueryParam('date')
      ? dayjs.utc(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').endOf('month').toDate()
      : dayjs.utc().endOf('month').toDate()
  }
  templateInstance.magicData.set([])
  googleAPI().then(() => {
    Meteor.call('getGoogleWorkspaceData', { startDate, endDate }, (error, result) => {
      if (!error) {
        result.returnEvents = result.returnEvents.map((returnEvent) => ({ ...returnEvent, icon: 'fa-calendar' }))
        result.returnMessages = result.returnMessages.map((returnMessage) => ({ ...returnMessage, icon: 'fa-envelope' }))
        templateInstance.magicData.set(result.returnEvents.concat(result.returnMessages)
          .sort((a, b) => (a.date > b.date ? 1 : -1)))
      } else {
        console.error(error)
      }
    })
  })
}
Template.magicPopup.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.$('#magicModal').on('hidden.bs.modal', () => {
    templateInstance.showPopup.set(false)
  })
  templateInstance.$('#magicModal').on('shown.bs.modal', () => {
    templateInstance.showPopup.set(true)
  })
  templateInstance.autorun(() => {
    if (templateInstance.showPopup.get() && Meteor.user()?.profile?.googleAPIexpiresAt) {
      getMagicData(templateInstance)
    } else if (Meteor.user()?.profile?.googleAPIexpiresAt) {
      templateInstance.$('.robot').removeClass('d-none')
      templateInstance.$('.js-datatable-container').addClass('d-none')
    }
  })
})
Template.magicPopup.helpers({
  magicData: () => (Template.instance().magicData.get()?.length > 0
    ? Template.instance().magicData.get() : false),
  renderProjectSelect: (projectId) => `<select class="form-control js-magic-project" required>
    <option value="">${t('project.project_placeholder')}</option>
    ${Projects.find({ $or: [{ archived: { $exists: false } }, { archived: false }] }).fetch().map((project) => (project._id === projectId ? `<option value="${project._id}" selected>${project.name}</option>` : `<option value="${project._id}">${project.name}</option>`)).join('')}
  </select>`,
})

Template.magicPopup.events({
  'click .js-authorize-google': (event, templateInstance) => {
    event.preventDefault()
    getMagicData(templateInstance)
  },
  'click .js-change-project': (event) => {
    event.preventDefault()
    const doubleClickEvent = new MouseEvent('dblclick', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    const singleClickEvent = new MouseEvent('click')
    event.currentTarget.parentElement.dispatchEvent(doubleClickEvent)
    event.currentTarget.parentElement.parentElement.querySelector('.js-magic-project-select').dispatchEvent(singleClickEvent)
  },
  'click .js-select-all': (event, templateInstance) => {
    templateInstance.$('.js-magic-select').prop('checked', event.currentTarget.checked)
  },
  'mouseover .js-origin-icon': (event) => {
    const element = event.currentTarget
    Popover.getOrCreateInstance(element)
  },
  'click .js-save': (event, templateInstance) => {
    event.preventDefault()
    let selectedEntries = []
    templateInstance.$('tbody tr').each((index, element) => {
      const selected = $(element).find('.js-magic-select').prop('checked')
      const date = $(element).find('.js-magic-date').val()
      const projectId = $(element).find('.js-magic-project').val()
      const task = $(element).find('.js-magic-task').val()
      let hours = Number.parseFloat(templateInstance.$(element).find('.js-magic-hours').val())
      if (selected) {
        $(element).find('.js-magic-date').removeClass('is-invalid')
        $(element).find('.js-magic-project').removeClass('is-invalid')
        $(element).find('.js-magic-task').removeClass('is-invalid')
        $(element).find('.js-magic-hours').removeClass('is-invalid')
        if (!date) {
          $(element).find('.js-magic-date').addClass('is-invalid')
          selectedEntries = []
          return false
        }
        if (!projectId) {
          $(element).find('.js-magic-project').addClass('is-invalid')
          selectedEntries = []
          return false
        }
        if (!task) {
          $(element).find('.js-magic-task').addClass('is-invalid')
          selectedEntries = []
          return false
        }
        if (!hours) {
          $(element).find('.js-magic-hours').addClass('is-invalid')
          selectedEntries = []
          return false
        }
        if (getUserSetting('timeunit') === 'd') {
          hours *= (getUserSetting('hoursToDays'))
        }
        if (getUserSetting('timeunit') === 'm') {
          hours /= 60
        }
        selectedEntries.push(
          {
            date: new Date(Date.parse(date)),
            projectId,
            task,
            hours,
          },
        )
      }
      return true
    })
    if (selectedEntries.length > 0) {
      Meteor.call('upsertWeek', selectedEntries, (result, error) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('#magicModal').modal('hide')
          showToast(t('notifications.time_entry_saved'))
        }
      })
    } else {
      showToast(t('notifications.no_entry_selected'))
    }
  },
})
