import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import './dashboardList.html'

import { Dashboards } from '../../../api/dashboards/dashboards'
import  Projects  from '../../../api/projects/projects'
import bootstrap from 'bootstrap'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { t } from '../../../utils/i18n.js'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { showToast,showErrorToast,getGlobalSetting } from '../../../utils/frontend_helpers'
import { periodToString } from '../../../utils/periodHelpers'

dayjs.extend(utc)
dayjs.extend(customParseFormat)

Template.dashboardList.onCreated(function () {
  const tpl = this;

  tpl.currentPeriod = new ReactiveVar(null);
  tpl.editingDashboard = new ReactiveVar(null);
  tpl.editingDashboardPasswordChanged = new ReactiveVar(false);

  // 🔥 FILTER STATE
  tpl.selectedCustomers = new ReactiveVar([]);
  tpl.selectedProjects = new ReactiveVar([]);

  tpl.autorun(() => {
    tpl.subscribe('myDashboards');
    tpl.subscribe('myprojects'); // make sure this publication exists
  });

  tpl.autorun(() => {
    Dashboards.find().forEach(d => {
      tpl.subscribe('singleProject', d.projectId);
    });
  });

});

Template.dashboardList.helpers({
  // dashboards: () => (Dashboards.find({}).fetch().length > 0 ? Dashboards.find({}) : false),
  dashboards() {
    const tpl = Template.instance();
    const customers = tpl.selectedCustomers.get();
    const projects  = tpl.selectedProjects.get();

    let projectIds = [];

    // Filter by customer → get matching projects
    if (customers.length > 0) {
      projectIds = Projects.find(
        { customer: { $in: customers } },
        { fields: { _id: 1 } }
      ).map(p => p._id);

    }

    let query = {};

    if (projects.length > 0) {
      query.projectId = { $in: projects };
    } else if (projectIds.length > 0) {
      query.projectId = { $in: projectIds };
    }

    const result = Dashboards.find(query);
    return result.count() ? result : false;
  },

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
  },
  customers() {
    const customers = Projects.find(
      {},
      { fields: { customer: 1 } }
    ).map(p => p.customer).filter(Boolean);

    return [...new Set(customers)];
  },
  customerFilterLabel() {
    const selected = Template.instance().selectedCustomers.get();
    if (!selected.length) return 'Select customers';
    return `${selected.length} customer(s) selected`;
  },

  projectFilterLabel() {
    const selected = Template.instance().selectedProjects.get();
    if (!selected.length) return 'Select projects';
    return `${selected.length} project(s) selected`;
  },

  filteredProjects() {
    const tpl = Template.instance();
    const customers = tpl.selectedCustomers.get();

    if (customers.length === 0) {
      return Projects.find({}, { sort: { name: 1 } });
    }

    return Projects.find(
      { customer: { $in: customers } },
      { sort: { name: 1 } }
    );
  },
})
Template.dashboardList.events({
  'change .js-customer-checkbox'(e, tpl) {
    const value = e.target.value;
    let selected = tpl.selectedCustomers.get();

    if (e.target.checked) {
      selected = [...new Set([...selected, value])];
    } else {
      selected = selected.filter(v => v !== value);
    }

    tpl.selectedCustomers.set(selected);
    tpl.selectedProjects.set([]); // reset projects when customers change
  },

  'change .js-project-checkbox'(e, tpl) {
    const value = e.target.value;
    let selected = tpl.selectedProjects.get();

    if (e.target.checked) {
      selected = [...new Set([...selected, value])];
    } else {
      selected = selected.filter(v => v !== value);
    }

    tpl.selectedProjects.set(selected);
  },

  'click .js-clear-filters'(e, tpl) {
    e.preventDefault();

    tpl.selectedCustomers.set([]);
    tpl.selectedProjects.set([]);

    tpl.$('.js-customer-checkbox').prop('checked', false);
    tpl.$('.js-project-checkbox').prop('checked', false);
  },

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