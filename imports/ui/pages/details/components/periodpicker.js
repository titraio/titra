import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import bootstrap from 'bootstrap'
import './periodpicker.html'
import { getUserSetting } from '../../../../utils/frontend_helpers'

Template.periodpicker.onCreated(function () {
  dayjs.extend(utc)
  this.period = new ReactiveVar('')
})

Template.periodpicker.events({
  'change select': (event, templateInstance) => {
    const value = event.currentTarget.value
    templateInstance.period.set(value)

    // const queryParamKey = templateInstance.data.id || 'period'; // fallback to "period"
    const periodKey = templateInstance.data?.id || 'period';
    FlowRouter.setQueryParams({ [periodKey]: value });

    // FlowRouter.setQueryParams({ [queryParamKey]: value });
    // FlowRouter.setQueryParams({ period: value })

    if (value === 'custom') {
      templateInstance.modal = new bootstrap.Modal(
        templateInstance.$('.js-custom-period-modal')[0]
      )
      templateInstance.modal.show()
    }

    $(event.currentTarget).blur()
  },

  'focus select': (event) => {
    if (event.currentTarget.value === 'custom') {
      event.currentTarget.selectedIndex = 0
      $(event.currentTarget).trigger('blur')
    }
  },

  'click .js-save': (event, templateInstance) => {
    event.preventDefault()

    const customStartDateRaw = templateInstance.$('#customStartDate').val()
    const customEndDateRaw = templateInstance.$('#customEndDate').val()

    const customStartDate = dayjs.utc(customStartDateRaw).isValid()
      ? dayjs.utc(customStartDateRaw).toDate()
      : false

    const customEndDate =
      dayjs.utc(customEndDateRaw).isValid() &&
      dayjs.utc(customEndDateRaw).isAfter(dayjs.utc(customStartDateRaw))
        ? dayjs.utc(customEndDateRaw).toDate()
        : false

    if (customStartDate && customEndDate) {
      Meteor.call('setCustomPeriodDates', { customStartDate, customEndDate }, (error) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('#customStartDate').removeClass('is-invalid')
          templateInstance.$('#customEndDate').removeClass('is-invalid')
          templateInstance.modal.toggle()
        }
      })
    } else {
      templateInstance.$('#customStartDate').addClass('is-invalid')
      templateInstance.$('#customEndDate').addClass('is-invalid')
    }
  },
})

Template.periodpicker.onRendered(function () {
  this.autorun(() => {
    const periodKey = this.data?.id || 'period';   // use passed id or fallback
    const periodParam = FlowRouter.getQueryParam(periodKey);
    const select = this.$('select')

    if (periodParam) {
      this.period.set(periodParam)
      select.val(periodParam)
    } else {
      if (FlowRouter.getRouteName() === 'timecards') {
        this.period.set('currentMonth')
      }
      if (FlowRouter.getRouteName() === 'projectlist') {
        this.period.set('all')
      }

      select.val(this.period.get())
    }
  })
})

Template.periodpicker.helpers({
  startDate: () =>
    getUserSetting('customStartDate')
      ? dayjs.utc(getUserSetting('customStartDate')).format('YYYY-MM-DD')
      : dayjs.utc().startOf('month').format('YYYY-MM-DD'),

  endDate: () =>
    getUserSetting('customEndDate')
      ? dayjs.utc(getUserSetting('customEndDate')).format('YYYY-MM-DD')
      : dayjs.utc().format('YYYY-MM-DD'),

  defaultId(passedId) {
    return passedId || 'period'
  },
})
