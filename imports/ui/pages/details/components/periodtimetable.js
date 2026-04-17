import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { saveAs } from 'file-saver'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { NullXlsx } from '@neovici/nullxlsx/src/nullxlsx.js'
import './periodtimetable.html'
import './pagination.js'
import './limitpicker.js'
import { i18nReady, t } from '../../../../utils/i18n.js'
import {
  numberWithUserPrecision,
  getUserSetting,
  getUserTimeUnitVerbose,
  addToolTipToTableCell,
  totalHoursForPeriodMapper,
  waitForElement,
  getGlobalSetting,
  showToast,
} from '../../../../utils/frontend_helpers.js'

Template.periodtimetable.onCreated(function periodtimetableCreated() {
  dayjs.extend(utc)
  this.periodTimecards = new ReactiveVar()
  this.totalPeriodTimeCards = new ReactiveVar()
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
        customer: this.data?.customer.get(),
        limit: this.data?.limit.get(),
        page: Number(FlowRouter.getQueryParam('page')),
      }
      if (this.data?.period.get() === 'custom') {
        methodParameters.dates = {
          startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(),
          endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(),
        }
      }
      Meteor.call('getTotalHoursForPeriod', methodParameters, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          this.periodTimecards.set(result.totalHours)
          this.totalPeriodTimeCards.set(result.totalEntries)
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
Template.periodtimetable.onRendered(() => {
  const templateInstance = Template.instance()
  templateInstance.autorun(() => {
    if (i18nReady.get()) {
      let data = []
      if (templateInstance.periodTimecards.get() && templateInstance.projectUsersHandle.ready()) {
        data = templateInstance.periodTimecards.get().map(totalHoursForPeriodMapper)
          .map((entry) => Object.entries(entry)
            .map((key) => key[1]))
      }
      const columns = [
        { name: t('globals.project'), editable: false, format: addToolTipToTableCell },
      ]
      if (getGlobalSetting('showResourceInDetails')) {
        columns.push({
          name: t('globals.resource'), editable: false, format: addToolTipToTableCell,
        })
      }
      columns.push({
        name: getUserTimeUnitVerbose(),
        editable: false,
        format: numberWithUserPrecision,
      })
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
      if (templateInstance.datatable && templateInstance.periodTimecards.get()
        && window.BootstrapLoaded.get()) {
        templateInstance.datatable
          .refresh(data, columns)
        if (templateInstance.periodTimecards.get().length === 0) {
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
Template.periodtimetable.helpers({
  periodTimecards() {
    return Template.instance().periodTimecards.get()
  },
  totalPeriodTimeCards() {
    return Template.instance().totalPeriodTimeCards
  },
  outboundInterfaces: () => Template.instance().outboundInterfaces?.get(),
})
Template.periodtimetable.events({
  'click .js-export-csv': (event, templateInstance) => {
    event.preventDefault()
    let csvArray = [`\uFEFF${t('globals.project')},${t('globals.resource')},${getUserTimeUnitVerbose()}\r\n`]
    if (!getGlobalSetting('showResourceInDetails')) {
      csvArray = [`\uFEFF${t('globals.project')},${getUserTimeUnitVerbose()}\r\n`]
    }
    for (const timeEntry of templateInstance.periodTimecards.get().map(totalHoursForPeriodMapper)) {
      if (getGlobalSetting('showResourceInDetails')) {
        csvArray.push(`${timeEntry.projectId},${timeEntry.userId},${timeEntry.totalHours}\r\n`)
      } else {
        csvArray.push(`${timeEntry.projectId},${timeEntry.totalHours}\r\n`)
      }
    }
    saveAs(new Blob(csvArray, { type: 'text/csv;charset=utf-8;header=present' }), `titra_total_time_${templateInstance.data.period.get()}.csv`)
  },
  'click .js-export-xlsx': (event, templateInstance) => {
    event.preventDefault()
    const data = [[t('globals.project')]]
    if (getGlobalSetting('showResourceInDetails')) {
      data[0].push(t('globals.resource'))
    }
    data[0].push(getUserTimeUnitVerbose())
    for (const timeEntry of templateInstance.periodTimecards.get().map(totalHoursForPeriodMapper)) {
      if (getGlobalSetting('showResourceInDetails')) {
        data.push([timeEntry.projectId, timeEntry.userId, timeEntry.totalHours])
      } else {
        data.push([timeEntry.projectId, timeEntry.totalHours])
      }
    }
    saveAs(new NullXlsx('temp.xlsx', { frozen: 1, filter: 1 }).addSheetFromData(data, 'total time').createDownloadUrl(), `titra_total_time_${templateInstance.data.period.get()}.xlsx`)
  },
  'click .js-outbound-interface': (event, templateInstance) => {
    event.preventDefault()
    Meteor.call('outboundinterfaces.run', { data: templateInstance.periodTimecards.get().map(totalHoursForPeriodMapper), _id: templateInstance.$(event.currentTarget).data('interface-id') }, (error, result) => {
      if (error) {
        showToast(error)
        console.error(error)
      } else {
        showToast(result)
      }
    })
  },
})
Template.periodtimetable.onDestroyed(() => {
  FlowRouter.setQueryParams({ page: null })
  Template.instance().datatable.destroy()
  Template.instance().datatable = undefined
})
