import { ValidatedMethod } from 'meteor/mdg:validated-method'
import dayjs from 'dayjs'
import { fetch } from 'meteor/fetch'
import { check, Match } from 'meteor/check'
import { NodeVM } from '../../../utils/vm_sandbox.js'
import Timecards from '../timecards.js'
import Tasks from '../../tasks/tasks.js'
import Projects from '../../projects/projects.js'
import { t } from '../../../utils/i18n.js'
import { emojify } from '../../../utils/frontend_helpers'
import { sanitizeObject } from '../../../utils/sanitizer.js'
import { timeEntryForbiddenCustomfieldKeys } from '../../../utils/securityFieldPolicies.js'
import { timeInUserUnitAsync } from '../../../utils/periodHelpers.js'
import {
  authenticationMixin,
  transactionLogMixin,
  buildTotalHoursForPeriodSelectorAsync,
  buildDailyHoursSelectorAsync,
  buildworkingTimeSelectorAsync,
  workingTimeEntriesMapper,
  buildDetailedTimeEntriesForPeriodSelectorAsync,
  getGlobalSettingAsync,
  calculateSimilarity,
} from '../../../utils/server_method_helpers.js'
import { getOpenAIResponse } from '../../../utils/openai/openai_server.js'

/**
 * Inserts a new timecard into the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 * @throws {Meteor.Error} If time entry rule throws an error.
 * @throws {Meteor.Error} If time entry rule is not a function.
 * @throws {Meteor.Error} If time entry rule is not a string.
 * @throws {Meteor.Error} If time entry rule is not a valid JavaScript expression.
 */
async function checkTimeEntryRule({
  userId, projectId, task, state, date, hours,
}) {
  const meteorUser = await Meteor.users.findOneAsync({ _id: userId })
  const vm = new NodeVM({
    wrapper: 'none',
    timeout: 1000,
    console: 'inherit', // Enable console logging for testing
    sandbox: {
      user: meteorUser.profile,
      project: await Projects.findOneAsync({ _id: projectId }),
      dayjs,
      timecard: {
        projectId,
        task,
        state,
        date,
        hours,
      },
    },
  })
  try {
    if (!await vm.run(await getGlobalSettingAsync('timeEntryRule'))) {
      throw new Meteor.Error('notifications.time_entry_rule_failed')
    }
  } catch (error) {
    throw new Meteor.Error(error.message)
  }
}
/**
 * Inserts a new timecard into the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {number} taskRate - The rate of the task for the time card.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 * @throws {Meteor.Error} If time entry rule throws an error.
 */
async function insertTimeCard(projectId, task, date, hours, userId, taskRate, customfields) {
  const safeCustomfields = sanitizeObject(customfields, timeEntryForbiddenCustomfieldKeys)
  const newTimeCard = {
    ...safeCustomfields,
    userId,
    projectId,
    date,
    hours,
    task: await emojify(task),
  }
  if (taskRate) {
    newTimeCard.taskRate = taskRate
  }
  if (!await Tasks.findOneAsync({ $or: [{ userId }, { projectId }], name: await emojify(task) })) {
    await Tasks.insertAsync({
      ...safeCustomfields, userId, lastUsed: new Date(), name: await emojify(task),
    })
  } else {
    await Tasks.updateAsync(
      { $or: [{ userId }, { projectId }], name: await emojify(task) },
      { $set: { ...safeCustomfields, lastUsed: new Date() } },
    )
  }
  return Timecards.insertAsync(newTimeCard)
}
/**
 * Updates an existing timecard in the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 */
