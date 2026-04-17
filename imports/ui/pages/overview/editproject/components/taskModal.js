import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { Modal } from 'bootstrap'
import { t } from '../../../../../utils/i18n.js'
import './taskModal.html'
import Tasks from '../../../../../api/tasks/tasks'
import CustomFields from '../../../../../api/customfields/customfields.js'
import { showToast } from '../../../../../utils/frontend_helpers.js'
import BsDialogs from '../../../../shared components/bootstrapDialogs'

Template.taskModal.onCreated(function taskModalCreated() {
  this.editTask = new ReactiveVar(false)
  this.subscribe('globalsettings')
  this.autorun(() => {
    if (this.data?.editTaskID.get()) {
      this.editTask.set(Tasks.findOne({ _id: this.data?.editTaskID.get() }))
    } else {
      this.editTask.set(false)
    }
  })
})

Template.taskModal.events({
  'click .js-save-task': (event, templateInstance) => {
    event.preventDefault()
    const newTask = { projectId: FlowRouter.getParam('id') }
    templateInstance.$('input').each(function (index) {
      if ($(this).val() && !$(this).hasClass('js-customfield')) {
        if ($(this).get(0).type === 'date') {
          newTask[$(this).get(0).name] = new Date($(this).val())
        } else if ($(this).get(0).type === 'number') {
          newTask[$(this).get(0).name] = Number($(this).val())
        } else {
          newTask[$(this).get(0).name] = $(this).val()
        }
      }
    })
    if (!newTask.name) {
      templateInstance.$('#name').addClass('is-invalid')
      return
    }
    if (templateInstance.$('#dependencies').val()) {
      newTask.dependencies = [templateInstance.$('#dependencies').val()]
    }
    const customfields = {}
    templateInstance.$('.js-customfield').each((i, el) => { customfields[$(el).attr('id')] = $(el).val() })
    if (customfields) {
      newTask.customfields = customfields
    }
    if (templateInstance.editTask.get()) {
      newTask.taskId = templateInstance.editTask.get()._id
      Meteor.call('updateTask', newTask, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          Modal.getInstance(templateInstance.$('#task-modal')).hide()
          showToast(t('notifications.settings_saved_success'))
        }
      })
    } else {
      Meteor.call('insertProjectTask', newTask, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('input').each(function (index) {
            $(this).val('')
          })
          templateInstance.$('#start').val(new Date().toJSON().slice(0, 10))
          Modal.getInstance(templateInstance.$('#task-modal')).hide()
          showToast(t('notifications.settings_saved_success'))
        }
      })
    }
  },
  'click .js-remove-task': (event, templateInstance) => {
    event.preventDefault()
    new BsDialogs().confirm('', t('notifications.delete_confirm')).then((result) => {
      if (result) {
        Meteor.call('removeProjectTask', { taskId: templateInstance.editTask.get()._id }, (error, result) => {
          if (error) {
            console.error(error)
          } else {
            Modal.getInstance(templateInstance.$('#task-modal')).hide()
            showToast(t('notifications.settings_saved_success'))
          }
        })
      }
    })
  },
})

Template.taskModal.helpers({
  name: () => (Template.instance().editTask.get() ? Template.instance().editTask.get().name : ''),
  start: () => (Template.instance().editTask.get()
    ? Template.instance().editTask.get().start?.toJSON().slice(0, 10)
    : new Date().toJSON().slice(0, 10)),
  end: () => (Template.instance().editTask.get() ? Template.instance().editTask.get().end?.toJSON().slice(0, 10) : ''),
  estimatedHours: () => (Template.instance().editTask.get() ? Template.instance().editTask.get().estimatedHours || '' : ''),
  possibleDependencies: () => Tasks.find({ projectId: FlowRouter.getParam('id'), _id: { $ne: Template.instance().editTask.get()?._id } }),
  isSelectedDep: (dependency) => (Template.instance().editTask.get()?.dependencies?.includes(dependency) ? 'selected' : ''),
  replaceSpecialChars: (string) => string.replace(/[^A-Z0-9]/ig, '_'),
  getCustomFieldValue: (fieldId) => (Template.instance().editTask.get()
    ? Template.instance().editTask.get()[fieldId] : false),
  customfields: () => (CustomFields.find({ classname: 'task' }).fetch().length > 0 ? CustomFields.find({ classname: 'task' }) : false),
})
