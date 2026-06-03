import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import './filterbar.html'
import './periodpicker.js'
import './multiselectfilter.js'
import Projects from '../../../../api/projects/projects.js'
import { projectResources } from '../../../../api/users/users.js'
import Customers from '../../../../api/customers/customers.js'

Template.filterbar.onCreated(function filterbarCreated() {
  this.subscribe('myprojects', {})
  this.autorun(() => {
    const projectIdParam = FlowRouter.getParam('projectId')
    if (projectIdParam) {
      const projectId = projectIdParam.split(',').length > 1 ? projectIdParam.split(',') : projectIdParam
      this.subscribe('projectResources', { projectId })
      this.subscribe('projectCustomers', { projectId })
    }
  })
})
Template.filterbar.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady()) {
      if (FlowRouter.getParam('projectId')) {
        templateInstance.$('.js-projectselect').val(FlowRouter.getParam('projectId').split(','))
        templateInstance.$('.js-projectselect').trigger('change')
      }
      if (FlowRouter.getQueryParam('resource')) {
        templateInstance.$('.js-resourceselect').val(FlowRouter.getQueryParam('resource')?.split(','))
      }
      if (FlowRouter.getQueryParam('customer')) {
        templateInstance.$('.js-customerselect').val(FlowRouter.getQueryParam('customer')?.split(','))
      }
    }
  })
})
Template.filterbar.helpers({
  projects() {
    if (FlowRouter.getQueryParam('customer') && FlowRouter.getQueryParam('customer') !== 'all') {
      return Projects.find(
        {
          customer: FlowRouter.getQueryParam('customer'),
          $or: [{ archived: { $exists: false } }, { archived: false }],
        },
        { sort: { priority: 1, name: 1 } },
      )
    }
    return Projects.find(
      { $or: [{ archived: { $exists: false } }, { archived: false }] },
      { sort: { priority: 1, name: 1 } },
    )
  },
  resources() {
    return projectResources.find({}, { sort: { name: 1 } })
  },
  customers() {
    return Customers.find({}, { sort: { name: 1 } })
  },
})

Template.filterbar.events({
  'change .js-projectselect': (event, templateInstance) => {
    event.preventDefault()
    if ($(event.currentTarget).val().length > 0 && !templateInstance.data?.isComponent) {
      FlowRouter.setParams({ projectId: templateInstance.$(event.currentTarget).val().join(',') })
    }
  },
  'change .js-resourceselect': (event, templateInstance) => {
    event.preventDefault()
    if (templateInstance.$(event.currentTarget).val().length > 0
      && !templateInstance.data?.isComponent) {
      FlowRouter.setQueryParams({ resource: templateInstance.$(event.currentTarget).val().join(',') })
    }
  },
  'change .js-customerselect': (event, templateInstance) => {
    event.preventDefault()
    if (templateInstance.$(event.currentTarget).val().length > 0
      && !templateInstance.data?.isComponent) {
      FlowRouter.setQueryParams({ customer: templateInstance.$(event.currentTarget).val().join(',') })
    }
  },
})