async function upsertTimecard(projectId, task, date, hours, userId) {
  if (!await Tasks.findOneAsync({ userId, name: await emojify(task) })) {
    await Tasks.insertAsync({ userId, lastUsed: new Date(), name: await emojify(task) })
  } else {
    await Tasks.updateAsync(
      { userId, name: await emojify(task) },
      { $set: { lastUsed: new Date() } },
    )
  }
  if (hours === 0) {
    await Timecards.removeAsync({
      userId,
      projectId,
      date,
      task: await emojify(task),
    })
  } else if (await Timecards.find({
    userId,
    projectId,
    date,
    task: await emojify(task),
  }).countAsync() > 1) {
    // if there are more time entries with the same task description for one day,
    // we remove all of them and create a new entry for the total sum
    await Timecards.removeAsync({
      userId,
      projectId,
      date,
      task: await emojify(task),
    })
  }
  if (hours !== 0) {
    await Timecards.updateAsync(
      {
        userId,
        projectId,
        date,
        task: await emojify(task),
      },
      {
        userId,
        projectId,
        date,
        hours,
        task: await emojify(task),
      },

      { upsert: true },
    )
  }
  return 'notifications.success'
}
async function checkProjectAdministratorAndUser(projectId, administratorId, userId) {
  const targetProject = await Projects.findOneAsync({ _id: projectId })
  if (!targetProject
      || !(targetProject.userId === administratorId
      || targetProject.admins.indexOf(administratorId) >= 0)) {
    throw new Meteor.Error('notifications.only_administrator_can_register_time')
  }
  const user = await Meteor.users.findOneAsync({ 'profile.name': userId })
  if (!user) {
    throw new Meteor.Error('notifications.user_not_found')
  }
  if (targetProject.public !== true
      && targetProject.userId !== user._id
      && targetProject.team.indexOf(user._id) === -1) {
    throw new Meteor.Error('notifications.user_not_found_in_project')
  }
  return user._id
}
/**
 * Inserts a new timecard into the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 */
const insertTimeCardMethod = new ValidatedMethod({
  name: 'insertTimeCard',
  validate(args) {
    check(args.projectId, Match.Maybe(String))
    check(args.task, String)
    check(args.date, Date)
    check(args.hours, Number)
    check(args.taskRate, Match.Maybe(Number))
    check(args.customfields, Match.Maybe(Object))
    check(args.user, String)
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, task, date, hours, taskRate, customfields, user,
  }) {
    let { userId } = this
    if (user !== userId) {
      userId = await checkProjectAdministratorAndUser(projectId, userId, user)
    }
    const check = await checkTimeEntryRule({
      userId, projectId, task, state: 'new', date, hours,
    })
    insertTimeCard(projectId, task, date, hours, userId, taskRate, customfields)
  },
})
/**
 * Updates an existing timecard in the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 * @throws {Meteor.Error} If timecard does not exist.
 */
const upsertWeek = new ValidatedMethod({
  name: 'upsertWeek',
  validate(args) {
    check(args, Array)
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run(weekArray) {
    weekArray.forEach(async (element) => {
      check(element.projectId, String)
      check(element.task, String)
      check(element.date, Date)
      check(element.hours, Number)
      await checkTimeEntryRule({
        userId: this.userId,
        projectId: element.projectId,
        task: element.task,
        state: 'new',
        date: element.date,
        hours: element.hours,
      })
      await upsertTimecard(
        element.projectId,
        element.task,
        element.date,
        element.hours,
        this.userId,
      )
    })
  },
})
/**
 * Updates an existing timecard in the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project for the timecard.
 * @param {string} args._id - The ID of the timecard.
 * @param {string} args.task - The task for the timecard.
 * @param {Date} args.date - The date of the timecard.
 * @param {number} args.hours - The number of hours for the timecard.
 * @param {string} [args.userId] - The ID of the user for the timecard.
 * @param {Object} [args.customfields] - The custom fields for the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 * @throws {Meteor.Error} If timecard does not exist.
 */
const updateTimeCard = new ValidatedMethod({
  name: 'updateTimeCard',
  validate(args) {
    check(args.projectId, String)
    check(args._id, String)
    check(args.task, String)
    check(args.date, Date)
    check(args.hours, Number)
    check(args.taskRate, Match.Maybe(Number))
    check(args.customfields, Match.Maybe(Object))
    check(args.user, String)
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, _id, task, date, hours, taskRate, customfields, user,
  }) {
    const callerId = this.userId
    let userId = callerId
    if (user !== callerId) {
      userId = await checkProjectAdministratorAndUser(projectId, callerId, user)
    }
    const timecard = await Timecards.findOneAsync({ _id, userId })
    if (!timecard) {
      throw new Meteor.Error('globals.not_found')
    }
    if (user !== callerId && timecard.projectId !== projectId) {
      await checkProjectAdministratorAndUser(timecard.projectId, callerId, user)
    }
    await checkTimeEntryRule({
      userId, projectId, task, state: timecard.state, date, hours,
    })
    const safeCustomfields = sanitizeObject(customfields, timeEntryForbiddenCustomfieldKeys)
    if (!await Tasks.findOneAsync({ userId, name: await emojify(task) })) {
      await Tasks.insertAsync({ ...safeCustomfields, userId, name: await emojify(task) })
    }
    const fieldsToSet = {
      ...safeCustomfields,
      projectId,
      date,
      hours,
      task: await emojify(task),
    }
    if (taskRate) {
      fieldsToSet.taskRate = taskRate
      await Timecards.updateAsync({ _id, userId }, {
        $set: fieldsToSet,
      })
    } else {
      await Timecards.updateAsync({ _id, userId }, {
        $set: fieldsToSet,
        $unset: { taskRate: '' },
      })
    }
  },
})
/**
 * Deletes an existing timecard in the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.timecardId - The ID of the timecard.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 * @throws {Meteor.Error} If time entry rule fails.
 * @throws {Meteor.Error} If timecard does not exist.
 * @throws {Meteor.Error} If timecard is not owned by user.
 */
