import namedavatar from 'namedavatar'
import './projectchart.html'
import Projects, { ProjectStats } from '../../../../api/projects/projects.js'
import { projectUsers } from '../../../../api/users/users.js'
import { getUserSetting, getUserTimeUnitVerbose, getGlobalSetting } from '../../../../utils/frontend_helpers'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

Template.projectchart.onCreated(function projectchartCreated() {
  this.topTasks = new ReactiveVar()
  this.projectDescAsHtml = new ReactiveVar()
  this.isVisible = new ReactiveVar(false)

  dayjs.extend(utc)
})
Template.projectchart.helpers({
  totalHours() {
    const precision = getUserSetting('precision')
    return ProjectStats.findOne({ _id: Template.instance().data.projectId })?.totalHours
      ? Number(ProjectStats.findOne({
        _id: Template.instance().data.projectId,
      }).totalHours ? ProjectStats.findOne({
          _id: Template.instance().data.projectId,
        }).totalHours : 0).toFixed(precision)
      : false
  },
  hourIndicator() {
    const stats = ProjectStats.findOne({ _id: Template.instance().data.projectId })
    if (stats.previousMonthHours > stats.currentMonthHours) {
      return '<i class="d-md-none fa fa-arrow-circle-up"></i>'
    }
    if (stats.previousMonthHours < stats.currentMonthHours) {
      return '<i class="d-md-none fa fa-arrow-circle-down"></i>'
    }
    return '<i class="d-md-none fa fa-minus-square"></i>'
  },
  allTeamMembers() {
    return projectUsers.findOne({ _id: Template.instance().data.projectId })
      ? projectUsers.findOne({ _id: Template.instance().data.projectId }).users : false
  },
  avatarImg(avatar, name, avatarColor) {
    if (avatar) {
      return `<img src="${avatar}" alt="${name}" style="height:25px; cursor:pointer;" class="rounded" data-bs-placement="top" title="${name}"/>`
    }
    namedavatar.config({
      nameType: 'initials',
      backgroundColors: [avatarColor || '#455A64'],
      minFontSize: 2,
    })
    const rawSVG = namedavatar.getSVG(name)
    rawSVG.classList.add('rounded')
    rawSVG.style.width = '25px'
    rawSVG.style.height = '25px'
    rawSVG.style.cursor = 'pointer'
    rawSVG.dataset.bsPlacement = 'right'
    rawSVG.dataset.bsToggle = 'tooltip'
    rawSVG.setAttribute('title', name)
    return rawSVG.outerHTML
  },
  topTasks() {
    return Template.instance().topTasks.get()
  },
  turnOver() {
    const precision = getUserSetting('precision')
    const totalRevenue = Number(ProjectStats.findOne({
      _id: Template.instance().data.projectId,
    })?.totalRevenue)
    return totalRevenue ? totalRevenue.toFixed(precision) : false
  },
  target() {
    return Number(Projects.findOne({ _id: Template.instance().data.projectId }).target) > 0
      ? Projects.findOne({ _id: Template.instance().data.projectId }).target : false
  },
  startDate() {
    return Projects.findOne({ _id: Template.instance().data.projectId }).startDate
      ? dayjs.utc(Projects.findOne({ _id: Template.instance().data.projectId }).startDate).format(getGlobalSetting('dateformat')) : false
  },
  endDate() {
    return Projects.findOne({ _id: Template.instance().data.projectId }).endDate
      ? dayjs.utc(Projects.findOne({ _id: Template.instance().data.projectId }).endDate).format(getGlobalSetting('dateformat')) : false
  },
  customer() {
    return Projects.findOne({ _id: Template.instance().data.projectId })?.customer
  },
  projectDescAsHtml: () => encodeURI(Template.instance().projectDescAsHtml.get() ? Template.instance().projectDescAsHtml.get() : ''),
  truncatedProjectDescAsHtml: () => (`<div class="ms-2">${Template.instance().projectDescAsHtml.get()}</div>`),
  componentIsReady() {
    return Template.instance().isVisible.get() && Template.instance().subscriptionsReady()
  },
})
Template.projectchart.onRendered(() => {
  const templateInstance = Template.instance()
  const precision = getUserSetting('precision')
  templateInstance.observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        templateInstance.isVisible.set(true)
        templateInstance.observer.unobserve(templateInstance.firstNode)
      }
    })
  })
  templateInstance.observer.observe(templateInstance.firstNode)
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady() && templateInstance.projectDescAsHtml.get()) {
      import('bootstrap').then((bs) => {
        bs.Tooltip.getOrCreateInstance(templateInstance.$('.js-tooltip').get(0), {
          title: templateInstance.projectDescAsHtml.get(),
          html: true,
          placement: 'auto',
          boundary: templateInstance.$('.js-tooltip').parent().get(0),
          trigger: 'hover focus',
        })
      })
    }
  })
  templateInstance.autorun(() => {
    if (templateInstance.isVisible.get()) {
      if (!templateInstance.singleProjectSub) {
        templateInstance.singleProjectSub = templateInstance.subscribe('singleProject', templateInstance.data.projectId)
      }
      if (!templateInstance.projectStatsSub) {
        templateInstance.projectStatsSub = templateInstance.subscribe('projectStats', templateInstance.data.projectId)
      }
      if (!templateInstance.projectUsersSub) {
        templateInstance.projectUsersSub = templateInstance.subscribe('projectUsers', { projectId: templateInstance.data.projectId })
      }
      Meteor.call('getTopTasks', { projectId: templateInstance.data.projectId }, (error, result) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.topTasks.set(result)
        }
      })
    }
  })
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady()) {
      const projectDesc = Projects.findOne({ _id: Template.instance().data.projectId })?.desc
      if (projectDesc instanceof Object) {
        import('quill-delta-to-html').then((deltaToHtml) => {
          const converter = new deltaToHtml.QuillDeltaToHtmlConverter(projectDesc.ops, { multiLineParagraph: true, paragraphTag: 'span' })
          templateInstance.projectDescAsHtml.set(converter.convert())
        })
      } else {
        templateInstance.projectDescAsHtml.set(projectDesc)
      }
    }
  })
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady() && templateInstance.isVisible.get()) {
      const stats = ProjectStats.findOne({ _id: templateInstance.data.projectId })
      if (stats) {
        import('frappe-charts').then((chartModule) => {
          const { Chart } = chartModule
          if (getUserSetting('timeunit') === 'd') {
            stats.beforePreviousMonthHours
                /= getUserSetting('hoursToDays')
            stats.beforePreviousMonthHours = Number(stats.beforePreviousMonthHours)
            stats.previousMonthHours
                /= getUserSetting('hoursToDays')
            stats.previousMonthHours = Number(stats.previousMonthHours)
            stats.currentMonthHours
                /= getUserSetting('hoursToDays')
          }
          if (getUserSetting('timeunit') === 'm') {
            stats.beforePreviousMonthHours *= 60
            stats.beforePreviousMonthHours = Number(stats.beforePreviousMonthHours)
            stats.previousMonthHours *= 60
            stats.previousMonthHours = Number(stats.previousMonthHours)
            stats.currentMonthHours *= 60
            stats.currentMonthHours = Number(stats.currentMonthHours)
          }
          stats.currentMonthHours = Number(stats.currentMonthHours)
          if (templateInstance.chart) {
            templateInstance.chart.destroy()
          }
          stats.beforePreviousMonthHours = stats.beforePreviousMonthHours.toFixed(precision)
          stats.previousMonthHours = stats.previousMonthHours.toFixed(precision)
          stats.currentMonthHours = stats.currentMonthHours.toFixed(precision)

          window.requestAnimationFrame(() => {
            if (templateInstance.$('.js-hours-chart-container')[0] && templateInstance.$('.js-hours-chart-container').is(':visible')) {
              templateInstance.chart = new Chart(templateInstance.$('.js-hours-chart-container')[0], {
                type: 'line',
                height: 160,
                colors: [Projects.findOne({ _id: templateInstance.data.projectId }).color || '#009688'],
                lineOptions: {
                  regionFill: 1,
                },
                data: {
                  labels:
                [stats.beforePreviousMonthName, stats.previousMonthName, stats.currentMonthName],
                  datasets: [{
                    values:
                  [stats.beforePreviousMonthHours,
                    stats.previousMonthHours,
                    stats.currentMonthHours],
                  }],
                },
                tooltipOptions: {
                  formatTooltipY: (value) => `${value} ${getUserTimeUnitVerbose()}`,
                },
              })
            }
          })
        })
      }
    }
  })
  templateInstance.autorun(() => {
    if (templateInstance.subscriptionsReady() && templateInstance.isVisible.get()) {
      if (templateInstance.topTasks.get()?.length > 0) {
        import('frappe-charts').then((chartModule) => {
          window.requestAnimationFrame(() => {
            const { Chart } = chartModule
            if (templateInstance.piechart) {
              templateInstance.piechart.destroy()
            }
            if (templateInstance.$('.js-pie-chart-container')[0] && templateInstance.$('.js-pie-chart-container').is(':visible')) {
              templateInstance.piechart = new Chart(templateInstance.$('.js-pie-chart-container')[0], {
                type: 'pie',
                colors: [Projects.findOne({ _id: templateInstance.data.projectId }).color || '#009688', '#66c0b8', '#e4e4e4'],
                height: 230,
                data: {
                  labels: templateInstance.topTasks.get().map((task) => $('<span>').text(task._id).html()),
                  datasets: [{
                    values: templateInstance.topTasks.get().map((task) => task.count),
                  }],
                },
                tooltipOptions: {
                },
              })
            }
          })
        })
      }
    }
  })
})
Template.projectchart.onDestroyed(() => {
  const templateInstance = Template.instance()
  if (templateInstance.chart) {
    templateInstance.chart.destroy()
  }
  if (templateInstance.piechart) {
    templateInstance.piechart.destroy()
  }
  templateInstance.observer.disconnect()
})
