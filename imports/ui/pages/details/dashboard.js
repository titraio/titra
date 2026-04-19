import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import randomColor from 'randomcolor'
import { t } from '../../../utils/i18n.js'
import { periodToDates, periodToString } from '../../../utils/periodHelpers.js'
import { showErrorToast,showToast } from '../../../utils/frontend_helpers'

import {
  emojify,
  getUserSetting,
  getGlobalSetting,
  timeInUserUnit,
  getUserTimeUnitVerbose,
  waitForElement,
} from '../../../utils/frontend_helpers'
import './dashboard.html'
import Timecards from '../../../api/timecards/timecards'
import Projects from '../../../api/projects/projects'
import { Dashboards } from '../../../api/dashboards/dashboards'

function timeInUnitHelper(hours) {
  if (Dashboards.findOne()) {
    if (Dashboards.findOne().timeunit === 'd') {
      return Dashboards.findOne().hoursToDays
        ? Number(hours / Dashboards.findOne().hoursToDays).toFixed(getGlobalSetting('precision')) : Number(hours / getGlobalSetting('hoursToDays')).toFixed(getGlobalSetting('precision'))
    }
    if (Dashboards.findOne().timeunit === 'm') {
      return Number(hours * 60).toFixed(getGlobalSetting('precision'))
    }
  } else if (Meteor.user()) {
    return timeInUserUnit(hours)
  }
  return Number(hours).toFixed(getGlobalSetting('precision'))
}
function timeUnitHelper() {
  if (Dashboards.findOne()) {
    switch (Dashboards.findOne().timeunit) {
      case 'd':
        return t('globals.day_plural')
      case 'h':
        return t('globals.hour_plural')
      case 'm':
        return t('globals.minute_plural')
      default:
        return t('globals.hour_plural')
    }
  }
  if (Meteor.user() && getUserSetting('timeunit')) {
    return getUserTimeUnitVerbose()
  }
  if (getGlobalSetting('timeunit') === 'd') {
    return t('globals.day_plural')
  }
  if (getGlobalSetting('timeunit') === 'h') {
    return t('globals.hour_plural')
  }
  if (getGlobalSetting('timeunit') === 'm') {
    return t('globals.minute_plural')
  }
  return t('globals.hour_plural')
}
Template.dashboard.onCreated(function dashboardCreated() {
  let handle
  let handleDetails = null
  this.periodDates       = new ReactiveVar({
    startDate: 'N/A',
    endDate: 'N/A'
  });
  this.hasPassword       = new ReactiveVar(null);
  this.isAuthenticated   = new ReactiveVar(null);
  this.password          = new ReactiveVar(null);
  this.totalHours        = new ReactiveVar(0)

  dayjs.extend(utc)
  dayjs.extend(customParseFormat)
  this.autorun(() => {
    if (FlowRouter.getParam('_id')) {
      const dashboardIdentifier = FlowRouter.getParam('_id');
      handle = this.subscribe('dashboardPublicMeta', dashboardIdentifier);
      if (handle.ready()) {
        const dashboard_check = Dashboards.findOne()
        if (!dashboard_check.exists) {
          FlowRouter.go('/404');
        } else {
          this.hasPassword.set(dashboard_check.hasPassword);
          if (dashboard_check.hasPassword && this.password.get()){
            handleDetails = this.subscribe('dashboardDetailsById', dashboard_check._id,this.password.get(),{
              onStop: function(error) {
                if (error) {
                  showErrorToast("Dashboard access error" + '\n' + error.reason);

                }
              }
            });
          } else if (!dashboard_check.hasPassword){
            handleDetails = this.subscribe('dashboardDetailsById', dashboard_check._id,'');
            this.password.set('')
          }
          // Done subscription, fetch timecards and project name
          const dashboard = Dashboards.findOne({projectId: {$exists: true }});
          if (handleDetails && handleDetails.ready()) {
            this.subscribe('publicProjectName', dashboard.projectId)
            this.subscribe('dashboardTimecardsById',dashboard._id,this.password.get(), {
              onStop: function(error) {
                if (error) {
                  showErrorToast("Dashboard access error" + '\n' + error.reason);

                }
              }
            });
            if (dashboard && Timecards.findOne()){
              this.isAuthenticated.set(true);
              if (dashboard.timePeriod == 'custom') {
                this.periodDates.set({
                  startDate: dashboard.startDate,
                  endDate: dashboard.endDate
                });
              } else if (dashboard.timePeriod == 'all') {
                if (handleDetails.ready()){
                  const oldestCard = Timecards.findOne({}, {
                    sort: { date: 1 }, // Ascending (oldest first)
                    limit: 1
                  });

                  // Get newest date
                  const newestCard = Timecards.findOne({}, {
                    sort: { date: -1 }, // Descending (newest first)
                    limit: 1
                  });
                  this.periodDates.set({
                    startDate: dayjs.utc(oldestCard.date).format(getGlobalSetting('dateformat')),
                    endDate: dayjs.utc(newestCard.date).format(getGlobalSetting('dateformat'))
                  });
                } else {
                  this.periodDates.set({
                    startDate: 'Loading ...',
                    endDate:   'Loading ...'
                  });
                }
              } else {
                periodToDates(dashboard.timePeriod).then((dates) => {
                  this.periodDates.set({
                    startDate: dayjs.utc(dates.startDate).format(getGlobalSetting('dateformat')),
                    endDate: dayjs.utc(dates.endDate).format(getGlobalSetting('dateformat'))
                  });
                });
              }
            }
          }
        }
      }
    } else if (this.data?.project.get()
      && this.data?.resource.get()
      && this.data?.customer.get()
      && this.data?.period.get() && this.data?.period.get() !== 'all') {

        this.hasPassword.set(false);
        this.isAuthenticated.set(true);

        // When this is internally in the overview
        if (this.data?.period.get() === 'custom') {
          this.detailedTimeEntriesHandle = this.subscribe(
            'getDetailedTimeEntriesForPeriod',
            {
              projectId: this.data?.project.get(),
              userId: this.data?.resource.get(),
              customer: this.data?.customer.get(),
              period: this.data?.period.get(),
              dates: {
                startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(),
                endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(),
              },
              limit: -1,
            },
          )
        } else {
          this.detailedTimeEntriesHandle = this.subscribe(
            'getDetailedTimeEntriesForPeriod',
            {
              projectId: this.data?.project.get(),
              userId: this.data?.resource.get(),
              customer: this.data?.customer.get(),
              period: this.data?.period.get(),
              limit: -1,
            },
          )
       }
    }
  })
})

