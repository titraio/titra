import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { saveAs } from 'file-saver'
import { NullXlsx } from '@neovici/nullxlsx/src/nullxlsx.js'
import './dailytimetable.html'
import './pagination.js'
import './limitpicker.js'
import {
  getGlobalSetting,
  numberWithUserPrecision,
  getUserSetting,
  getUserTimeUnitVerbose,
  addToolTipToTableCell,
  dailyTimecardMapper,
  waitForElement,
  showToast
} from '../../../../utils/frontend_helpers'
import { i18nReady, t } from '../../../../utils/i18n.js'

Template.dailytimetable.onCreated(function dailytimetablecreated() {
  dayjs.extend(utc)
  this.dailyTimecards = new ReactiveVar()
  this.totalEntries = new ReactiveVar()
  this.outboundInterfaces = new ReactiveVar([])
  this.autorun(() => {
    if (this.data?.project.get()
      && this.data?.resource.get()
      && this.data?.period.get()
      && this.data?.limit.get()
      && this.data?.customer.get()) {
      this.projectUsersHandle = this.subscribe('projectResources', { projectId: this.data?.project.get() })
      const methodParameters = {
        projectId: this.data?.project.get(),
        userId: this.data?.resource.get(),
        period: this.data?.period.get(),
        limit: this.data?.limit.get(),
        customer: this.data?.customer.get(),
        page: Number(FlowRouter.getQueryParam('page')),
      }
      if (this.data?.period.get() === 'custom') {
        methodParameters.dates = {
          startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(),
          endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(),
        }
      }
      Meteor.call('getDailyTimecards', methodParameters, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          this.dailyTimecards.set(result.dailyHours.sort((a, b) => b._id.date - a._id.date))
          this.totalEntries.set(result.totalEntries)
        }
      })
    }
  })
  Meteor.call('outboundinterfaces.get', (error, result) => {
    if (error) {
      showToast(error)
      console.error(error)
    } else {
      this.outboundInterfaces.set(result)
    }
  })
})
Template.dailytimetable.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (i18nReady.get()) {
      let data = []
      if (templateInstance.dailyTimecards.get() && templateInstance.projectUsersHandle.ready()) {
        data = templateInstance.dailyTimecards.get().map(dailyTimecardMapper)
          .map((entry) => Object.entries(entry)
            .map((key) => { if (key[1] instanceof Date) { return dayjs.utc(key[1]).format(getGlobalSetting('dateformat')) } return key[1] }))
      }
      const columns = [
        {
          name: t('globals.date'),
          editable: false,
          width: 1,
          compareValue: (cell, keyword) => [dayjs(cell, getGlobalSetting('dateformat')).toDate(), dayjs(keyword, getGlobalSetting('dateformat')).toDate()],
        },
        {
          name: t('globals.project'),
          editable: false,
          width: 2,
          format: addToolTipToTableCell,
        },
      ]
      if (getGlobalSetting('showResourceInDetails')) {
        columns.push({
          name: t('globals.resource'),
          editable: false,
          width: 2,
          format: addToolTipToTableCell,
        })
      }
      columns.push(
        {
          name: getUserTimeUnitVerbose(),
          editable: false,
          width: 1,
          format: numberWithUserPrecision,
        },
      )
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
      if (templateInstance.datatable && templateInstance.dailyTimecards.get()
        && window.BootstrapLoaded.get() && data.length > 0) {
        try {
          templateInstance.datatable.refresh(data, columns)
        } catch (error) {
          console.error(`Caught error: ${error}`)
        }
        if (templateInstance.dailyTimecards.get().length === 0) {
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
Template.dailytimetable.helpers({
  dailyTimecards: () => Template.instance().dailyTimecards.get(),
  totalEntries: () => Template.instance().totalEntries,
  outboundInterfaces: () => Template.instance().outboundInterfaces?.get(),
})
Template.dailytimetable.events({
  'click .js-export-csv': (event, templateInstance) => {
    event.preventDefault()
    let unit = t('globals.hour_plural')
    if (Meteor.user()) {
      unit = getUserTimeUnitVerbose()
    }
    let csvArray = [`\uFEFF${t('globals.date')},${t('globals.project')},${t('globals.resource')},${unit}\r\n`]
    if (!getGlobalSetting('showResourceInDetails')) {
      csvArray = [`\uFEFF${t('globals.date')},${t('globals.project')},${unit}\r\n`]
    }
    for (const timeEntry of templateInstance.dailyTimecards.get().map(dailyTimecardMapper)) {
      if (getGlobalSetting('showResourceInDetails')) {
        csvArray.push(`${dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat'))},${timeEntry.projectId},${timeEntry.userId},${timeEntry.totalHours}\r\n`)
      } else {
        csvArray.push(`${dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat'))},${timeEntry.projectId},${timeEntry.totalHours}\r\n`)
      }
    }
    saveAs(new Blob(csvArray, { type: 'text/csv;charset=utf-8;header=present' }), `titra_daily_time_${templateInstance.data.period.get()}.csv`)
  },
  'click .js-export-xlsx': (event, templateInstance) => {
    event.preventDefault()
    let unit = t('globals.hour_plural')
    if (Meteor.user()) {
      unit = getUserTimeUnitVerbose()
    }
    let data = [[t('globals.date'), t('globals.project'), t('globals.resource'), unit]]
    if (!getGlobalSetting('showResourceInDetails')) {
      data = [[t('globals.date'), t('globals.project'), unit]]
    }
    for (const timeEntry of templateInstance.dailyTimecards.get().map(dailyTimecardMapper)) {
      if (getGlobalSetting('showResourceInDetails')) {
        data.push([dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat')), timeEntry.projectId, timeEntry.userId, timeEntry.totalHours])
      } else {
        data.push([dayjs.utc(timeEntry.date).format(getGlobalSetting('dateformat')), timeEntry.projectId, timeEntry.totalHours])
      }
    }
    saveAs(new NullXlsx('temp.xlsx', { frozen: 1, filter: 1 }).addSheetFromData(data, 'daily').createDownloadUrl(), `titra_daily_time_${templateInstance.data.period.get()}.xlsx`)
  },
  'click .js-outbound-interface': (event, templateInstance) => {
    event.preventDefault()
    Meteor.call('outboundinterfaces.run', { data: templateInstance.dailyTimecards.get().map(dailyTimecardMapper), _id: templateInstance.$(event.currentTarget).data('interface-id') }, (error, result) => {
      if (error) {
        showToast(error)
        console.error(error)
      } else {
        showToast(result)
      }
    })
  },
})
Template.dailytimetable.onDestroyed(() => {
  FlowRouter.setQueryParams({ page: null })
  Template.instance().datatable.destroy()
  Template.instance().datatable = undefined
})
