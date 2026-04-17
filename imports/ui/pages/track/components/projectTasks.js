import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { Modal } from 'bootstrap'
import { i18nReady, t } from '../../../../utils/i18n.js'
import './projectTasks.html'
import Tasks from '../../../../api/tasks/tasks'
import Timecards from '../../../../api/timecards/timecards'
import CustomFields from '../../../../api/customfields/customfields'
import '../../overview/editproject/components/taskModal.js'
import {
  addToolTipToTableCell, getGlobalSetting, showToast, timeInUserUnit, numberWithUserPrecision,
} from '../../../../utils/frontend_helpers'

dayjs.extend(utc)

// Progress bar formatter function
function formatProgressBar(value) {
  const percent = parseFloat(value)
  let colorClass = 'bg-success'
  if (percent > 110) colorClass = 'bg-danger'
  else if (percent > 100) colorClass = 'bg-warning'
  return `
    <div class="progress" style="width: 100%; height: 16px;">
      <div class="progress-bar ${colorClass}" role="progressbar"
           style="width: ${Math.min(percent, 100)}%; font-size: 12px; line-height: 16px;"
           aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
        ${value}
      </div>
    </div>`
}

// Variance formatter function
function formatVariance(value) {
  const variance = parseFloat(value)
  if (variance > 0) {
    return `<span class="text-danger">+${value}</span>`
  } if (variance < 0) {
    return `<span class="text-success">${value}</span>`
  }
  return `<span class="text-muted">${value}</span>`
}

function taskMapper(task) {
  const mapping = [task._id,
    task.name,
    dayjs.utc(task.start).format(getGlobalSetting('dateformat')),
    dayjs.utc(task.end).format(getGlobalSetting('dateformat')),
    task.dependencies?.map((dep) => Tasks.findOne({ _id: dep })?.name).join(',')]

  // Add estimated hours column if task planning is enabled
  if (getGlobalSetting('enableTaskPlanning')) {
    mapping.push(numberWithUserPrecision(task.estimatedHours) || '')
    // Calculate actual hours for this task
    const actualHours = Timecards.find({
      projectId: task.projectId,
      task: task.name,
    }).fetch().reduce((total, entry) => total + (entry.hours || 0), 0)
    mapping.push(timeInUserUnit(actualHours) || '0')
    // Calculate variance (actual - estimated)
    const variance = actualHours - (task.estimatedHours || 0)
    mapping.push(timeInUserUnit(variance) || '0')
    // Calculate progress percentage
    const progressPercent = task.estimatedHours ? (actualHours / task.estimatedHours * 100) : 0
    mapping.push(`${numberWithUserPrecision(progressPercent)}%`)
  }

  if (CustomFields.find({ classname: 'task' }).count() > 0) {
    for (const customfield of CustomFields.find({ classname: 'task' }).fetch()) {
      mapping.push(task[customfield.name])
    }
  }
  return mapping
}

Template.projectTasks.onCreated(function projectTasksCreated() {
  this.subscribe('projectTasks', { projectId: FlowRouter.getParam('id') })
  this.subscribe('customfieldsForClass', { classname: 'task' })
  this.subscribe('globalsettings')
  // Subscribe to timecards for the last 2 years to calculate actual hours
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 2)
  this.subscribe('periodTimecards', {
    startDate,
    endDate,
    userId: 'all',
  })
  this.editTaskID = new ReactiveVar(false)
})

