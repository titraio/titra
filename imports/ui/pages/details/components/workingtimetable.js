import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { saveAs } from 'file-saver'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { NullXlsx } from '@neovici/nullxlsx/src/nullxlsx.js'
import { i18nReady, t } from '../../../../utils/i18n.js'
import {
  addToolTipToTableCell,
  getGlobalSetting,
  numberWithUserPrecision,
  getUserSetting,
  waitForElement,
} from '../../../../utils/frontend_helpers'
import './workingtimetable.html'
import './pagination.js'
import './limitpicker.js'

Template.workingtimetable.onCreated(function workingtimetableCreated() {
  dayjs.extend(utc)
  this.workingTimeEntries = new ReactiveVar()
  this.totalWorkingTimeEntries = new ReactiveVar()

  this.autorun(() => {
    if (this.data?.project.get()
      && this.data?.resource.get()
      && this.data?.period.get()
      && this.data?.limit.get()) {
      this.projectUsersHandle = this.subscribe('projectResources', { projectId: this.data?.project.get() })
      const methodParameters = {
        projectId: this.data?.project.get(),
        userId: this.data?.resource.get(),
        period: this.data?.period.get(),
        limit: this.data?.limit.get(),
        page: Number(FlowRouter.getQueryParam('page')),
      }
      if (this.data?.period.get() === 'custom') {
        methodParameters.dates = {
          startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(),
          endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(),
        }
      }
      Meteor.call('getWorkingHoursForPeriod', methodParameters, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          this.workingTimeEntries.set(result.workingHours.sort((a, b) => a.date - b.date))
          this.totalWorkingTimeEntries.set(result.totalEntries)
        }
      })
    }
  })
})
Template.workingtimetable.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (i18nReady.get()) {
      let data
      if (templateInstance.workingTimeEntries.get()) {
        data = templateInstance.workingTimeEntries.get()
          .map((entry) => Object.entries(entry)
            .map((key) => { if (key[1] instanceof Date) { return dayjs.utc(key[1]).format(getGlobalSetting('dateformat')) } return key[1] }))
      }
      const columns = [
        {
          name: t('globals.date'),
          editable: false,
          compareValue: (cell, keyword) => [dayjs(cell, getGlobalSetting('dateformat')).toDate(), dayjs(keyword, getGlobalSetting('dateformat')).toDate()],
          format: addToolTipToTableCell,
        },
        { name: t('globals.resource'), editable: false, format: addToolTipToTableCell },
        { name: t('details.startTime'), editable: false },
        { name: t('details.breakStartTime'), editable: false },
        { name: t('details.breakEndTime'), editable: false },
        { name: t('details.endTime'), editable: false },
        { name: t('details.totalTime'), editable: false, format: numberWithUserPrecision },
        { name: t('details.regularWorkingTime'), editable: false, format: numberWithUserPrecision },
        { name: t('details.regularWorkingTimeDifference'), editable: false, format: numberWithUserPrecision }]
      if (!templateInstance.datatable) {
        import('frappe-datatable/dist/frappe-datatable.css').then(() => {
          import('frappe-datatable').then((datatable) => {
            const DataTable = datatable.default
            try {
              templateInstance.datatable = new DataTable('#datatable-container', {
                columns,
                serialNoColumn: false,
                clusterize: false,
                layout: 'ratio',
                showTotalRow: true,
                data,
                noDataMessage: t('tabular.sZeroRecords'),
              })
            } catch (error) {
              console.error(`Caught error: ${error}`)
            }
          })
        })
      }
      if (templateInstance.datatable && templateInstance.workingTimeEntries.get()
        && window.BootstrapLoaded.get()) {
        try {
          templateInstance.datatable.refresh(data, columns)
        } catch (error) {
          console.error(`Caught error: ${error}`)
        }
        if (templateInstance.workingTimeEntries.get().length === 0) {
          $('.dt-scrollable').height('auto')
        } else {
          waitForElement(undefined, '.dt-scrollable').then((element) => {
            $(element).height(`${parseInt(document.querySelector('.dt-row.vrow:last-of-type')?.style.top, 10) + 40}px`)
            element.style.overflow = 'hidden'
          })
        }
      }
    }
  })
})
Template.workingtimetable.helpers({
  workingTimeEntries() {
    return Template.instance().workingTimeEntries.get()
  },
  workingTimeSum() {
    return Template.instance().workingTimeEntries.get()
      .reduce(((total, element) => total + element.totalTime), 0)
  },
  regularWorkingTimeSum() {
    return Template.instance().workingTimeEntries.get()
      .reduce(((total, element) => total + element.regularWorkingTime), 0)
  },
  regularWorkingTimeDifferenceSum() {
    return Template.instance().workingTimeEntries.get()
      .reduce(((total, element) => total + element.regularWorkingTimeDifference), 0)
  },
  totalWorkingTimeEntries() {
    return Template.instance().totalWorkingTimeEntries
  },
})
Template.workingtimetable.events({
  'click .js-export-csv': (event, templateInstance) => {
    event.preventDefault()
    const csvArray = [`\uFEFF${t('globals.date')},${t('globals.resource')},${t('details.startTime')},${t('details.breakStartTime')},${t('details.breakEndTime')},${t('details.endTime')},${t('details.totalTime')},${t('details.regularWorkingTime')},${t('details.regularWorkingTimeDifference')}\r\n`]
    for (const timeEntry of templateInstance.workingTimeEntries.get()) {
      csvArray.push(`${dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat'))},${timeEntry.resource},${timeEntry.startTime},${timeEntry.breakStartTime},${timeEntry.breakEndTime},${timeEntry.endTime},${timeEntry.totalTime},${timeEntry.regularWorkingTime},${timeEntry.regularWorkingTimeDifference}\r\n`)
    }
    saveAs(new Blob(csvArray, { type: 'text/csv;charset=utf-8;header=present' }), `titra_working_time_${templateInstance.data.period.get()}.csv`)
  },
  'click .js-export-xlsx': (event, templateInstance) => {
    event.preventDefault()
    const data = [[t('globals.date'), t('globals.resource'), t('details.startTime'), t('details.breakStartTime'), t('details.breakEndTime'), t('details.endTime'), t('details.totalTime'), t('details.regularWorkingTime'), t('details.regularWorkingTimeDifference')]]
    for (const timeEntry of templateInstance.workingTimeEntries.get()) {
      data.push([dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat')), timeEntry.resource, timeEntry.startTime, timeEntry.breakStartTime, timeEntry.breakEndTime, timeEntry.endTime, timeEntry.totalTime, timeEntry.regularWorkingTime, timeEntry.regularWorkingTimeDifference])
    }
    saveAs(new NullXlsx('temp.xlsx', { frozen: 1, filter: 1 }).addSheetFromData(data, 'working time').createDownloadUrl(), `titra_working_time_${templateInstance.data.period.get()}.xlsx`)
  },
})
Template.workingtimetable.onDestroyed(() => {
  FlowRouter.setQueryParams({ page: null })
  Template.instance().datatable.destroy()
  Template.instance().datatable = undefined
})