const deleteTimeCard = new ValidatedMethod({
  name: 'deleteTimeCard',
  validate(args) {
    check(args, {
      timecardId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ timecardId }) {
    const timecard = await Timecards.findOneAsync({ _id: timecardId })
    await checkTimeEntryRule({
      userId: this.userId,
      projectId: timecard.projectId,
      task: timecard.task,
      state: timecard.state,
      date: timecard.date,
      hours: timecard.hours,
    })
    return Timecards.removeAsync({ userId: this.userId, _id: timecardId })
  },
})
/**
 * Creates an invoice in Siwapp through the API and
 * updates the state of a timecard in the Timecards collection.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.timePeriod - The time period for the invoice.
 * @param {string} [args.userId] - The ID of the user.
 * @param {string} [args.customer] - The ID of the customer.
 * @param {Object} [args.dates] - The start and end dates for the invoice.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 */
const sendToSiwapp = new ValidatedMethod({
  name: 'sendToSiwapp',
  validate(args) {
    check(args.projectId, Match.OneOf(String, Array))
    check(args.timePeriod, String)
    check(args.userId, Match.OneOf(String, Array))
    check(args.customer, Match.OneOf(String, Array))
    check(args.dates, Match.Maybe(Object))
    if (args.timePeriod === 'custom') {
      check(args.dates, Object)
      check(args.dates.startDate, Date)
      check(args.dates.endDate, Date)
    }
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, timePeriod, userId, customer, dates,
  }) {
    const meteorUser = await Meteor.users.findOneAsync({ _id: this.userId })
    if (!meteorUser.profile.siwappurl || !meteorUser.profile.siwapptoken) {
      throw new Meteor.Error(t('notifications.siwapp_configuration'))
    }
    const timeEntries = []
    const selector = await buildDetailedTimeEntriesForPeriodSelectorAsync({
      projectId,
      search: undefined,
      customer,
      period: timePeriod,
      dates,
      userId,
      limit: undefined,
      page: undefined,
      sort: undefined,
    })
    const projectMap = new Map()
    for (const timecard of await Timecards.find(selector[0]).fetchAsync()) {
      timeEntries.push(timecard._id)
      const resource = meteorUser.profile.name
      const projectEntry = projectMap.get(timecard.projectId)
      if (projectEntry) {
        projectEntry.set(
          resource,
          (projectEntry.get(resource) ? projectEntry.get(resource) : 0) + timecard.hours,
        )
      } else {
        projectMap.set(timecard.projectId, new Map().set(resource, timecard.hours))
      }
    }
    const invoiceJSON = {
      data: {
        attributes: {
          name: 'from titra',
          issue_date: dayjs().format('YYYY-MM-DD'),
          draft: true,
        },
        relationships: {
          items: {
            data: [],
          },
        },
      },
    }
    for await (const [project, resources] of projectMap.entries()) {
      const projectElement = await Projects.findOneAsync({ _id: project })
      if (resources.size > 0) {
        for (const [resource, hours] of resources) {
          invoiceJSON.data.relationships.items.data.push({
            attributes: {
              description: `${projectElement.name} (${resource})`,
              quantity: await timeInUserUnitAsync(hours, meteorUser),
              unitary_cost: 0,
            },
          })
        }
      }
    }
    try {
      const response = await fetch(`${meteorUser.profile.siwappurl}/api/v1/invoices`, {
        method: 'POST',
        body: JSON.stringify(invoiceJSON),
        headers: {
          Authorization: `Token token=${meteorUser.profile.siwapptoken}`,
          'Content-type': 'application/json',
        },
      })
      if (response.status === 201) {
        await Timecards.updateAsync({ _id: { $in: timeEntries } }, { $set: { state: 'billed' } }, { multi: true })
        return 'notifications.siwapp_success'
      }
      return response.statusText
    } catch (error) {
      throw new Meteor.Error(error)
    }
  },
})
/**
 * Gets the daily timecards sum for a given period.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.userId - The ID of the user.
 * @param {string} args.period - The time period for the invoice.
 * @param {Object} [args.dates] - The start and end dates for the invoice.
 * @param {string} [args.customer] - The ID of the customer.
 * @param {number} [args.limit] - The number of timecards to return.
 * @param {number} [args.page] - The page number.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {Object} The daily timecards sum for a given period.
*/
const getDailyTimecards = new ValidatedMethod({
  name: 'getDailyTimecards',
  validate(args) {
    check(args.projectId, Match.OneOf(String, Array))
    check(args.userId, String)
    check(args.period, String)
    check(args.customer, String)
    check(args.limit, Number)
    check(args.dates, Match.Maybe(Object))
    check(args.page, Match.Maybe(Number))
    if (args.period === 'custom') {
      check(args.dates, Object)
      check(args.dates.startDate, Date)
      check(args.dates.endDate, Date)
    }
  },
  mixins: [authenticationMixin],
  async run({
    projectId, userId, period, dates, customer, limit, page,
  }) {
    const aggregationSelector = await buildDailyHoursSelectorAsync(
      projectId,
      period,
      dates,
      userId,
      customer,
      limit,
      page,
    )
    const dailyHoursObject = {}
    const totalTimeCardsRawCollection = await Timecards.rawCollection()
      .aggregate(await buildDailyHoursSelectorAsync(projectId, period, dates, userId, customer, 0))
      .toArray()
    const totalEntries = totalTimeCardsRawCollection.length
    const dailyHours = await Timecards.rawCollection().aggregate(aggregationSelector)
      .toArray()
    dailyHoursObject.dailyHours = dailyHours
    dailyHoursObject.totalEntries = totalEntries
    return dailyHoursObject
  },
})
/**
 * Gets the total hours for a given period.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.userId - The ID of the user.
 * @param {string} args.period - The time period for the invoice.
 * @param {Object} [args.dates] - The start and end dates for the invoice.
 * @param {string} [args.customer] - The ID of the customer.
 * @param {number} [args.limit] - The number of timecards to return.
 * @param {number} [args.page] - The page number.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {Object} The total hours for a given period.
 */
