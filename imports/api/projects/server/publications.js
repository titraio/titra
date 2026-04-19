import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import isBetween from 'dayjs/plugin/isBetween'
import { check } from 'meteor/check'
import Projects from '../projects'
import Timecards from '../../timecards/timecards.js'
import { checkAuthentication, getGlobalSettingAsync } from '../../../utils/server_method_helpers.js'

/**
 * Publishes all projects for the current user.
 * @param {Number} projectLimit - The number of projects to return.
 * @returns {Array} - The list of projects for the current user.
 */
Meteor.publish('myprojects', async function myProjects({ projectLimit } = {}) {
  if(this.userId) {
    await checkAuthentication(this)
  } else {
    return this.ready()
  }
  check(projectLimit, Match.Maybe(Number))
  return projectLimit ? Projects.find({
    $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
  }, { limit: projectLimit }) : Projects.find({
    $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
  })
})
/**
 * Publishes a single project based on a provided projectId.
 * @param {String} projectId - The project ID to filter projects by.
 * @returns {Object} - The project that matches the projectId.
 */
Meteor.publish('singleProject', async function singleProject(projectId) {
  check(projectId, String)
  await checkAuthentication(this)
  return Projects.find({
    $or: [{ userId: this.userId },
      { public: true },
      { team: this.userId }],
    _id: projectId,
  })
})
/**
 * Publishes the calculated statistics for a project.
 * @param {String} projectId - The project ID to filter statistics by.
 * @returns {Object} - The statistics object for the project.
 */
