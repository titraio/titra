import './customerdashboardscomponent.html'
import { Dashboards } from '../../../../api/dashboards/dashboards'
import  Projects  from '../../../../api/projects/projects'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import bootstrap from 'bootstrap'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { t } from '../../../../utils/i18n.js'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { showToast,showErrorToast,getGlobalSetting } from '../../../../utils/frontend_helpers'
import { periodToString } from '../../../../utils/periodHelpers'

dayjs.extend(utc)
dayjs.extend(customParseFormat)

Template.customerdashboardscomponent.onCreated(function () {
  const tpl = this;

  tpl.currentPeriod = new ReactiveVar(null);
  tpl.editingDashboard = new ReactiveVar(null);
  tpl.editingDashboardPasswordChanged = new ReactiveVar(false);

  // 1) Subscribe to all dashboards
  tpl.autorun(() => {
    tpl.subscribe('allDashboardsDetails');
  });

  // 2) Whenever dashboards change, subscribe to their related projects
  tpl.autorun(() => {
    const dashboards = Dashboards.find().fetch();

    dashboards.forEach(d => {
      tpl.subscribe('singleProject', d.projectId);
    });
  });
});
Template.customerdashboardscomponent.helpers({

  dashboards: () => (Dashboards.find({}).fetch().length > 0 ? Dashboards.find({}) : false),
  projectName(projectId) {
    const p = Projects.findOne(projectId);
    return p ? p.name : 'N/A';
  },
  projectCustomer(projectId) {
    const p = Projects.findOne(projectId);
    return p ? p.customer : 'N/A';
  },

  dashboardLink(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId);
    if (dashboard.slug){
      return dashboard.slug
    } else {
      return dashboard._id
    }
  },

  dashboardUrl(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId);
    if (dashboard.slug){
      return FlowRouter.url('dashboard', { _id: dashboard.slug })
    } else {
      return FlowRouter.url('dashboard', { _id: dashboard._id })
    }
  },
  dashboardTimeperiod(dashboardId) {
    const dashboard = Dashboards.findOne(dashboardId);
    return periodToString(dashboard.timePeriod)
  },

  editDashboardId() {
    return Template.instance().editingDashboard.get()?._id
  },
  editSelectedProjectName() {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard ? Projects.findOne(dashboard.projectId)?.name || '' : ''
  },
  EditStartDate() {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard ? dayjs(dashboard.startDate).format('YYYY-MM-DD') : ''
  },
  EditEndDate() {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard ? dayjs(dashboard.endDate).format('YYYY-MM-DD') : ''
  },
  EditSlug() {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard ? dashboard.slug : ''
  },
  EditPassword() {
    const dashboard = Template.instance().editingDashboard.get()
    if (dashboard) {
      return dashboard.password ? "******" : ''
    }
  },
  isSelectedPeriod(value) {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard && dashboard.timePeriod === value ? "selected" : ""
  },
  showCustomDates() {
    const tpl = Template.instance()
    const dashboard = tpl.editingDashboard.get()
    // When user changes select in UI
    return tpl.currentPeriod?.get() === "custom"
  },
  EditDashboardURL() {
    const dashboard = Template.instance().editingDashboard.get()
    return dashboard ? FlowRouter.url('dashboard', { _id: dashboard._id }) : ''
  }
})
Template.customerdashboardscomponent.events({
  'change #dashboard-period': function (event, template) {
    template.currentPeriod.set(event.target.value)
  },
  'change #dashboard-password': function (event, template) {
    template.editingDashboardPasswordChanged.set(true)
  },

  'click .js-remove-dashboard': (event, templateInstance) => {
    event.preventDefault()
    const dashboardId = templateInstance.$(event.currentTarget).data('dashboard-id')

    if (confirm(t('administration.confirm_delete'))) {
      Meteor.call('removeDashboard', { dashboardId }, (err, result) => {
        if (err) {
          showErrorToast("Could not remove dashboard. \n" + err.reason );
        } else {
          showToast("Dashboard removed successfully");
        }
      });
    }
  },
  'click .js-edit-dashboard': (event, templateInstance) => {
    event.preventDefault()
    // Get dashboard ID from the clicked element
    const dashboardId = templateInstance.$(event.currentTarget).data('dashboard-id')

    // Find the dashboard in collection
    const dashboard = Dashboards.findOne(dashboardId)
    if (!dashboard) return
    // Store the dashboard in ReactiveVar
    templateInstance.editingDashboard.set(dashboard)
    templateInstance.currentPeriod.set(dashboard.timePeriod)

    // Show the modal
    new bootstrap.Modal(templateInstance.$('.js-dashboard-modal')[0], { focus: false }).show()
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
  'click .js-save-dashboard'(event, template) {
      event.preventDefault()
      const dashboard = template.editingDashboard.get()
      let password
      if (!dashboard) return

      // Read modal inputs
      const dashboardId = dashboard._id
      const timePeriod = document.getElementById("dashboard-period").value
      const startDate = document.getElementById("customStartDate")?.value || undefined
      const endDate = document.getElementById("customEndDate")?.value || undefined
      const slug = document.getElementById("dashboard-slug").value.trim()
      if (template.editingDashboardPasswordChanged.get()) {
        password = document.getElementById("dashboard-password").value.trim()
      } else {
        password = undefined
      }

      Meteor.call("updateDashboard", {
        dashboardId,
        timePeriod,
        startDate: timePeriod === "custom" ? startDate : undefined,
        endDate: timePeriod === "custom" ? endDate : undefined,
        slug,
        password: password || undefined
      }, (err, res) => {
        if (err) {
          showErrorToast('Failed: ' +  (err.reason || 'Update failed'))
        } else {
          showToast('Dashboard updated sucessfully')
          template.editingDashboard.set(null)
          document.querySelector('.js-dashboard-modal .btn-close')?.click()
        }
      })
  }
  })