Template.dashboard.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady() && Timecards.find().fetch().length > 0) {
      window.requestAnimationFrame(() => {
        import('frappe-charts').then(async (chartModule) => {
          const { Chart } = chartModule
          let temphours = 0
          templateInstance.totalHours.set(0)
          const taskmap = new Map()
          const datemap = new Map()
          const precision = getUserSetting('precision')
          for (const timecard of Timecards.find({}, { sort: { date: 1 } }).fetch()) {
            const emojifiedTask = await emojify(timecard.task)
            taskmap.set(
              $('<span>').text(emojifiedTask).html(),
              taskmap.get(timecard.task)
                ? Number(taskmap.get(timecard.task) + Number(timeInUnitHelper(timecard.hours)))
                : Number(timeInUnitHelper(timecard.hours)),
            )
            datemap.set(
              dayjs.utc(timecard.date).format('DDMMYYYY'),
              datemap.get(dayjs.utc(timecard.date).format('DDMMYYYY'))
                ? Number(Number(datemap.get(dayjs(timecard.date).format('DDMMYYYY'))) + Number(timeInUnitHelper(timecard.hours)))
                : Number(timeInUnitHelper(timecard.hours)),
            )
            temphours += timecard.hours
          }
          templateInstance.totalHours.set(temphours)
          if (!templateInstance.view.isDestroyed) {
            waitForElement(templateInstance, '.js-linechart-container').then((linechartContainer) => {
              if (templateInstance.linechart) {
                templateInstance.linechart.destroy()
              }
              templateInstance.linechart = new Chart(linechartContainer, {
                type: 'bar',
                colors: ['#009688'],
                data: {
                  labels: [...datemap.keys()].map((value) => dayjs.utc(value, 'DDMMYYYY').format(getGlobalSetting('dateformat'))),
                  datasets: [{
                    values: [...datemap.values()],
                  }],
                },
                barOptions: {
                  spaceRatio: 0.2, // default: 1
                },
                tooltipOptions: {
                  formatTooltipY: (value) => `${Number(value).toFixed(precision)} ${timeUnitHelper()}`,
                },
              })
            })
            waitForElement(templateInstance, '.js-piechart-container').then((piechartContainer) => {
              if (templateInstance.piechart) {
                templateInstance.piechart.destroy()
              }
              templateInstance.piechart = new Chart(piechartContainer, {
                type: 'pie',
                colors: randomColor({ hue: '#455A64', luminosity: 'dark', count: taskmap.size }),
                maxSlices: 6,
                data: {
                  labels: [...taskmap.keys()],
                  datasets: [{
                    values: [...taskmap.values()],
                  }],
                },
                tooltipOptions: {
                  formatTooltipY: (value) => `${value} ${getUserSetting('timeunit') === 'd' ? t('globals.day_plural') : t('globals.hour_plural')}`,
                },
              })
            })
          }
        })
      })
    } else {
      if (templateInstance.linechart) {
        waitForElement(templateInstance, '.js-linechart-container').then((linechartContainer) => {
          templateInstance.linechart.destroy()
          linechartContainer.innerHTML = ''
        })
      }
      if (templateInstance.piechart) {
        waitForElement(templateInstance, '.js-piechart-container').then((piechartContainer) => {
          templateInstance.piechart.destroy()
          piechartContainer.innerHTML = ''
        })
      }
    }
  })
})

