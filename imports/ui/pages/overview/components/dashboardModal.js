import bootstrap from 'bootstrap'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { t } from '../../../../utils/i18n'
import { showErrorToast,showToast } from '../../../../utils/frontend_helpers'
import { sanitizeSlug } from '../../../../utils/sanitizer'

import Projects from '../../../../api/projects/projects'
import '../../details/components/periodpicker.js'
import './dashboardModal.html'

Template.dashboardModal.onCreated(function dashboardModalCreated() {
  this.subscribe('myprojects', {})
  this.slugAvailable = new ReactiveVar(null); // null = untouched
  this.slugSanitized = new ReactiveVar(null); // null = untouched
  this.passwordInserted = new ReactiveVar(null);
  this.dashboardId = new ReactiveVar(null)
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
  dashboardId() {
    return Template.instance().dashboardId.get()
  },
  selectedProjectName() {
    const project = Projects.findOne({ _id: Template.instance().data.projectId.get() })
    if (project) {
      return project.name
    }
    return ''
  },
  dashboardURL() {
    const dashboardId = Template.instance().dashboardId.get()
    if (dashboardId.slug){
      return FlowRouter.url('dashboard', { _id: dashboardId.slug })
    }
    if (dashboardId._id) {
      return FlowRouter.url('dashboard', { _id: dashboardId._id })
    }
    return ''
  },
  slugStatus() {
    return Template.instance().slugAvailable.get();
  },
  slugSanitzed() {
    return Template.instance().slugSanitized.get();
  },
  slugStatusOn() {
    if (Template.instance().slugAvailable.get() != null) {
      return true
    } else {
      return false
    }
  },
  passwordWarningOn() {
    return !Template.instance().passwordInserted.get()
  },
})

Template.dashboardModal.events({
  'click .js-create-dashboard': (event, templateInstance) => {
    event.preventDefault()
    let startDate, endDate
    const period = document.getElementById("dashboardPeriod")?.value
    if (period === 'custom'){
      startDate = document.getElementById("customStartDate")?.value
      endDate = document.getElementById("customEndDate")?.value
    } else {
      startDate = 'N/A'
      endDate = 'N/A'
    }
    const password = document.getElementById("dashboard-password")?.value
    const slug = document.getElementById("dashboard-slug")?.value

    Meteor.call('addDashboard', {
      projectId: templateInstance.data.projectId.get(), timePeriod: period, startDate : startDate, endDate: endDate, password : password,slug:slug
    }, (error, _id) => {
      if (error) {
        showErrorToast(t('notifications.dashboard_creation_failed') + '\n'+error.reason)
      } else {
        showToast('Dashboard created successfully')
        templateInstance.dashboardId.set({_id,slug})
      }
    })
  },
  'click #togglePassword'(event, template) {
    const input = template.$('#dashboard-password');
    const icon  = template.$('#eyeIcon');

    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      icon.removeClass('fa-eye').addClass('fa-eye-slash');
    } else {
      input.attr('type', 'password');
      icon.removeClass('fa-eye-slash').addClass('fa-eye');
    }
  },

  'keyup #dashboard-slug'(event, template) {
    const slug = event.target.value.trim();

    // If empty → reset indicator
    if (!slug) {
      template.slugAvailable.set(null);
      template.slugSanitized.set(false);
      return;
    }

    const sanitizedSlug = sanitizeSlug(slug)

    if (sanitizedSlug != slug) {
      template.slugSanitized.set(true);
      event.target.value = sanitizedSlug
    }
    Meteor.call('checkDashboardSlug', { slug:sanitizedSlug }, (err, res) => {
      if (err) {
        template.slugAvailable.set(null);
      } else {
        template.slugAvailable.set(res); // res = true (ok) or false (taken)
      }
    });
  },

  'keyup #dashboard-password'(event, template) {
    const password = event.target.value.trim();
    if (!password) {
      template.passwordInserted.set(false);
    } else {
      template.passwordInserted.set(true);
    }

  }

})
