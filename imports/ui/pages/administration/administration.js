import bootstrap from 'bootstrap'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import './administration.html'
import '../details/components/limitpicker.js'
import './components/globalsettingscomponent.js'
import './components/customfieldscomponent.js'
import './components/userscomponent.js'
import './components/extensionscomponent.js'
import './components/customerdashboardscomponent.js'
import './components/oidccomponent.js'
import './components/transactionscomponent.js'
import './components/inboundinterfacescomponent.js'
import './components/outboundinterfacescomponent.js'
import './components/webhookverificationcomponent.js'

Template.administration.onCreated(function administrationCreated() {
  this.activeTab = new ReactiveVar()
  this.subscribe('userRoles')
  this.autorun(() => {
    $(`#${this.activeTab.get()}`).tab('show')
  })
})
Template.administration.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady()) {
      if (!Meteor.loggingIn() && !Meteor.user()?.isAdmin) {
        FlowRouter.go('/')
      }
      if (FlowRouter.getQueryParam('activeTab')) {
        templateInstance.activeTab.set(FlowRouter.getQueryParam('activeTab'))
      } else {
        templateInstance.activeTab.set('globalsettings-tab')
      }
    }
  })
})
Template.administration.helpers({
  isActive(tab) {
    return Template.instance().activeTab.get() === tab
  },
})
Template.administration.events({
  'click .accordion-button': (event) => {
    event.preventDefault()
    bootstrap.Collapse
      .getOrCreateInstance(event.currentTarget.parentNode.nextElementSibling).toggle()
  },
  'click .nav-link[data-bs-toggle]': (event, templateInstance) => {
    FlowRouter.setQueryParams({ activeTab: templateInstance.$(event.currentTarget)[0].id })
  },
})