Template.dashboard.helpers({
  timecards: () => (Timecards.find().fetch().length > 0 ? Timecards.find() : false),
  projectName: () => (Projects.findOne() ? Projects.findOne().name : false),
  formatDate: (date) => dayjs.utc(date).format(getGlobalSetting('dateformatVerbose')),
  period: () => periodToString(Dashboards.findOne().timePeriod),
  hasPassword: () => {
    const instance = Template.instance();
    return instance.hasPassword.get();
  },
  isAuthenticated : () => {
    const instance = Template.instance();
    return instance.isAuthenticated.get();
  },
  timeunit: () => timeUnitHelper(),
  startDate: () => {
    const instance = Template.instance();
    return instance.periodDates.get().startDate;   // reactive!
  },
  endDate: () => {
    const instance = Template.instance();
    return instance.periodDates.get().endDate;   // reactive!
  },
  dashBoardResource: () => (Dashboards.findOne()
    ? Meteor.users.findOne(Dashboards.findOne().resourceId)?.profile?.name : false),
  customer: () => (Dashboards.findOne() ? Dashboards.findOne().customer : false),
  isCustomerDashboard: () => (Dashboards.findOne() ? (Dashboards.findOne().customer && Dashboards.findOne().customer !== 'all') : false),
  timeInUnit: (hours) => timeInUnitHelper(hours),
  totalHours: () => {
    if (Dashboards.findOne()) {
      if (Dashboards.findOne().timeunit === 'd') {
        const precision = getUserSetting('precision')
        return Dashboards.findOne().hoursToDays
          ? Number(Template.instance().totalHours.get() / Dashboards.findOne().hoursToDays)
            .toFixed(precision)
          : Number(Template.instance().totalHours.get() / getGlobalSetting('hoursToDays')).toFixed(precision)
      }
      if (Dashboards.findOne().timeunit === 'm') {
        const precision = getUserSetting('precision')
        return Dashboards.findOne().hoursToDays
          ? Number(Template.instance().totalHours.get() * 60)
            .toFixed(precision)
          : Number(Template.instance().totalHours.get() * 60).toFixed(precision)
      }
    }
    return Template.instance().totalHours.get().toFixed(getGlobalSetting('precision'))
  },
  dashboardId: () => FlowRouter.getParam('_id'),
})

Template.dashboard.events({
  'click #pwSubmit'(e, tpl) {
    const password = tpl.find('#pwInput').value.trim();
    tpl.password.set(password);
  }
});

Template.dashboard.onDestroyed(() => {
  const templateInstance = Template.instance()
  if (templateInstance.linechart) {
    waitForElement(templateInstance, '.js-linechart-container').then(() => {
      templateInstance.linechart.destroy()
    })
  }
  if (templateInstance.piechart) {
    waitForElement(templateInstance, '.js-piechart-container').then(() => {
      templateInstance.piechart.destroy()
    })
  }
})