const getTotalHoursForPeriod = new ValidatedMethod({
  name: 'getTotalHoursForPeriod',
  validate(args) {
    check(args.projectId, Match.OneOf(String, Array))
    check(args.userId, String)
    check(args.period, String)
    check(args.customer, String)
    check(args.limit, Number)
    check(args.dates, Match.Maybe(Object))
    check(args.page, Match.Maybe(Number))
    if (args.period === 'custom') {
      check(args.dates, Object)
      check(args.dates.startDate, Date)
      check(args.dates.endDate, Date)
    }
  },
  mixins: [authenticationMixin],
  async run({
    projectId, userId, period, dates, customer, limit, page,
  }) {
    const aggregationSelector = await buildTotalHoursForPeriodSelectorAsync(
      projectId,
      period,
      dates,
      userId,
      customer,
      limit,
      page,
    )
    const totalHoursObject = {}
    const totalEntriesTimecardsRaw = await Timecards.rawCollection()
      .aggregate(await buildTotalHoursForPeriodSelectorAsync(projectId, period, dates, userId, customer, 0))
      .toArray()
    const totalEntries = totalEntriesTimecardsRaw.length
    const totalHours = await Timecards.rawCollection().aggregate(aggregationSelector)
      .toArray()
    for (const entry of totalHours) {
      entry.totalHours = Number(JSON.parse(JSON.stringify(entry)).totalHours.$numberDecimal)
    }
    totalHoursObject.totalHours = totalHours
    totalHoursObject.totalEntries = totalEntries
    return totalHoursObject
  },
})
/**
 * Gets the working hours for a given period.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.userId - The ID of the user.
 * @param {string} args.period - The time period for the invoice.
 * @param {Object} [args.dates] - The start and end dates for the invoice.
 * @param {number} [args.limit] - The number of timecards to return.
 * @param {number} [args.page] - The page number.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {Object} The working hours for a given period.
 */