Template.projectTasks.onRendered(() => {
  const templateInstance = Template.instance()
  const tasks = Tasks.find({ projectId: FlowRouter.getParam('id') })
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady() && i18nReady.get() && tasks.count() > 0) {
      const columns = [
        {
          name: t('project.default_task'),
          editable: false,
          width: 1,
          format: (value) => `<div class="form-check"><input type="checkbox" data-id="${value}" class="form-check-input mx-auto" ${Tasks.findOne({ _id: value }).isDefaultTask ? 'checked' : ''}/></div>`,
        },
        {
          name: t('globals.task'),
          editable: true,
          format: addToolTipToTableCell,
          width: 2,
        },
        {
          name: t('task.startDate'),
          editable: true,
          compareValue: (cell, keyword) => [dayjs.utc(cell, getGlobalSetting('dateformat')).toDate(), dayjs(keyword, getGlobalSetting('dateformat')).toDate()],
          format: addToolTipToTableCell,
        },
        {
          name: t('task.endDate'),
          editable: true,
          compareValue: (cell, keyword) => [dayjs.utc(cell, getGlobalSetting('dateformat')).toDate(), dayjs(keyword, getGlobalSetting('dateformat')).toDate()],
          format: addToolTipToTableCell,
        },
        {
          name: t('task.dependencies'),
          editable: true,
          format: addToolTipToTableCell,
          width: 2,
        },
      ]

      // Add estimated hours column if task planning is enabled
      if (getGlobalSetting('enableTaskPlanning')) {
        columns.push({
          name: t('task.estimatedHours'),
          editable: true,
          format: addToolTipToTableCell,
          width: 1,
        })
        columns.push({
          name: t('task.actualHours'),
          editable: false,
          format: addToolTipToTableCell,
          width: 1,
        })
        columns.push({
          name: t('task.variance'),
          editable: false,
          format: (value) => formatVariance(value),
          width: 1,
        })
        columns.push({
          name: t('task.progress'),
          editable: false,
          format: (value) => formatProgressBar(value),
          width: 2,
        })
      }

      if (CustomFields.find({ classname: 'task' }).count() > 0) {
        for (const customfield of CustomFields.find({ classname: 'task' }).fetch()) {
          columns.push({
            name: customfield.desc,
            id: customfield.name,
            editable: false,
            format: addToolTipToTableCell,
          })
        }
      }
      const data = tasks.fetch()?.map((task) => taskMapper(task))
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
              noDataMessage: t('tabular.sZeroRecords'),
              getEditor(colIndex, rowIndex, value, parent, column, row) {
                templateInstance.editTaskID.set(row[0].content)
                templateInstance.$(parent.parentNode).removeClass('dt-cell--editing')
                new Modal(templateInstance.$('#task-modal')).show()
                return null
              },
            }
            window.requestAnimationFrame(() => {
              templateInstance.datatable = new DataTable('#projectTasks', datatableConfig)
            })
          })
        })
      } else {
        window.requestAnimationFrame(() => {
          templateInstance.datatable.refresh(data, columns)
        })
      }
      const ganttTasks = tasks.fetch()?.map((task) => (
        {
          id: task._id,
          name: $('<span>')?.text(task.name).html(),
          start: dayjs.utc(task.start).format('YYYY-MM-DD'),
          end: dayjs.utc(task.end).format('YYYY-MM-DD'),
          dependencies: task.dependencies,
        }))
      const ganttOptions = {
        on_date_change: (task, start, end) => {
          const taskId = task.id
          Meteor.call('updateTask', {
            taskId,
            name: task.name,
            start,
            end,
            dependencies: task.dependencies,
          })
        },
        on_click: (task) => {
          templateInstance.editTaskID.set(task.id)
          new Modal(templateInstance.$('#task-modal')).show()
        },
      }
      if (!templateInstance.ganttchart) {
        import('frappe-gantt').then((gantt) => {
          const Gantt = gantt.default
          templateInstance.ganttchart = new Gantt('#projectGantt', ganttTasks, ganttOptions)
        })
      } else {
        templateInstance.ganttchart.refresh(ganttTasks)
      }
    }
  })
})
Template.projectTasks.helpers({
  tasks: () => Tasks.find({ projectId: FlowRouter.getParam('id') }),
  editTaskID: () => Template.instance().editTaskID,
})

Template.projectTasks.events({
  'change .form-check-input': (event, templateInstance) => {
    Meteor.call('setDefaultTaskForProject', { projectId: FlowRouter.getParam('id'), taskId: templateInstance.$(event.target).data('id') }, (error) => {
      if (error) {
        console.error(error)
      } else {
        showToast(t('notifications.settings_saved_success'))
      }
    })
  },
  'click .js-open-task-modal': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.editTaskID.set(false)
    Modal.getOrCreateInstance(templateInstance.$('#task-modal')).dispose()
    Modal.getOrCreateInstance(templateInstance.$('#task-modal')).show()
  },
  'focusout #projectGantt': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.ganttchart.hide_popup()
  },
})

Template.projectTasks.onDestroyed(() => {
  try {
    Template.instance().datatable?.destroy()
  } catch (error) {
    console.error(error)
  }
  Template.instance().datatable = undefined
})