Meteor.publish('projectStats', async function projectStats(projectId) {
  check(projectId, String)
  await checkAuthentication(this)
  dayjs.extend(utc)
  dayjs.extend(isBetween)
  if (!this.userId || !await Projects.findOneAsync({
    _id: projectId,
    $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
  })) {
    return this.ready()
  }
  let initializing = true
  const project = await Projects.findOneAsync({ _id: projectId })
  const currentMonthName = dayjs.utc().format('MMM')
  const currentMonthStart = dayjs.utc().startOf('month').toDate()
  const currentMonthEnd = dayjs.utc().endOf('month').toDate()
  const previousMonthName = dayjs.utc().subtract(1, 'month').format('MMM')
  const previousMonthStart = dayjs.utc().subtract(1, 'month').startOf('month').toDate()
  const previousMonthEnd = dayjs.utc().subtract(1, 'month').endOf('month').toDate()
  const beforePreviousMonthStart = dayjs.utc().subtract(2, 'month').startOf('month').toDate()
  const beforePreviousMonthEnd = dayjs.utc().subtract(2, 'month').endOf('month').toDate()
  const beforePreviousMonthName = dayjs.utc().subtract(2, 'month').format('MMM')

  let totalHours = 0
  let totalRevenue = 0
  let currentMonthHours = 0
  let previousMonthHours = 0
  let beforePreviousMonthHours = 0
  const totalTimecardsRaw = await Timecards.rawCollection().aggregate([{
    $match: { projectId },
  }, {
    $group: { _id: null, totalHours: { $sum: '$hours' } },
  }]).toArray()
  const totalTimecardsRawForRevenue = await Timecards.rawCollection().aggregate([{
    $match: { projectId },
  }, {
    $group: { _id: '$userId', totalHours: { $sum: '$hours' } },
  }]).toArray()
  if (await getGlobalSettingAsync('allowIndividualTaskRates')) {
    const individualRateRevenue = await Timecards.find({ projectId }).fetchAsync()
    for (const timecard of individualRateRevenue) {
      if (timecard.taskRate) {
        totalRevenue += Number.parseFloat(timecard.hours) * Number.parseFloat(timecard.taskRate)
      } else {
        totalRevenue = project.rates && project.rates[timecard.userId]
          ? totalRevenue += Number.parseFloat(timecard.hours)
        * Number.parseFloat(project.rates[timecard.userId])
          : totalRevenue += Number.parseFloat(timecard.hours) * Number.parseFloat(project.rate)
      }
    }
  } else {
    for (const revenue of totalTimecardsRawForRevenue) {
      totalRevenue = project.rates && project.rates[revenue._id]
        ? totalRevenue += Number.parseFloat(revenue.totalHours)
      * Number.parseFloat(project.rates[revenue._id])
        : totalRevenue += Number.parseFloat(revenue.totalHours) * Number.parseFloat(project.rate)
    }
  }
  totalHours = Number.parseFloat(totalTimecardsRaw[0]?.totalHours)
  const currentMonthTimeCardsRaw = await Timecards.rawCollection().aggregate([{ $match: { projectId, date: { $gte: currentMonthStart, $lte: currentMonthEnd } } }, { $group: { _id: null, currentMonthHours: { $sum: '$hours' } } }]).toArray()
  currentMonthHours = Number.parseFloat(currentMonthTimeCardsRaw[0]?.currentMonthHours)
  const previousMonthTimeCardsRaw = await Timecards.rawCollection().aggregate([{ $match: { projectId, date: { $gte: previousMonthStart, $lte: previousMonthEnd } } }, { $group: { _id: null, previousMonthHours: { $sum: '$hours' } } }]).toArray()
  previousMonthHours = Number.parseFloat(previousMonthTimeCardsRaw[0]?.previousMonthHours)
  const beforePreviousMonthTimeCardsRaw = await Timecards.rawCollection().aggregate([
    { $match: { projectId, date: { $gte: beforePreviousMonthStart, $lte: beforePreviousMonthEnd } } },
    { $group: { _id: null, beforePreviousMonthHours: { $sum: '$hours' } } }
  ]).toArray()
  beforePreviousMonthHours = Number
    .parseFloat(beforePreviousMonthTimeCardsRaw[0]?.beforePreviousMonthHours)
  // observeChanges only returns after the initial `added` callbacks
  // have run. Until then, we don't want to send a lot of
  // `self.changed()` messages - hence tracking the
  // `initializing` state.
  const handle = await Timecards.find({ projectId, date: { $gte: beforePreviousMonthStart } })
    .observeChangesAsync({
      added: async (timecardId) => {
        if (!initializing) {
          const timecard = await Timecards.findOneAsync({ _id: timecardId })
          if (dayjs(new Date(timecard.date)).isBetween(currentMonthStart, currentMonthEnd, null, '[]')) {
            currentMonthHours += Number.parseFloat(timecard.hours)
          }
          if (dayjs(new Date(timecard.date)).isBetween(previousMonthStart, previousMonthEnd, null, '[]')) {
            previousMonthHours += Number.parseFloat(timecard.hours)
          }
          if (dayjs(new Date(timecard.date)).isBetween(beforePreviousMonthStart, beforePreviousMonthEnd, null, '[]')) {
            beforePreviousMonthHours += Number.parseFloat(timecard.hours)
          }
          if (project.rates && project.rates[timecard.userId]) {
            totalRevenue += Number.parseFloat(timecard.hours)
              * Number.parseFloat(project.rates[timecard.userId])
          } else {
            totalRevenue += Number.parseFloat(timecard.hours) * Number.parseFloat(project.rate)
          }
          totalHours += Number.parseFloat(timecard.hours)
          this.changed(
            'projectStats',
            projectId,
            {
              totalHours,
              totalRevenue,
              currentMonthName,
              currentMonthHours,
              previousMonthHours,
              previousMonthName,
              beforePreviousMonthName,
              beforePreviousMonthHours,
            },
          )
        }
      },
      removed: async (timecardId) => {
        if (!initializing) {
          const timecard = await Timecards.findOneAsync({ _id: timecardId })
          if (timecard) {
            if (dayjs(new Date(timecard.date)).isBetween(currentMonthStart, currentMonthEnd, null, '[]')) {
              currentMonthHours += Number.parseFloat(timecard.hours)
            }
            if (dayjs(new Date(timecard.date)).isBetween(previousMonthStart, previousMonthEnd, null, '[]')) {
              previousMonthHours += Number.parseFloat(timecard.hours)
            }
            if (dayjs(new Date(timecard.date)).isBetween(beforePreviousMonthStart, beforePreviousMonthEnd, null, '[]')) {
              beforePreviousMonthHours += Number.parseFloat(timecard.hours)
            }
            if (project?.rates && project.rates[timecard.userId]) {
              totalRevenue += Number.parseFloat(timecard.hours)
                * Number.parseFloat(project.rates[timecard.userId])
            } else {
              totalRevenue += Number.parseFloat(timecard.hours) * Number.parseFloat(project.rate)
            }
            totalHours += Number.parseFloat(timecard.hours)
          }
          this.changed(
            'projectStats',
            projectId,
            {
              totalHours,
              totalRevenue,
              currentMonthName,
              currentMonthHours,
              previousMonthHours,
              previousMonthName,
              beforePreviousMonthName,
              beforePreviousMonthHours,
            },
          )
        }
      },
      changed: async (timecardId) => {
        if (!initializing) {
          const timecard = await Timecards.findOneAsync({ _id: timecardId })
          if (dayjs(new Date(timecard.date)).isBetween(currentMonthStart, currentMonthEnd, null, '[]')) {
            currentMonthHours += Number.parseFloat(timecard.hours)
          }
          if (dayjs(new Date(timecard.date)).isBetween(previousMonthStart, previousMonthEnd, null, '[]')) {
            previousMonthHours += Number.parseFloat(timecard.hours)
          }
          if (dayjs(new Date(timecard.date)).isBetween(beforePreviousMonthStart, beforePreviousMonthEnd, null, '[]')) {
            beforePreviousMonthHours += Number.parseFloat(timecard.hours)
          }
          if (project?.rates && project?.rates[timecard.userId]) {
            totalRevenue += Number.parseFloat(timecard.hours)
              * Number.parseFloat(project.rates[timecard.userId])
          } else {
            totalRevenue += Number.parseFloat(timecard.hours) * Number.parseFloat(project.rate)
          }
          totalHours += Number.parseFloat(timecard.hours)
          this.changed('projectStats', projectId, {
            totalHours,
            totalRevenue,
            currentMonthName,
            currentMonthHours,
            previousMonthHours,
            previousMonthName,
            beforePreviousMonthName,
            beforePreviousMonthHours,
          })
        }
      },
    })
  // Instead, we'll send one `self.added()` message right after
  // observeChanges has returned, and mark the subscription as
  // ready.
  initializing = false
  this.added('projectStats', projectId, {
    totalHours,
    totalRevenue,
    currentMonthName,
    currentMonthHours,
    previousMonthHours,
    previousMonthName,
    beforePreviousMonthName,
    beforePreviousMonthHours,
  })
  // Stop observing the cursor when client unsubs.
  // Stopping a subscription automatically takes
  // care of sending the client any removed messages.
  this.onStop(() => {
    handle.stop()
  })
  return this.ready()
})
/**
 * Publishes the project name based on the provided projectId.
 * @param {String} _id - The project ID to filter projects by.
 * @returns {String} - The name of the project that matches the projectId.
 */
Meteor.publish('publicProjectName', (_id) => {
  check(_id, String)
  return Projects.find({ _id }, { name: 1 })
})