const getWorkingHoursForPeriod = new ValidatedMethod({
  name: 'getWorkingHoursForPeriod',
  validate(args) {
    check(args.projectId, Match.OneOf(String, Array))
    check(args.userId, String)
    check(args.period, String)
    check(args.limit, Number)
    check(args.dates, Match.Maybe(Object))
    check(args.page, Match.Maybe(Number))
    if (args.period === 'custom') {
      check(args.dates, Object)
      check(args.dates.startDate, Date)
      check(args.dates.endDate, Date)
    }
  },
  mixins: [authenticationMixin],
  async run({
    projectId, userId, period, dates, limit, page,
  }) {
    const aggregationSelector = await buildworkingTimeSelectorAsync(
      projectId,
      period,
      dates,
      userId,
      limit,
      page,
    )
    const totalEntriesTimecardsRaw = await Timecards.rawCollection()
      .aggregate(await buildworkingTimeSelectorAsync(projectId, period, dates, userId, limit, page))
      .toArray()
    const totalEntries = totalEntriesTimecardsRaw.length
    const workingHoursObject = {}
    workingHoursObject.totalEntries = totalEntries
    const workingHoursTimeCardsRaw = await Timecards.rawCollection().aggregate(aggregationSelector)
      .toArray()
    const workingHours = await Promise.all(workingHoursTimeCardsRaw.map(workingTimeEntriesMapper))
    workingHoursObject.workingHours = workingHours
    return workingHoursObject
  },
})
/**
 * Sets the time entry state for a list of time entries
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string[]} args.timeEntries - The IDs of the time entries.
 * @param {string} args.state - The state to set the time entries to.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {undefined}
 */
const setTimeEntriesState = new ValidatedMethod({
  name: 'setTimeEntriesState',
  validate(args) {
    check(args, {
      timeEntries: Array,
      state: String,
    })
    for (const timeEntryId of args.timeEntries) {
      check(timeEntryId, String)
    }
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ timeEntries, state }) {
    if (state === 'exported') {
      await Timecards.updateAsync(
        { _id: { $in: timeEntries } },
        { $set: { state } },
        { multi: true },
      )
    } else if (state === 'billed') {
      await Timecards.updateAsync(
        { _id: { $in: timeEntries } },
        { $set: { state } },
        { multi: true },
      )
    } else {
      await Timecards.updateAsync(
        { _id: { $in: timeEntries } },
        { $set: { state } },
        { multi: true },
      )
    }
  },
})
/**
 * Deletes timecards for a given project, task, and date range.
 * @param {Object} args - The arguments object containing the timecard information.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.task - The task associated with the timecards.
 * @param {Date} args.startDate - The start date of the timecard range.
 * @param {Date} args.endDate - The end date of the timecard range.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {undefined}
 */
