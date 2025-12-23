import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { saveAs } from 'file-saver'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { NullXlsx } from '@neovici/nullxlsx'
import bootstrap from 'bootstrap'
import { i18nReady, t } from '../../../../utils/i18n.js'
import Timecards from '../../../../api/timecards/timecards'
import CustomFields from '../../../../api/customfields/customfields'
import {
  addToolTipToTableCell,
  timeInUserUnit,
  getGlobalSetting,
  numberWithUserPrecision,
  getUserSetting,
  getUserTimeUnitVerbose,
  showToast,
  waitForElement,
} from '../../../../utils/frontend_helpers'
import { projectResources } from '../../../../api/users/users.js'
import Projects from '../../../../api/projects/projects'
import { buildDetailedTimeEntriesForPeriodSelectorAsync } from '../../../../utils/server_method_helpers'
import './detailtimetable.html'
import './pagination.js'
import './limitpicker.js'

const Counts = new Mongo.Collection('counts')

dayjs.extend(utc)
dayjs.extend(customParseFormat)

const customFieldType = 'name'

function detailedDataTableMapper(entry, forExport) {
  const project = Projects.findOne({ _id: entry.projectId })
  let mapping = [entry.projectId,
    dayjs.utc(entry.date).format(getGlobalSetting('dateformat')),
    entry.task.replace(/^=/, '\\=')]
  if (getGlobalSetting('showResourceInDetails')) {
    mapping.push(entry.userId)
  }
  if (forExport) {
    mapping = [project?.name ? project.name : '',
      dayjs.utc(entry.date).format(getGlobalSetting('dateformat')),
      entry.task.replace(/^=/, '\\=')]
    if (getGlobalSetting('showResourceInDetails')) {
      mapping.push(projectResources.findOne() ? projectResources.findOne({ _id: entry.userId })?.name : '')
    }
  }
  if (getGlobalSetting('showCustomFieldsInDetails')) {
    if (CustomFields.find({ classname: 'time_entry' }).count() > 0) {
      for (const customfield of CustomFields.find({ classname: 'time_entry' }).fetch()) {
        mapping.push(entry[customfield[customFieldType]])
      }
    }
    if (CustomFields.find({ classname: 'project' }).count() > 0) {
      for (const customfield of CustomFields.find({ classname: 'project' }).fetch()) {
        mapping.push(project[customfield[customFieldType]])
      }
    }
  }
  if (getGlobalSetting('showCustomerInDetails')) {
    mapping.push(project ? project.customer : '')
  }
  if (getGlobalSetting('useState')) {
    mapping.push(entry.state)
  }
  if (getGlobalSetting('useStartTime')) {
    mapping.push(dayjs.utc(entry.date).local().format('HH:mm')) // Ensure consistent timezone usage
    mapping.push(dayjs.utc(entry.date).local().add(entry.hours, 'hour').format('HH:mm')) // Ensure consistent timezone usage
  }
  mapping.push(Number(timeInUserUnit(entry.hours)))
  if (getGlobalSetting('showRateInDetails')) {
    let resourceRate
    if (project.rates) {
      resourceRate = project.rates[entry.userId]
    }
    const rate = entry.taskRate || resourceRate || project.rate || 0
    mapping.push(rate)
  }
  mapping.push(entry._id)
  return mapping
}
Template.detailtimetable.onCreated(function workingtimetableCreated() {
  this.totalDetailTimeEntries = new ReactiveVar()
  this.search = new ReactiveVar()
  this.sort = new ReactiveVar()
  this.tcid = new ReactiveVar()
  this.selector = new ReactiveVar()
  this.filters = new ReactiveVar({})
  this.outboundInterfaces = new ReactiveVar([])
  this.subscribe('customfieldsForClass', { classname: 'time_entry' })
  this.subscribe('customfieldsForClass', { classname: 'project' })
  this.autorun(() => {
    if (this.data?.project.get()
      && this.data?.resource.get()
      && this.data?.customer.get()
      && this.data?.period.get()
      && this.data?.limit.get()) {
        this.myProjectsHandle = this.subscribe('myprojects', {})
        this.projectResourcesHandle = this.subscribe('projectResources', { projectId: this.data?.project.get() })
        const subscriptionParameters = {
          projectId: this.data?.project.get(),
          userId: this.data?.resource.get(),
          customer: this.data?.customer.get(),
          period: this.data?.period.get(),
          limit: this.data?.limit.get(),
          search: this.search.get(),
          sort: this.sort.get(),
          page: Number(FlowRouter.getQueryParam('page')),
          filters: this.filters.get(),
        }
        if (this.data?.period.get() === 'custom') {
          subscriptionParameters.dates = {
            startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(), // Ensure consistent timezone usage
            endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(), // Ensure consistent timezone usage
          }
        }
        this.detailedEntriesPeriodCountHandle = this.subscribe('getDetailedTimeEntriesForPeriodCount', subscriptionParameters)
        this.detailedTimeEntriesForPeriodHandle = this.subscribe('getDetailedTimeEntriesForPeriod', subscriptionParameters)
    }
  })
  this.autorun(async () => {
    if (this.data?.project.get()
      && this.data?.resource.get()
      && this.data?.customer.get()
      && this.data?.period.get()
      && this.data?.limit.get()) {
      this.selector.set(await buildDetailedTimeEntriesForPeriodSelectorAsync({
        projectId: this.data?.project.get(),
        search: this.search.get(),
        customer: this.data?.customer.get(),
        period: this.data?.period.get(),
        dates: {
          startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(), // Ensure consistent timezone usage
          endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(), // Ensure consistent timezone usage
        },
        userId: this.data?.resource.get(),
        limit: this.data?.limit.get(),
        page: Number(FlowRouter.getQueryParam('page')),
        sort: this.sort.get(),
        filters: this.filters.get(),
      }))
      delete this.selector.get()[1].skip
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
Template.detailtimetable.onRendered(() => {
  const templateInstance = Template.instance()
  dayjs.extend(utc)
  templateInstance.autorun(() => {
    if (templateInstance.detailedTimeEntriesForPeriodHandle?.ready()
      && templateInstance.detailedEntriesPeriodCountHandle?.ready()
      && templateInstance.projectResourcesHandle?.ready() && i18nReady.get()
      && templateInstance.selector.get()) {
      const data = Timecards.find(
        templateInstance.selector.get()[0],
        templateInstance.selector.get()[1],
      )
        .fetch().map((entry) => detailedDataTableMapper(entry, false))
      if (data.length === 0) {
        $('.dt-row-totalRow').remove()
      }
      const columns = [
        {
          name: t('globals.project'),
          id: 'projectId',
          editable: false,
          format: (value) => addToolTipToTableCell(Projects.findOne({ _id: value })?.name),
        },
        {
          name: t('globals.date'),
          id: 'date',
          editable: false,
          format: addToolTipToTableCell,
        },
        {
          name: t('globals.task'), id: 'task', editable: false, format: addToolTipToTableCell,
        }]
      if (getGlobalSetting('showResourceInDetails')) {
        columns.push({
          name: t('globals.resource'),
          id: 'userId',
          editable: false,
          format: (value) => addToolTipToTableCell(projectResources.findOne() ? projectResources.findOne({ _id: value })?.name : ''),
        })
      }
      if (getGlobalSetting('showCustomFieldsInDetails')) {
        let customFieldColumnType = 'desc'
        if (getGlobalSetting('showNameOfCustomFieldInDetails')) {
          customFieldColumnType = 'name'
        }
        if (CustomFields.find({ classname: 'time_entry' }).count() > 0) {
          for (const customfield of CustomFields.find({ classname: 'time_entry' }).fetch()) {
            columns.push({
              name: customfield[customFieldColumnType],
              id: customfield.name,
              editable: false,
              format: addToolTipToTableCell,
            })
          }
        }
        if (CustomFields.find({ classname: 'project' }).count() > 0) {
          for (const customfield of CustomFields.find({ classname: 'project' }).fetch()) {
            columns.push({
              name: customfield[customFieldColumnType],
              id: customfield.name,
              editable: false,
              format: addToolTipToTableCell,
            })
          }
        }
      }
      if (getGlobalSetting('showCustomerInDetails')) {
        columns.push(
          {
            name: t('globals.customer'), id: 'customer', editable: false, format: addToolTipToTableCell,
          },
        )
      }
      if (getGlobalSetting('useState')) {
        columns.push(
          {
            name: t('details.state'),
            id: 'state',
            editable: true,
            format: (value) => {
              if (value === null) {
                return ''
              }
              const cellContent = value ? addToolTipToTableCell(t(`details.${value}`)) : addToolTipToTableCell(t('details.new'))
              return `${cellContent} <i class="fa fa-chevron-down float-end js-edit-state btn-reveal" aria-hidden="true"></i>`
            },
          },
        )
      }
      if (getGlobalSetting('useStartTime')) {
        columns.push(
          {
            name: t('details.startTime'),
            id: 'startTime',
            editable: false,
            format: addToolTipToTableCell,
          },
        )
        columns.push(
          {
            name: t('details.endTime'),
            id: 'endTime',
            editable: false,
            format: addToolTipToTableCell,
          },
        )
      }
      columns.push({
        name: getUserTimeUnitVerbose(),
        id: 'hours',
        editable: false,
        format: numberWithUserPrecision,
      })
      if (getGlobalSetting('showRateInDetails')) {
        columns.push({
          name: t('project.rate'),
          id: 'rate',
          editable: false,
          format: numberWithUserPrecision,
        })
      }
      columns.push(
        {
          name: t('navigation.edit'),
          id: 'actions',
          editable: false,
          dropdown: false,
          focusable: false,
          format: (value) => {
            if (!value) {
              return ''
            }
            const timeCard = Timecards.findOne({ _id: value })
            let showEdit = timeCard.userId === Meteor.userId()
            if ((getGlobalSetting('enableLogForOtherUsers'))) {
              const targetProject = Projects.findOne({ _id: timeCard.projectId })
              if (targetProject.userId === Meteor.userId()
                || targetProject.admins?.indexOf(Meteor.userId()) >= 0) {
                showEdit = true
              }
            }
            if (showEdit) {
              return `<div class="text-center">
                <a href="#" class="js-edit" data-id="${value}"><i class="fa fa-edit"></i></a>
                <a href="#" class="js-delete" data-id="${value}"><i class="fa fa-trash"></i></a>
              </div>`
            }
            return ''
          },
        },
      )
      if (!templateInstance.datatable) {
        import('frappe-datatable/dist/frappe-datatable.css').then(() => {
          import('frappe-datatable').then((datatable) => {
            const DataTable = datatable.default
            const datatableConfig = {
              columns,
              data,
              serialNoColumn: false,
              clusterize: false,
              layout: 'ratio',
              showTotalRow: true,
              noDataMessage: t('tabular.sZeroRecords'),
              inlineFilters: true,
              events: {
                onSortColumn(column) {
                  if (column) {
                    templateInstance.sort.set({ column: column.colIndex, order: column.sortOrder })
                  }
                },
              },
              headerDropdown: [
                {
                  label: 'Filter',
                  action(column) {
                    const filterModal = new bootstrap.Modal('#filterModal')
                    filterModal.show()
                    templateInstance.$('#genericFilter').html('')
                    const uniqueRowValues = new Map()
                    for (const row of templateInstance.datatable.datamanager.rows) {
                      if (column.id === 'state') {
                        if (row[column.colIndex].content === undefined) {
                          uniqueRowValues.set('new', t('details.new'))
                        } else {
                          uniqueRowValues.set(
                            row[column.colIndex].content,
                            $(row[column.colIndex].html).text(),
                          )
                        }
                      } else {
                        uniqueRowValues.set(
                          row[column.colIndex].content,
                          $(row[column.colIndex].html).text()
                            ? $(row[column.colIndex].html).text() : row[column.colIndex].content,
                        )
                      }
                    }
                    for (const [key, value] of uniqueRowValues) {
                      templateInstance.$('#genericFilter').append(new Option(value, key))
                    }
                    templateInstance.$('#genericFilter').data('filtertarget', column.id)
                  },
                },
              ],
            }
            if (getGlobalSetting('useState')) {
              datatableConfig
                .getEditor = (colIndex, rowIndex, value, parent, column, row, editorData) => {
                  if (column.name === t('details.state') && Timecards.findOne({ _id: editorData[editorData.length - 1] }).userId === Meteor.userId() && rowIndex !== 'totalRow') {
                    const $select = document.createElement('select')
                    $select.classList = 'form-control js-state-select'
                    parent.style.padding = 0
                    $select.style.position = 'absolute'
                    $select.style.zIndex = 1000
                    $select.size = 4
                    $select.options.add(new Option(t('details.new'), 'new'))
                    $select.options.add(new Option(t('details.exported'), 'exported'))
                    $select.options.add(new Option(t('details.billed'), 'billed'))
                    $select.options.add(new Option(t('details.notBillable'), 'notBillable'))

                    parent.appendChild($select)
                    return {
                      initValue(initValue) {
                        $select.focus()
                        if (initValue) {
                          $($select).val(initValue)
                        } else {
                          $select.selectedIndex = 0
                        }
                      },
                      setValue(setValue) {
                        Meteor.call('setTimeEntriesState', { timeEntries: [editorData[editorData.length - 1]], state: setValue }, (error) => {
                          if (error) {
                            console.error(error)
                          } else {
                            showToast(t('notifications.time_entry_updated'))
                          }
                        })
                      },
                      getValue() {
                        return $($select).val()
                      },
                    }
                  }
                  return null
                }
            }
            try {
              window.requestAnimationFrame(() => {
                templateInstance.datatable = new DataTable('#datatable-container', datatableConfig)
              })
            } catch (error) {
              console.error(`Caught error: ${error}`)
            }
          })
        })
      } else {
        try {
          templateInstance.datatable.refresh(data, columns)
          $('.dt-scrollable').height(`${parseInt(document.querySelector('.dt-row.vrow:last-of-type')?.style.top, 10) + 40}px`)
        } catch (error) {
          console.error(`Caught error: ${error}`)
        }
      }
      const countsId = templateInstance.data.project.get() instanceof Array ? templateInstance.data.project.get().join('') : templateInstance.data.project.get()
      templateInstance.totalDetailTimeEntries
        .set(Counts.findOne({ _id: countsId })
          ? Counts.findOne({ _id: countsId }).count : 0)
      if (window.BootstrapLoaded.get()) {
        if (data.length === 0) {
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
Template.detailtimetable.helpers({
  detailTimeEntries() {
    if(Template.instance().selector.get()) {
      return Timecards
        .find(
          Template.instance().selector.get()[0],
          Template.instance().selector.get()[1],
        ).count() > 0
        ? Timecards.find(
          Template.instance().selector.get()[0],
          Template.instance().selector.get()[1],
        ) : false
    }
    return false
  },
  detailTimeSum() {
    if(Template.instance().selector.get()) {
      return timeInUserUnit(Timecards
        .find(Template.instance().selector.get()[0], Template.instance().selector.get()[1])
        .fetch().reduce(((total, element) => total + element.hours), 0))
      }
    return 0
  },
  totalDetailTimeEntries() {
    return Template.instance().totalDetailTimeEntries
  },
  tcid() { return Template.instance().tcid },
  showInvoiceButton: () => (getGlobalSetting('enableSiwapp') && getUserSetting('siwappurl')),
  showMarkAsBilledButton: () => (getGlobalSetting('useState') && (!getGlobalSetting('enableSiwapp') || !getUserSetting('siwappurl'))),
  filters() {
    return !!(Template.instance().filters.get()
    && Object.keys(Template.instance().filters.get()).length > 0)
  },
  outboundInterfaces: () => Template.instance().outboundInterfaces?.get(),
})
Template.detailtimetable.events({
  'click .js-export-csv': (event, templateInstance) => {
    event.preventDefault()
    const csvArray = [`\uFEFF${t('globals.project')},${t('globals.date')},${t('globals.task')}`]
    if (getGlobalSetting('showResourceInDetails')) {
      csvArray[0] = `${csvArray[0]},${t('globals.resource')}`
    }
    if (getGlobalSetting('showCustomFieldsInDetails')) {
      if (CustomFields.find({ classname: 'time_entry' }).count() > 0) {
        csvArray[0] = `${csvArray[0]},${CustomFields.find({ classname: 'time_entry' }).fetch().map((field) => field[customFieldType]).join(',')}`
      }
      if (CustomFields.find({ classname: 'project' }).count() > 0) {
        csvArray[0] = `${csvArray[0]},${CustomFields.find({ classname: 'project' }).fetch().map((field) => field[customFieldType]).join(',')}`
      }
    }
    if (getGlobalSetting('showCustomerInDetails')) {
      csvArray[0] = `${csvArray[0]},${t('globals.customer')}`
    }
    if (getGlobalSetting('useState')) {
      csvArray[0] = `${csvArray[0]},${t('details.state')}`
    }
    if (getGlobalSetting('useStartTime')) {
      csvArray[0] = `${csvArray[0]},${t('details.startTime')}`
      csvArray[0] = `${csvArray[0]},${t('details.endTime')}`
    }
    csvArray[0] = `${csvArray[0]},${getUserTimeUnitVerbose()}`
    if (getGlobalSetting('showRateInDetails')) {
      csvArray[0] = `${csvArray[0]},${t('project.rate')}`
    }
    csvArray[0] = `${csvArray[0]}\r\n`
    const selector = structuredClone(templateInstance.selector.get()[0])
    selector.state = { $in: ['new', undefined] }
    for (const timeEntry of Timecards
      .find(templateInstance.selector.get()[0], templateInstance.selector.get()[1])
      .fetch().map((entry) => detailedDataTableMapper(entry, true))) {
      const row = []
      for (const attribute of timeEntry) {
        row.push(attribute)
      }
      row.splice(row.length - 1, 1)
      if (getGlobalSetting('useState') && !getGlobalSetting('useStartTime') && !getGlobalSetting('showRateInDetails')) {
        row[row.length - 2] = t(`details.${timeEntry[timeEntry.length - 3] ? timeEntry[timeEntry.length - 3] : 'new'}`)
      } else if (getGlobalSetting('useState') && getGlobalSetting('useStartTime') && !getGlobalSetting('showRateInDetails')) {
        row[row.length - 4] = t(`details.${timeEntry[timeEntry.length - 5] ? timeEntry[timeEntry.length - 5] : 'new'}`)
      }
      else if (getGlobalSetting('useState') && getGlobalSetting('useStartTime') && getGlobalSetting('showRateInDetails')) {
        row[row.length - 5] = t(`details.${timeEntry[timeEntry.length - 6] ? timeEntry[timeEntry.length - 6] : 'new'}`)
      }
      csvArray.push(`${row.join(',')}\r\n`)
    }
    saveAs(
      new Blob(csvArray, { type: 'text/csv;charset=utf-8;header=present' }),
      `titra_export_${dayjs().format('YYYYMMDD-HHmm')}_${$('#resourceselect option:selected').text().replace(' ', '_').toLowerCase()}.csv`,
    )
    Meteor.call('setTimeEntriesState', { timeEntries: Timecards.find(selector, templateInstance.selector.get()[1]).fetch().map((entry) => entry._id), state: 'exported' }, (error) => {
      if (error) {
        console.error(error)
      }
    })
  },
  'click .js-export-xlsx': (event, templateInstance) => {
    event.preventDefault()
    const data = [[t('globals.project'), t('globals.date'), t('globals.task')]]
    if (getGlobalSetting('showResourceInDetails')) {
      data[0].push(t('globals.resource'))
    }
    if (getGlobalSetting('showCustomFieldsInDetails')) {
      if (CustomFields.find({ classname: 'time_entry' }).count() > 0) {
        for (const customfield of CustomFields.find({ classname: 'time_entry' }).fetch()) {
          data[0].push(customfield[customFieldType])
        }
      }
      if (CustomFields.find({ classname: 'project' }).count() > 0) {
        for (const customfield of CustomFields.find({ classname: 'project' }).fetch()) {
          data[0].push(customfield[customFieldType])
        }
      }
    }
    if (getGlobalSetting('showCustomerInDetails')) {
      data[0].push(t('globals.customer'))
    }
    if (getGlobalSetting('useState')) {
      data[0].push(t('details.state'))
    }
    if (getGlobalSetting('useStartTime')) {
      data[0].push(t('details.startTime'))
      data[0].push(t('details.endTime'))
    }
    data[0].push(getUserTimeUnitVerbose())
    if (getGlobalSetting('showRateInDetails')) {
      data[0].push(t('project.rate'))
    }
    const selector = structuredClone(templateInstance.selector.get()[0])
    selector.state = { $in: ['new', undefined] }
    for (const timeEntry of Timecards
      .find(templateInstance.selector.get()[0], templateInstance.selector.get()[1]).fetch()
      .map((entry) => detailedDataTableMapper(entry, true))) {
      const row = []
      let index = 0
      timeEntry.splice(timeEntry.length - 1, 1)
      for (const attribute of timeEntry) {
        if (index === timeEntry.length - 2 && getGlobalSetting('useState') && !getGlobalSetting('useStartTime') && !getGlobalSetting('showRateInDetails')) {
          row.push(t(`details.${attribute !== undefined ? attribute : 'new'}`))
        } else if (index === timeEntry.length - 4 && getGlobalSetting('useState') && getGlobalSetting('useStartTime') && !getGlobalSetting('showRateInDetails')) {
          row.push(t(`details.${attribute !== undefined ? attribute : 'new'}`))
        } else if (index === timeEntry.length - 5 && getGlobalSetting('useState') && getGlobalSetting('useStartTime') && getGlobalSetting('showRateInDetails')) {
          row.push(t(`details.${attribute !== undefined ? attribute : 'new'}`))
        }
        else {
          row.push(attribute || '')
        }
        index += 1
      }
      data.push(row)
    }
    saveAs(
      new NullXlsx('temp.xlsx', { frozen: 1, filter: 1 }).addSheetFromData(data, 'titra export').createDownloadUrl(),
      `titra_export_${dayjs().format('YYYYMMDD-HHmm')}_${$('#resourceselect option:selected').text().replace(' ', '_').toLowerCase()}.xlsx`,
    )
    Meteor.call('setTimeEntriesState', { timeEntries: Timecards.find(selector, templateInstance.selector.get()[1]).fetch().map((entry) => entry._id), state: 'exported' }, (error) => {
      if (error) {
        console.error(error)
      }
    })
  },
  'click .js-track-time': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.tcid.set(undefined)
    new bootstrap.Modal($('#edit-tc-entry-modal')[0], { focus: false }).show()
  },
  'click .js-invoice': (event, templateInstance) => {
    event.preventDefault()
    if (getUserSetting('siwappurl') && getUserSetting('siwapptoken')) {
      Meteor.call('sendToSiwapp', {
        projectId: $('.js-projectselect').val(),
        timePeriod: $('#period').val(),
        userId: $('#resourceselect').val(),
        customer: $('#customerselect').val(),
        dates: {
          startDate: getUserSetting('customStartDate') ? getUserSetting('customStartDate') : dayjs.utc().startOf('month').toDate(),
          endDate: getUserSetting('customEndDate') ? getUserSetting('customEndDate') : dayjs.utc().toDate(),
        },
      }, (error, result) => {
        if (error) {
          showToast(t('notifications.export_failed', { error }))
        } else {
          showToast(t(result))
        }
      })
    }
  },
  'click .js-mark-billed': (event, templateInstance) => {
    event.preventDefault()
    const selector = structuredClone(templateInstance.selector.get()[0])
    selector.state = { $ne: 'notBillable' }
    Meteor.call('setTimeEntriesState', { timeEntries: Timecards.find(selector, templateInstance.selector.get()[1]).fetch().map((entry) => entry._id), state: 'billed' }, (error) => {
      if (error) {
        console.error(error)
      } else {
        showToast(t('notifications.time_entry_updated'))
      }
    })
  },
  'click .js-delete': (event, templateInstance) => {
    event.preventDefault()
    if (confirm(t('notifications.delete_confirm'))) {
      Meteor.call('deleteTimeCard', { timecardId: templateInstance.$(event.currentTarget).data('id') }, (error, result) => {
        if (!error) {
          showToast(t('notifications.time_entry_deleted'))
        } else {
          console.error(error)
          if (typeof error.error === 'string') {
            showToast(t(error.error.replace('[', '').replace(']', '')))
          }
        }
      })
    }
  },
  'click .js-edit': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.tcid.set(templateInstance.$(event.currentTarget).data('id'))
    new bootstrap.Modal($('#edit-tc-entry-modal')[0], { focus: false }).show()
  },
  'change .js-search': (event, templateInstance) => {
    templateInstance.search.set($(event.currentTarget).val())
  },
  'click .js-edit-state': (event, templateInstance) => {
    event.preventDefault()
    const doubleClickEvent = new MouseEvent('dblclick', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    const singleClickEvent = new MouseEvent('click')
    event.currentTarget.parentElement.dispatchEvent(doubleClickEvent)
    templateInstance.$(event.currentTarget.parentElement.parentElement.querySelector('.js-state-select')).trigger('click')
  },
  'click .js-state-select option': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.datatable.setDimensions()
    event.currentTarget.parentElement.parentElement.parentElement.previousElementSibling.dispatchEvent(new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
    }))
    event.currentTarget.parentElement.dispatchEvent(new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
    }))
    event.currentTarget.parentElement.dispatchEvent(new MouseEvent('mouseup', {
      view: window,
      bubbles: true,
      cancelable: true,
    }))
  },
  'click #saveFilter': (event, templateInstance) => {
    event.preventDefault()
    const filter = templateInstance.filters.get()
    const filterTarget = templateInstance.$('#genericFilter').data('filtertarget')
    filter[filterTarget] = templateInstance.$('#genericFilter').val()
    templateInstance.filters.set(filter)
  },
  'click .js-remove-filters': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.filters.set({})
  },
  'mouseup .dt-cell--header > .dt-cell__content': (event, templateInstance) => {
    event.preventDefault()
    window.setTimeout(() => {
      templateInstance.datatable.setDimensions()
      templateInstance.$('.dt-scrollable').height(`${parseInt(document.querySelector('.dt-row.vrow:last-of-type')?.style.top, 10) + 40}px`)
    }, 100)
  },
  'click .js-outbound-interface': (event, templateInstance) => {
    event.preventDefault()
    Meteor.call('outboundinterfaces.run', { data: Timecards.find(structuredClone(templateInstance.selector.get()[0]), templateInstance.selector.get()[1]).fetch().map((entry) => detailedDataTableMapper(entry, true)), _id: templateInstance.$(event.currentTarget).data('interface-id') }, (error, result) => {
      if (error) {
        showToast(error)
        console.error(error)
      } else {
        showToast(result)
      }
    })
  },
})
Template.detailtimetable.onDestroyed(() => {
  FlowRouter.setQueryParams({ page: null })
  try {
    Template.instance().datatable?.destroy()
  } catch (error) {
    console.error(error)
  }
  Template.instance().datatable = undefined
})
