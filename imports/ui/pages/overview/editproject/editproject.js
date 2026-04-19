import { Meteor } from 'meteor/meteor'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import 'jquery-serializejson'
import dayjs from 'dayjs'
import { t } from '../../../../utils/i18n.js'
import './editproject.html'
import Projects from '../../../../api/projects/projects.js'
import '../../../shared components/backbutton.js'
import './components/wekanInterfaceSettings.js'
import './components/projectAccessRights.js'
import {
  getUserSetting, getGlobalSetting, showToast, waitForElement,
} from '../../../../utils/frontend_helpers.js'
import CustomFields from '../../../../api/customfields/customfields.js'
import BsDialogs from '../../../shared components/bootstrapDialogs.js'
import '../../track/components/projectTasks.js'
import './components/importcsv.js'
import './components/projectDashboards.js'

Template.editproject.onCreated(function editprojectSetup() {
  this.deletion = new ReactiveVar(false)
  this.projectId = new ReactiveVar()
  this.project = new ReactiveVar()
  this.notbillable = new ReactiveVar(false)
  this.activeTab = new ReactiveVar('definition-tab')
  this.quillReady = new ReactiveVar(false)
  this.customers = new ReactiveVar([])
  this.filter = new ReactiveVar()
  Meteor.call('getAllCustomers', (err, res) => {
    if (err) {
      console.error(err)
    } else {
      this.customers.set(res)
    }
  })
  this.subscribe('customfieldsForClass', { classname: 'project' })
  this.autorun(() => {
    this.projectId.set(FlowRouter.getParam('id'))
    this.project.set(Projects.findOne({ _id: this.projectId.get() }))
    this.notbillable.set(this.project.get()?.notbillable)
    if (this.projectId.get()) {
      this.handle = this.subscribe('singleProject', this.projectId.get())
    }
  })
})
Template.editproject.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady()) {
      if (!FlowRouter.getParam('id')) {
        templateInstance.color = `#${(`000000${Math.floor(0x1000000 * Math.random()).toString(16)}`).slice(-6)}`
        $('#color').val(templateInstance.color)
      }
      if (!templateInstance.quill) {
        import('cl-editor').then((Editor) => {
          if (!templateInstance.quillReady.get()) {
            templateInstance.quill = new Editor.default({
              target: document.getElementById('richDesc'),
            })
            templateInstance.quillReady.set(true)
          }
        })
      }
    }
  })
  templateInstance.autorun(() => {
    const project = templateInstance.project.get()
    if (templateInstance.handle
        && templateInstance.handle.ready() && !templateInstance.deletion.get()) {
      if (project) {
        if (project.desc instanceof Object && templateInstance.quillReady.get()) {
          import('quill-delta-to-html').then((deltaToHtml) => {
            const converter = new deltaToHtml.QuillDeltaToHtmlConverter(project.desc.ops, {})
            templateInstance.quill.setHtml(converter.convert())
          })
        } else if (project.desc && templateInstance.quillReady.get()) {
          templateInstance.quill.setHtml(project.desc)
        }
        for (const customfield of CustomFields.find({ classname: 'project', possibleValues: { $exists: true } })) {
          waitForElement(templateInstance, `#${customfield.name}`).then((element) => {
            element.value = project[customfield.name]
          })
        }
        if (project.customer) {
          waitForElement(templateInstance, '#customer').then((element) => {
            element.value = project.customer
          })
        }
      } else if (project?.desc instanceof Object && templateInstance.quill) {
        import('quill-delta-to-html').then((deltaToHtml) => {
          const converter = new deltaToHtml.QuillDeltaToHtmlConverter(project.desc.ops, {})
          templateInstance.quill.setHtml(converter.convert())
        })
      } else if (project?.desc && templateInstance.quill) {
        templateInstance.quill.setHtml(project.desc)
      }
      if (project?.color || templateInstance.color) {
        templateInstance.$('#color').val(project?.color
          ? project.color : templateInstance.color)
      } else {
        templateInstance.$('#color').val('#009688')
      }
      if (project.desc instanceof Object && templateInstance.quill) {
        import('quill-delta-to-html').then((deltaToHtml) => {
          const converter = new deltaToHtml.QuillDeltaToHtmlConverter(project.desc.ops, {})
          templateInstance.quill.setHtml(converter.convert())
        })
      } else if (project.desc && templateInstance.quill) {
        templateInstance.quill.setHtml(project.desc)
      }
    } else if (FlowRouter.getRouteName() !== 'createProject' && !templateInstance.deletion) {
      FlowRouter.go('404')
    }
    if (project) {
      const userIds = project.team ? project.team : []
      if (project.admins) {
        userIds.concat(project.admins)
      }
      userIds.push(project.userId)
      templateInstance.subscribe('projectTeam', { userIds })
    }
  })
})