const deleteTimeCardsForWeek = new ValidatedMethod({
  name: 'deleteTimeCardsForWeek',
  validate(args) {
    check(args, {
      projectId: String,
      task: String,
      startDate: Date,
      endDate: Date,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, task, startDate, endDate,
  }) {
    await Timecards.removeAsync({
      projectId,
      task,
      date: { $gte: startDate, $lte: endDate },
    })
  },
})

/**
 * Gets the Google Workspace data for a given date range.
 * @param {Object} args - The arguments object containing the date range.
 * @param {Date} args.startDate - The start date of the date range.
 * @param {Date} args.endDate - The end date of the date range.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {Object} The Google Workspace data for the given date range.
 */
const getGoogleWorkspaceData = new ValidatedMethod({
  name: 'getGoogleWorkspaceData',
  validate(args) {
    check(args, {
      startDate: Date,
      endDate: Date,
    })
  },
  mixins: [authenticationMixin],
  async run({ startDate, endDate }) {
    const meteorUser = await Meteor.userAsync()
    const { serviceData } = meteorUser.services.googleapi
    let eventResponse = []
    if (serviceData) {
      const events = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMax=${encodeURIComponent(endDate.toISOString())}&timeMin=${encodeURIComponent(startDate.toISOString())}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${serviceData.accessToken}`,
          Accept: 'application/json',
        },
      })
      const jsonEvents = await events.json()
      const fetchedEvents = jsonEvents.items.map((event) => ({
        summary: event.summary,
        description: event.description?.substring(0, 255),
        startTime: event.start?.dateTime,
        endTime: event.end?.dateTime,
        attendees: event.attendees,
      }))
      eventResponse = fetchedEvents
      if (await getGlobalSettingAsync('openai_apikey') && fetchedEvents.length > 0) {
        eventResponse = await Promise.all(fetchedEvents.map(async (eventData) => getOpenAIResponse(`Based on the following JSON representation of a calendar event, respond with a JSON object summarizing the event with as few words as possible. Add the date of the event and the duration in hours and try to identify the customer based on the majority of attendee e-mail addresses. Include the original un-altered summary in the origin field. Use the following schema for the return JSON:
        \`Interface event {summary: string, duration:number, customer:string, date:date, origin:string}\`
        ${JSON.stringify(eventData)}`)))
      }
      const emails = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=in:sent%20after:${Date.parse(startDate) / 1000}%20before:${Date.parse(endDate) / 1000}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${serviceData.accessToken}`,
          Accept: 'application/json',
        },
      })
      const emailIds = await emails.json()
      let fetchedMessages = []
      if (emailIds.messages) {
        fetchedMessages = await Promise.all(emailIds.messages.map(async (emailId) => {
          const message = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${emailId.id}?format=metadata`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${serviceData.accessToken}`,
              Accept: 'application/json',
            },
          })
          const jsonMessage = await message.json()
          const returnMessage = {}
          returnMessage.date = dayjs(new Date(Number.parseInt(jsonMessage.internalDate, 10))).format('YYYY-MM-DD')
          returnMessage.sizeEstimate = jsonMessage.sizeEstimate
          returnMessage.recipients = ''
          const headers = jsonMessage.payload && jsonMessage.payload.headers
          if (headers) {
            for (const header of headers) {
              if (header.name === 'Subject') {
                returnMessage.subject = header.value
              }
              if (header.name === 'To') {
                returnMessage.recipients += header.value
              }
              if (header.name === 'CC') {
                returnMessage.recipients += header.value
              }
            }
            if (await getGlobalSettingAsync('openai_apikey')) {
              return getOpenAIResponse(`Based on the email representation in JSON format, respond with a JSON object with the following schema where you estimate the time it took to write the email in hours based on the snippet and sizeEstimate in bytes where 0.25 hours is the minimum and add it to the duration field, use date format "YYYY-MM-DD" for dates, summarize the content with as few words as possible, do not include the snippet in the summary, guess the customer company name based on the majority of recipient's mail address domain. Include the original un-altered summary in the origin field. Use the following schema for the return JSON:
          \`Interface message {summary:string,customer:string,date:date,duration:number,origin:string}\`
          ${JSON.stringify(jsonMessage)}`)
            }
            returnMessage.summary = jsonMessage.snippet.substring(0, 50)
            returnMessage.duration = 0.25
            returnMessage.origin = returnMessage.summary
            return returnMessage
          }
          return returnMessage
        }))
      }
      let returnEvents = eventResponse
      if (await getGlobalSettingAsync('openai_apikey')) {
        returnEvents = await Promise.all(eventResponse.map(async (event) => {
          const projects = await Projects.find({
            $and: [
              {
                $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
              },
              { $or: [{ archived: false }, { archived: { $exists: false } }] },
            ],
          }).fetchAsync()
          const filteredProjects = projects.map((entry) => {
            const score = calculateSimilarity(entry.name, event.customer)
            if (score > 0.3) {
              return {
                ...entry,
                score: calculateSimilarity(entry.name, event.customer),
              }
            }
            return undefined
          }).filter((entry) => entry !== undefined)
          filteredProjects.sort((a, b) => b.score - a.score)
          const updatedMessage = {
            ...event,
            projectID: filteredProjects.length > 0 ? filteredProjects[0]._id : null,
          }
          return updatedMessage
        }))
      } else {
        returnEvents.map((event) => {
          event.date = dayjs(event.startTime).format('YYYY-MM-DD')
          event.duration = (Date.parse(event.endTime) - Date.parse(event.startTime))
            / 1000 / 60 / 60
          return event
        })
      }
      let returnMessages = fetchedMessages
      if (await getGlobalSettingAsync('openai_apikey')) {
        returnMessages = await Promise.all(fetchedMessages.map(async (message) => {
          const projects = await Projects.find({
            $and: [
              {
                $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
              },
              { $or: [{ archived: false }, { archived: { $exists: false } }] },
            ],
          }).fetchAsync()
          const filteredProjects = projects.map((entry) => {
            const score = calculateSimilarity(entry.name, message.customer)
            if (score > 0.3) {
              return {
                ...entry,
                score: calculateSimilarity(entry.name, message.customer),
              }
            }
            return undefined
          }).filter((entry) => entry !== undefined)
          filteredProjects.sort((a, b) => b.score - a.score)
          const updatedMessage = {
            ...message,
            projectID: filteredProjects.length > 0 ? filteredProjects[0]._id : null,
          }
          return updatedMessage
        }))
      }
      return { returnEvents, returnMessages }
    }
    throw new Meteor.Error('You need to authorize Google API access for titra first.')
  },
})
/**
 * Retrieves user time cards for a specific period, filtered by project and task.
 *
 * @method userTimeCardsForPeriodByProjectByTask
 * @param {Object} args - The arguments for the method.
 * @param {Date} args.startDate - The start date of the period.
 * @param {Date} args.endDate - The end date of the period.
 * @param {String} args.projectId - The ID of the project.
 * @returns {Promise<Array>} - A promise that resolves to an array of time card entries.
 */
