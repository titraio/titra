import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { Template } from 'meteor/templating'
import { Modal } from 'bootstrap'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import hex2rgba from '../../../../utils/hex2rgba.js'
import Timecards from '../../../../api/timecards/timecards.js'
import Projects from '../../../../api/projects/projects.js'
import './calendar.html'
import './editTimeEntryModal.js'
import { getUserSetting } from '../../../../utils/frontend_helpers.js'
import { getHolidays } from '../../../../utils/holiday.js'

Template.calendar.onCreated(function calendarCreated() {
  dayjs.extend(utc)
  this.subscribe('myprojects', {})
  this.startDate = new ReactiveVar(dayjs.utc().startOf('month').toDate()) // Ensure consistent timezone usage
  this.endDate = new ReactiveVar(dayjs.utc().endOf('month').toDate()) // Ensure consistent timezone usage
  this.tcid = new ReactiveVar()
  this.selectedProjectId = new ReactiveVar()
  this.selectedDate = new ReactiveVar()
})

Template.calendar.onRendered(() => {
  const safeReplacer = (transform) => transform.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const templateInstance = Template.instance()
  templateInstance.calendarInitialized = new ReactiveVar(false)
  templateInstance.autorun(async () => {
    if (window.BootstrapLoaded.get()) {
      const { Calendar } = await import('@fullcalendar/core')
      const interActionPlugin = await import('@fullcalendar/interaction')
      const dayGridPlugin = await import('@fullcalendar/daygrid')
      const { Draggable } = interActionPlugin
      const draggable = new Draggable(document.querySelector('.js-project-container'), {
        itemSelector: '.drag',
      })
      const calendarEl = document.getElementById('cal')
      calendarEl.innerHTML = ''
      templateInstance.calendar = new Calendar(calendarEl, {
        plugins: [dayGridPlugin.default, interActionPlugin.default],
        initialView: 'dayGridMonth',
        droppable: true,
        aspectRatio: 2,
        height: 'auto',
        timeZone: 'UTC', // Ensure consistent timezone usage
        firstDay: getUserSetting('startOfWeek'),
        themeSystem: 'standard',
        buttonIcons: false,
        events: (fetchInfo, successCallback) => {
          templateInstance.startDate.set(fetchInfo.start)
          templateInstance.endDate.set(fetchInfo.end)
          const events = Timecards.find(
            {
              date: {
                $gte: templateInstance.startDate.get(),
                $lte: templateInstance.endDate.get(),
              },
            },
          ).map((it) => (
            {
              id: it._id,
              title: it.task,
              start: it.date,
              allDay: true,
              backgroundColor: hex2rgba(Projects.findOne({ _id: it.projectId }).color ? Projects.findOne({ _id: it.projectId }).color : '#009688', 100),
              borderColor: 'rgba(255, 255, 255, 0)',
              extendedProps: {
                hours: it.hours,
              },
            }))
          getHolidays().then((holidays) => {
            holidays.forEach((holiday) => {
              if (holiday.type === 'public') {
                events.push({
                  title: holiday.name,
                  start: holiday.date,
                  allDay: true,
                  display: 'background',
                })
              }
            })
            successCallback(events)
          })
        },
        eventDidMount: (info) => {
          if (window.innerWidth >= 768) {
            let title = `${safeReplacer(info.event.title)}: ${info.event.extendedProps.hours} hours`
            if (info.event.id === '') {
              title = safeReplacer(info.event.title)
            }
            return {
              domNodes: $(info.el).tooltip({
                html: true,
                placement: 'right',
                trigger: 'hover',
                title: `<span>${title}</span>`,
              }),
            }
          }
          return ''
        },
        drop: function dropEvent(dropInfo) {
          templateInstance.tcid.set(undefined)
          templateInstance.selectedDate.set(dropInfo.date)
          templateInstance.selectedProjectId.set($(dropInfo.draggedEl).data('project'))
          new Modal($('#edit-tc-entry-modal')[0], { focus: false }).show()
        },
        eventClick: (eventClickInfo) => {
          if (eventClickInfo.event.id !== '') {
            templateInstance.selectedDate.set(undefined)
            templateInstance.selectedProjectId.set(undefined)
            templateInstance.tcid.set(eventClickInfo.event.id)
            new Modal($('#edit-tc-entry-modal')[0], { focus: false }).show()
          }
        },
        dateClick: (dateClickInfo) => {
          templateInstance.tcid.set(undefined)
          templateInstance.selectedProjectId.set('all')
          templateInstance.selectedDate.set(dateClickInfo.date)
          new Modal($('#edit-tc-entry-modal')[0], { focus: false }).show()
        },
        datesSet: (dateInfo) => {
          FlowRouter.setQueryParams({ date: dayjs.utc(dateInfo.view.currentStart).format('YYYY-MM-DD') }) // Ensure consistent timezone usage
        },
      })
      templateInstance.calendar.render()
      templateInstance.calendarInitialized.set(true)
    }
  })
  templateInstance.autorun(() => {
    templateInstance.periodTimecardsSub = templateInstance.subscribe(
      'periodTimecards',
      {
        startDate: templateInstance.startDate.get(),
        endDate: templateInstance.endDate.get(),
        userId: Meteor.userId(),
      },
    )
  })
  templateInstance.autorun(() => {
    if (templateInstance.calendarInitialized.get()) {
      if (templateInstance.periodTimecardsSub.ready()) {
        templateInstance.calendar.refetchEvents()
      }
    }
  })
})

Template.calendar.helpers({
  projects() {
    return Projects.find(
      {
        $or: [{ archived: { $exists: false } }, { archived: false }],
      },
      { sort: { name: 1 } },
    )
  },
  tcid: () => Template.instance().tcid,
  selectedDate: () => Template.instance().selectedDate,
  selectedProjectId: () => Template.instance().selectedProjectId,
})

Template.calendar.onDestroyed(function calendarDestroyed() {
  delete this.calendar
})