Template.editproject.events({
  'click .js-save': (event, templateInstance) => {
    event.preventDefault()
    if (!templateInstance.$('#name').val()) {
      templateInstance.$('#name').addClass('is-invalid')
      return
    }
    if (getUserSetting('timeunit') === 'd') {
      templateInstance.$('#target').val(Number(templateInstance.$('#target').val()) * getUserSetting('hoursToDays'))
    }
    if (getUserSetting('timeunit') === 'm') {
      templateInstance.$('#target').val(Number(templateInstance.$('#target').val()) / 60)
    }
    const projectArray = templateInstance.$('#editProjectForm').serializeArray()
    if (Template.instance().quill.getHtml(true)) {
      projectArray.push({ name: 'desc', value: Template.instance().quill.getHtml(true) })
    } else {
      projectArray.push({ name: 'desc', value: '' })
    }
    if (getUserSetting('timeunit') === 'd') {
      templateInstance.$('#target').val(templateInstance.$('#target').val() * (getUserSetting('hoursToDays')))
    }
    if (getUserSetting('timeunit') === 'm') {
      templateInstance.$('#target').val(templateInstance.$('#target').val() / 60)
    }
    const selectedWekanLists = $('.js-wekan-list-entry:checked').toArray().map((entry) => entry.value)
    const selectedWekanSwimlanes = $('.js-wekan-swimlane-entry:checked').toArray().map((entry) => entry.value)
    if (selectedWekanLists.length > 0) {
      projectArray.push({ name: 'selectedWekanList', value: $('.js-wekan-list-entry:checked').toArray().map((entry) => entry.value) })
    } else if ($('#wekan-list-container').children().length > 0) {
      projectArray.push({ name: 'selectedWekanList', value: [] })
    }
    if (selectedWekanSwimlanes.length > 0) {
      projectArray.push({ name: 'selectedWekanSwimlanes', value: $('.js-wekan-swimlane-entry:checked').toArray().map((entry) => entry.value) })
    } else if ($('#wekan-swimlane-container').children().length > 0) {
      projectArray.push({ name: 'selectedWekanSwimlanes', value: [] })
    }
    if (FlowRouter.getParam('id')) {
      Meteor.call('updateProject', {
        projectId: FlowRouter.getParam('id'),
        projectArray,
      }, (error) => {
        if (!error) {
          templateInstance.$('#name').removeClass('is-invalid')
          showToast(t('notifications.project_update_success'))
        } else {
          console.error(error)
        }
      })
    } else {
      Meteor.call('createProject', {
        projectArray,
      }, (error, result) => {
        if (!error) {
          showToast(t('notifications.project_create_success'))
          FlowRouter.go('editproject', { id: result })
        } else {
          console.error(error)
        }
      })
    }
  },
  'click .js-backbutton': (event) => {
    event.preventDefault()
    FlowRouter.go('/list/projects')
  },
  'click .js-delete-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const templateInstance = Template.instance()
    new BsDialogs().confirm('', t('notifications.project_delete_confirm')).then((result) => {
      if (result) {
        templateInstance.deletion.set(true)
        Meteor.call('deleteProject', { projectId: FlowRouter.getParam('id') }, (error) => {
          if (!error) {
            FlowRouter.go('projectlist')
            showToast(t('notifications.project_delete_success'))
          } else {
            console.error(error)
          }
        })
      }
    })
  },
  'click .js-archive-project': (event) => {
    event.preventDefault()
    event.stopPropagation()
    Meteor.call('archiveProject', { projectId: FlowRouter.getParam('id') }, (error) => {
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
    Meteor.call('restoreProject', { projectId: FlowRouter.getParam('id') }, (error) => {
      if (!error) {
        showToast(t('notifications.project_restore_success'))
      } else {
        console.error(error)
      }
    })
  },
  'change #color': (event, templateInstance) => {
    if (!templateInstance.$(event.currentTarget).val()) {
      templateInstance.$(event.currentTarget).val('#009688')
    }
  },
  'change #notbillable': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.notbillable.set(templateInstance.$(event.currentTarget).is(':checked'))
  },
  'click .nav-link[data-bs-toggle]': (event, templateInstance) => {
    templateInstance.activeTab.set(templateInstance.$(event.currentTarget)[0].id)
  },
  'mousedown .js-customer-result': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.$('#customer').val(templateInstance.$(event.currentTarget).children('.js-customer-name').text())
    templateInstance.$('.js-customter-results').addClass('d-none')
    templateInstance.$('#customer').removeClass('is-invalid')
  },
  'focus #customer': (event, templateInstance) => {
    templateInstance.$('.js-customer-results').removeClass('d-none')
    templateInstance.$('#customer').removeClass('is-invalid')
  },
  'blur #customer': (event, templateInstance) => {
    templateInstance.$('.js-customer-results').addClass('d-none')
  },
  'keydown #customer': (event, templateInstance) => {
    if (event.keyCode === 13) {
      event.preventDefault()
      event.stopPropagation()
      if (templateInstance.$('#customer').val()) {
        templateInstance.$('.js-customer-results').addClass('d-none')
      }
    }
  },
  'keyup #customer': (event, templateInstance) => {
    if (event.keyCode === 40) {
      event.preventDefault()
      templateInstance.$('.js-customer-results').removeClass('d-none')
      templateInstance.$(templateInstance.$('.js-customer-result')[0]).focus()
    } else if (event.keyCode === 27) {
      templateInstance.$('.js-customer-results').addClass('d-none')
    } else {
      templateInstance.filter.set(templateInstance.$(event.currentTarget).val())
      templateInstance.$('.js-customer-results').removeClass('d-none')
    }
    // templateInstance.$('.js-tasksearch-results').show()
  },
  'keyup .js-customer-result': (event, templateInstance) => {
    event.preventDefault()
    event.stopPropagation()
    // enter key
    if (event.keyCode === 13) {
      templateInstance.$('#customer').val(templateInstance.$(event.currentTarget).children('.js-customer-name').text())
      templateInstance.$('.js-customer-results').addClass('d-none')
    } else if ((event.keyCode === 40 || event.keyCode === 9) // tab or down key
      && event.currentTarget.nextElementSibling) {
      templateInstance.$(event.currentTarget.nextElementSibling).focus()
    } else if (event.keyCode === 38 && event.currentTarget.previousElementSibling) { // up key
      templateInstance.$(event.currentTarget.previousElementSibling).focus()
    } else if (event.keyCode === 27) { // escape key
      templateInstance.$('.js-customer-results').addClass('d-none')
      templateInstance.$('#customer').focus()
    }
  },
})
Template.editproject.helpers({
  newProject: () => (!FlowRouter.getParam('id')),
  name: () => (Template.instance().project.get() ? Template.instance().project.get().name : false),
  desc: () => (Template.instance().project.get() ? Template.instance().project.get().desc : false),
  color: () => (Template.instance().project.get()
    ? Template.instance().project.get().color : Template.instance().color),
  customer: () => (Template.instance().project.get()
    ? Template.instance().project.get().customer : false),
  rate: () => (Template.instance().project.get() ? Template.instance().project.get().rate : false),
  public: () => (Template.instance().project.get() ? Template.instance().project.public : false),
  team: () => {
    if (Template.instance().project.get() && Template.instance().project.get().team) {
      return Meteor.users.find({ _id: { $in: Template.instance().project.get().team } })
    }
    return false
  },
  projectId: () => !Template.instance().deletion.get() && FlowRouter.getParam('id'),
  disablePublic: () => getGlobalSetting('disablePublicProjects'),
  archived: (_id) => (Projects.findOne({ _id }) ? Projects.findOne({ _id }).archived : false),
  target: () => (Template.instance().project.get()
    ? Template.instance().project.get().target : false),
  startDate: () => (Template.instance().project.get()
    ? dayjs(Template.instance().project.get().startDate).format('YYYY-MM-DD') : false),
  endDate: () => (Template.instance().project.get()
    ? dayjs(Template.instance().project.get().endDate).format('YYYY-MM-DD') : false),
  notbillable: () => Template.instance().notbillable.get(),
  customfields: () => (CustomFields.find({ classname: 'project' }).fetch().length > 0 ? CustomFields.find({ classname: 'project' }) : false),
  getCustomFieldValue: (fieldId) => (Template.instance().project.get()
    ? Template.instance().project.get()[fieldId] : false),
  defaultTask: () => (Template.instance().project?.get()?.defaultTask),
  isActiveTab: (tab) => Template.instance().activeTab.get() === tab,
  customers: () => Template.instance().customers.get()
    .filter((customer) => (customer._id?.toLowerCase()
      .search(Template.instance().filter.get()?.toLowerCase()) > -1))
    .slice(0, 5),
  replaceSpecialChars: (string) => string.replace(/[^A-Z0-9]/ig, '_'),
  gitlabquery: () => Template.instance()?.project?.get()?.gitlabquery,
})