const userTimeCardsForPeriodByProjectByTaskMethod = new ValidatedMethod({
  name: 'userTimeCardsForPeriodByProjectByTask',
  validate(args) {
    check(args.startDate, Date)
    check(args.endDate, Date)
    check(args.projectId, String)
  },
  mixins: [authenticationMixin],
  async run({ startDate, endDate, projectId }) {
    return Timecards.rawCollection().aggregate([
      {
        $match: {
          projectId,
          userId: this.userId,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $sort: {
          task: -1,
        },
      },
      {
        $group: {
          _id: { $concat: ['$projectId', '|', '$task'] },
          entries: { $push: '$$ROOT' },
        },
      }]).toArray()
  },
})
/**
 * Calculates the total hours worked per day for a given week.
 *
 * @method getTotalForWeekPerDay
 * @param {Object} args - The arguments for the method.
 * @param {Date} args.startDate - The start date of the week.
 * @param {Date} args.endDate - The end date of the week.
 * @returns {Promise<Array>} - A promise that resolves to an array of objects containing the date and the total hours worked for each day.
 */
const getTotalForWeekPerDay = new ValidatedMethod({
  name: 'getTotalForWeekPerDay',
  validate(args) {
    check(args.startDate, Date)
    check(args.endDate, Date)
  },
  mixins: [authenticationMixin],
  async run({ startDate, endDate }) {
    return Timecards.rawCollection().aggregate([
      {
        $match: {
          userId: this.userId,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { date: '$date' },
          totalForDate: { $sum: '$hours' },
        },
      }]).toArray()
  },
})
/**
 * Calculates the total number of hours tracked in a given week.
 *
 * @param {Object} args - The arguments for calculating the week total.
 * @param {Date} args.startDate - The start date of the week.
 * @param {Date} args.endDate - The end date of the week.
 * @returns {number} The total number of hours tracked in the week.
 */
const getWeekTotal = new ValidatedMethod({
  name: 'getWeekTotal',
  validate(args) {
    check(args.startDate, Date)
    check(args.endDate, Date)
  },
  mixins: [authenticationMixin],
  async run({ startDate, endDate }) {
    const aggregatedweek = await Timecards.rawCollection().aggregate([
      {
        $match: {
          userId: this.userId,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: `${startDate}-${endDate}`,
          total: { $sum: '$hours' },
        },
      }]).toArray()
    return aggregatedweek[0]?.total
  },
})
/**
 * Bulk inserts multiple timecards into the Timecards collection.
 *
 * @method bulkInsertTimecards
 * @param {Object} args - The arguments for the method.
 * @param {Array} args.timecards - An array of timecard objects to be inserted.
 * @param {string} args.timecards[].projectId - The ID of the project for the timecard.
 * @param {string} args.timecards[].task - The task for the timecard.
 * @param {Date} args.timecards[].date - The date of the timecard.
 * @param {number} args.timecards[].hours - The number of hours for the timecard.
 * @param {string} [args.timecards[].userId] - The ID of the user for the timecard (optional).
 * @param {Object} [args.timecards[].customfields] - Custom fields for the timecard (optional).
 * @throws {Meteor.Error} If the user is not authenticated.
 * @throws {Meteor.Error} If validation fails for any timecard.
 * @returns {Object} An object containing the success message.
 */
const bulkInsertTimecards = new ValidatedMethod({
  name: 'bulkInsertTimecards',
  validate(args) {
    check(args, {
      timecards: Array,
    })
    args.timecards.forEach((timecard) => {
      check(timecard, {
        projectId: String,
        task: String,
        date: Date,
        hours: Number,
        userId: Match.Maybe(String), // Optional userId
        customfields: Match.Maybe(Object), // Optional custom fields
      })
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ timecards }) {
    const insertedTimecards = []
    for (const timecard of timecards) {
      const userId = timecard.userId || this.userId
      // Use provided userId or fallback to the current user
      const {
        projectId, task, date, hours, customfields,
      } = timecard
      // Check time entry rules
      await checkTimeEntryRule({
        userId,
        projectId,
        task,
        state: 'new',
        date,
        hours,
      })
      // Insert the timecard
      const timecardId = await insertTimeCard(projectId, task, date, hours, userId, null, customfields)
      insertedTimecards.push(timecardId)
    }
    return {
      success: true,
      message: `${insertedTimecards.length} timecards successfully inserted.`,
    }
  },
})
export {
  insertTimeCard,
  insertTimeCardMethod,
  upsertTimecard,
  upsertWeek,
  updateTimeCard,
  deleteTimeCard,
  deleteTimeCardsForWeek,
  setTimeEntriesState,
  getWorkingHoursForPeriod,
  getTotalHoursForPeriod,
  getDailyTimecards,
  sendToSiwapp,
  checkProjectAdministratorAndUser,
  getGoogleWorkspaceData,
  userTimeCardsForPeriodByProjectByTaskMethod,
  getWeekTotal,
  getTotalForWeekPerDay,
  bulkInsertTimecards,
}
