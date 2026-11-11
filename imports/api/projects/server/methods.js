import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import isBetween from 'dayjs/plugin/isBetween'
import { check, Match } from 'meteor/check'
import { ValidatedMethod } from 'meteor/mdg:validated-method'
import Timecards from '../../timecards/timecards'
import Projects from '../projects.js'
import CustomFields from '../../customfields/customfields.js'
import Tasks from '../../tasks/tasks.js'
import { addNotification } from '../../notifications/notifications.js'
import { emojify } from '../../../utils/frontend_helpers'
import { periodToDates } from '../../../utils/periodHelpers.js'
import { buildSafePayload } from '../../../utils/sanitizer.js'
import { authenticationMixin, transactionLogMixin, calculateSimilarity } from '../../../utils/server_method_helpers'

const projectAllowedFields = new Set([
  'name',
  'color',
  'startDate',
  'endDate',
  'desc',
  'customer',
  'defaultTask',
  'notbillable',
  'rate',
  'target',
  'public',
  'wekanurl',
  'selectedWekanList',
  'selectedWekanSwimlanes',
  'gitlabquery',
])

async function getProjectAllowedFields() {
  const customFields = await CustomFields.find(
    { classname: 'project' },
    { fields: { name: 1 } },
  ).fetchAsync()

  return new Set([
    ...projectAllowedFields,
    ...customFields.map(({ name }) => name.replace(/[^A-Z0-9]/ig, '_')),
  ])
}

/**
Get the statistics of all projects based on the timecards.
@param {Object} params - The parameters for the method
@param {Boolean} [params.includeNotBillableTime] - Whether to include not billable
time in the statistics
@param {Boolean} [params.showArchived] - Whether to show archived projects in the statistics
@returns {Object} - An object that contains the statistics of all projects
*/
const getAllProjectStats = new ValidatedMethod({
  name: 'getAllProjectStats',
  validate(args) {
    check(args.includeNotBillableTime, Match.Maybe(Boolean))
    check(args.showArchived, Match.Maybe(Boolean))
    check(args.period, Match.Maybe(String))
  },
  mixins: [authenticationMixin],
  async run({ includeNotBillableTime, showArchived, period }) {
    const notbillable = includeNotBillableTime
    dayjs.extend(utc)
    dayjs.extend(isBetween)
    const andCondition = [{
      $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
    }]
    if (!showArchived) {
      andCondition.push({ $or: [{ archived: false }, { archived: { $exists: false } }] })
    }
    if (!notbillable) {
      andCondition.push({ $or: [{ notbillable }, { notbillable: { $exists: false } }] })
    }
    let projectList = await Projects.find({ $and: andCondition }, { _id: 1 })
      .fetchAsync()
    projectList = projectList.map((value) => value._id)
    let totalHours = 0
    let currentMonthHours = 0
    let previousMonthHours = 0
    let beforePreviousMonthHours = 0
    const currentMonthName = dayjs.utc().format('MMM')
    const currentMonthStart = dayjs.utc().startOf('month')
    const currentMonthEnd = dayjs.utc().endOf('month')
    const previousMonthName = dayjs.utc().subtract(1, 'month').format('MMM')
    const beforePreviousMonthName = dayjs.utc().subtract(2, 'month').format('MMM')
    const previousMonthStart = dayjs.utc().subtract(1, 'month').startOf('month')
    const previousMonthEnd = dayjs.utc().subtract(1, 'month').endOf('month')
    const beforePreviousMonthStart = dayjs.utc().subtract(2, 'month').startOf('month')
    const beforePreviousMonthEnd = dayjs.utc().subtract(2, 'month').endOf('month')
    const matchSelector = {
      $match: {
        projectId: { $in: projectList },
      },
    }
    if (period && period !== 'all') {
      const {startDate, endDate} = await periodToDates(period)
      matchSelector.$match.date = { $gte: startDate, $lte: endDate }
    }
    const timecardAggregation = await Timecards.rawCollection().aggregate([matchSelector, { $group: { _id: null, totalHours: { $sum: '$hours' } } }]).toArray()
    totalHours = Number.parseFloat(timecardAggregation[0]?.totalHours)
    for (const timecard of
      await Timecards.find({
        projectId: { $in: projectList },
        date: { $gte: beforePreviousMonthStart.toDate() },
      }).fetchAsync()) {
      if (dayjs.utc(new Date(timecard.date)).isBetween(currentMonthStart, currentMonthEnd, null, '[]')) {
        currentMonthHours += Number.parseFloat(timecard.hours)
      } else if (dayjs.utc(new Date(timecard.date))
        .isBetween(previousMonthStart, previousMonthEnd, null, '[]')) {
        previousMonthHours += Number.parseFloat(timecard.hours)
      } else if (dayjs.utc(new Date(timecard.date))
        .isBetween(beforePreviousMonthStart, beforePreviousMonthEnd, null, '[]')) {
        beforePreviousMonthHours += Number.parseFloat(timecard.hours)
      }
    }
    return {
      totalHours,
      currentMonthName,
      currentMonthHours,
      previousMonthName,
      previousMonthHours,
      beforePreviousMonthName,
      beforePreviousMonthHours,
    }
  },
})
const getProjectUsers = new ValidatedMethod({
  name: 'getProjectUsers',
  validate(args) {
    check(args, {
      projectId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId }) {
    const data = []
    const project = await Projects.findOneAsync(
      { _id: projectId },
      {
        fields: {
          public: 1,
          team: 1,
          admins: 1,
          userId: 1,
        },
      },
    )
    if (project?.public) {
      for (const user of Meteor.users.find(
        { inactive: { $ne: true } },
        { fields: { 'profile.name': 1 } },
      )) {
        data.push({ _id: user._id, profile: { name: user.profile?.name } })
      }
    } else if (project?.team || project?.admins) {
      let team = []
      if (project.team) {
        team = team.concat(project.team)
      }
      if (project.admins) {
        team = team.concat(project.admins)
      }
      if (team.indexOf(project.userId) === -1) {
        team.push(project.userId)
      }
      team = team.filter((value, index, self) => self.indexOf(value) === index)
      await Promise.all(team.map(async (member) => {
        const user = await Meteor.users.findOneAsync(
          { _id: member, inactive: { $ne: true } },
          { fields: { 'profile.name': 1 } },
        )
        if (user) {
          data.push({ _id: user._id, profile: { name: user.profile?.name } })
        }
      }))
    }
    return data
  },
})
/**
 * Update a project by ID
 *
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to update
 * @param {Array} options.projectArray - An array of attributes and their values
 * to update for the project
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to update the project
 * @return {undefined}
 */
const updateProject = new ValidatedMethod({
  name: 'updateProject',
  validate(args) {
    check(args, {
      projectId: String,
      projectArray: Array,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, projectArray }) {
    const allowedFields = await getProjectAllowedFields()
    const updateJSON = buildSafePayload(Object.fromEntries(
      projectArray.map((projectAttribute) => [projectAttribute.name, projectAttribute.value]),
    ), allowedFields)
    if (!updateJSON.name) {
      throw new Meteor.Error('error-project-name-required', 'Project name is required')
    }
    updateJSON.name = await emojify(updateJSON.name)
    if (!updateJSON.public) {
      updateJSON.public = false
    } else {
      updateJSON.public = true
    }
    if (!updateJSON.notbillable) {
      updateJSON.notbillable = false
    } else {
      updateJSON.notbillable = true
    }
    if (updateJSON.startDate) {
      updateJSON.startDate = new Date(updateJSON.startDate)
    }
    if (updateJSON.endDate) {
      updateJSON.endDate = new Date(updateJSON.endDate)
    }
    await Projects.updateAsync({
      $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
      _id: projectId,
    }, { $set: updateJSON })
  },
})
/**
 * Create a new project
 * @param {Object} options
 * @param {Array} options.projectArray - An array of attributes and their values
 * to create for the project
 * @throws {Meteor.Error} If the user is not authenticated
 * @return {String} The ID of the newly created project
*/
const createProject = new ValidatedMethod({
  name: 'createProject',
  validate(args) {
    check(args, {
      projectArray: Array,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectArray }) {
    const allowedFields = await getProjectAllowedFields()
    const updateJSON = buildSafePayload(Object.fromEntries(
      projectArray.map((projectAttribute) => [projectAttribute.name, projectAttribute.value]),
    ), allowedFields)
    if (!updateJSON.name) {
      throw new Meteor.Error('error-project-name-required', 'Project name is required')
    }
    if (!updateJSON.public) {
      updateJSON.public = false
    } else {
      updateJSON.public = true
    }
    if (updateJSON.startDate) {
      updateJSON.startDate = new Date(updateJSON.startDate)
    }
    if (updateJSON.endDate) {
      updateJSON.endDate = new Date(updateJSON.endDate)
    }
    updateJSON.name = await emojify(updateJSON.name)
    updateJSON._id = Random.id()
    updateJSON.userId = this.userId
    await Projects.insertAsync(updateJSON)
    return updateJSON._id
  },
})
/**
 * Delete a project by ID
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to delete
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to delete the project
 * @return {undefined}
 */
const deleteProject = new ValidatedMethod({
  name: 'deleteProject',
  validate(args) {
    check(args, {
      projectId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId }) {
    await Projects.removeAsync({
      $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
      _id: projectId,
    })
    return true
  },
})
/**
 * Archive a project by ID
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to archive
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to archive the project
 * @return {undefined}
 */
const archiveProject = new ValidatedMethod({
  name: 'archiveProject',
  validate(args) {
    check(args, {
      projectId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId }) {
    await Projects.updateAsync(
      {
        _id: projectId,
        $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
      },
      { $set: { archived: true } },
    )
    return true
  },
})
/**
 * Restore a project by ID
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to restore
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to restore the project
 * @return {undefined}
 */
const restoreProject = new ValidatedMethod({
  name: 'restoreProject',
  validate(args) {
    check(args, {
      projectId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId }) {
    await Projects.updateAsync(
      {
        _id: projectId,
        $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
      },
      { $set: { archived: false } },
    )
    return true
  },
})
const getTopTasks = new ValidatedMethod({
  name: 'getTopTasks',
  validate(args) {
    check(args, {
      projectId: String,
      includeNotBillableTime: Match.Maybe(Boolean),
      showArchived: Match.Maybe(Boolean),
    })
  },
  mixins: [authenticationMixin],
  async run({ projectId, includeNotBillableTime, showArchived }) {
    const rawCollection = Timecards.rawCollection()
    if (projectId === 'all') {
      const notbillable = includeNotBillableTime
      const andCondition = [{
        $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
      }]
      if (!showArchived) {
        andCondition.push({ $or: [{ archived: false }, { archived: { $exists: false } }] })
      }
      if (!notbillable) {
        andCondition.push({ $or: [{ notbillable }, { notbillable: { $exists: false } }] })
      }
      let projectList = await Projects.find({ $and: andCondition }, { _id: 1 })
        .fetchAsync()
      projectList = projectList.map((value) => value._id)
      return rawCollection.aggregate([{ $match: { projectId: { $in: projectList } } }, { $group: { _id: '$task', count: { $sum: '$hours' } } }, { $sort: { count: -1 } }, { $limit: 3 }]).toArray()
    }
    return rawCollection.aggregate([{ $match: { projectId } }, { $group: { _id: '$task', count: { $sum: '$hours' } } }, { $sort: { count: -1 } }, { $limit: 3 }]).toArray()
  },
})

const getProjectDistribution = new ValidatedMethod({
  name: 'getProjectDistribution',
  validate(args) {
    check(args, {
      projectId: String,
      includeNotBillableTime: Match.Maybe(Boolean),
      showArchived: Match.Maybe(Boolean),
      period: Match.Maybe(String),
    })
  },
  mixins: [authenticationMixin],
  async run({ projectId, includeNotBillableTime, showArchived, period }) {
    const rawCollection = Timecards.rawCollection()
    if (projectId === 'all') {
      const notbillable = includeNotBillableTime
      const andCondition = [{
        $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
      }]
      if (!showArchived) {
        andCondition.push({ $or: [{ archived: false }, { archived: { $exists: false } }] })
      }
      if (!notbillable) {
        andCondition.push({ $or: [{ notbillable }, { notbillable: { $exists: false } }] })
      }
      let projectList = await Projects.find({ $and: andCondition }, { _id: 1 })
        .fetchAsync()
      projectList = projectList.map((value) => value._id)
      const matchSelector = {
        $match: {
          projectId: { $in: projectList },
        },
      }
      if (period && period !== 'all') {
        const { startDate, endDate } = await periodToDates(period)
        matchSelector.$match.date = { $gte: startDate, $lte: endDate }
      }
      return rawCollection.aggregate([matchSelector, { $group: { _id: '$projectId', count: { $sum: '$hours' } } }, { $sort: { projectId: 1 } }]).toArray()
    }
    const matchSelector = {
      $match: { projectId },
    }
    if (period) {
      const { startDate, endDate } = await periodToDates(period)
      matchSelector.$match.date = { $gte: startDate, $lte: endDate }
    }
    return rawCollection.aggregate([matchSelector, { $group: { _id: '$projectId', count: { $sum: '$hours' } } }, { $sort: { projectId: 1 } }]).toArray()
  },
})
/**
 * Add a team member to a project
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to add the team member to
 * @param {String} options.eMail - The eMail of the user to add to the project
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to add a team member to the project
 * @return {undefined}
 */
const addTeamMember = new ValidatedMethod({
  name: 'addTeamMember',
  validate(args) {
    check(args, {
      projectId: String,
      eMail: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, eMail }) {
    const targetProject = await Projects.findOneAsync({ _id: projectId })
    if (!targetProject
      || !(targetProject.userId === this.userId
        || targetProject.admins?.indexOf(this.userId) >= 0)) {
      throw new Meteor.Error('notifications.only_owner_can_add_team_members')
    }
    const targetUser = await Meteor.users.findOneAsync({ 'emails.0.address': eMail, inactive: { $ne: true } })
    if (targetUser) {
      await Projects
        .updateAsync({ _id: targetProject._id }, { $addToSet: { team: targetUser._id } })
      await addNotification(`You have been invited to collaborate on the titra project '${targetProject.name}'`, targetUser._id)
      return 'notifications.team_member_added_success'
    }
    throw new Meteor.Error('notifications.user_not_found')
  },
})
/**
 * Remove a team member from a project
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to remove the team member from
 * @param {String} options.userId - The ID of the user to remove from the project
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to remove a team member from the project
 * @return {undefined}
 */
const removeTeamMember = new ValidatedMethod({
  name: 'removeTeamMember',
  validate(args) {
    check(args, {
      projectId: String,
      userId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, userId }) {
    const targetProject = await Projects.findOneAsync({ _id: projectId })
    if (!targetProject
      || !(targetProject.userId === this.userId
        || targetProject.admins.indexOf(this.userId) >= 0)) {
      throw new Meteor.Error('notifications.only_owner_can_remove_team_members')
    }
    await Projects.updateAsync({ _id: targetProject._id }, { $pull: { team: userId } })
    await Projects.updateAsync({ _id: targetProject._id }, { $pull: { admins: userId } })
    return 'notifications.team_member_removed_success'
  },
})
/**
 * Change the role of a team member
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to change the team member's role in
 * @param {String} options.userId - The ID of the user to change the role of
 * @param {Boolean} options.administrator - Whether the user should be an administrator
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to change the role of a team member
 * @return {undefined}
 */
const changeProjectRole = new ValidatedMethod({
  name: 'changeProjectRole',
  validate(args) {
    check(args, {
      projectId: String,
      userId: String,
      administrator: Boolean,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, userId, administrator }) {
    const targetProject = await Projects.findOneAsync({ _id: projectId })
    if (!targetProject
      || !(targetProject.userId === this.userId
        || targetProject.admins.indexOf(this.userId) >= 0)) {
      throw new Meteor.Error('notifications.only_owner_can_remove_team_members')
    }
    if (administrator) {
      await Projects.updateAsync({ _id: targetProject._id }, { $push: { admins: userId } })
    } else {
      await Projects.updateAsync({ _id: targetProject._id }, { $pull: { admins: userId } })
    }
    return 'notifications.access_rights_updated'
  },
})
/**
 * Update the priority of a project
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to update the priority of
 * @param {Number} options.priority - The new priority of the project
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to update the priority of the project
 * @return {undefined}
 */
const updatePriority = new ValidatedMethod({
  name: 'updatePriority',
  validate(args) {
    check(args, {
      projectId: String,
      priority: Number,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, priority }) {
    await Projects.updateAsync(
      {
        _id: projectId,
        $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
      },
      { $set: { priority } },
    )
    return 'notifications.project_priority_success'
  },
})
/**
 * Update the default task of a project
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to update the default task of
 * @param {String} options.taskId - The ID of the task to set as the default task
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to update the default task of the project
 * @return {undefined}
 */
const setDefaultTaskForProject = new ValidatedMethod({
  name: 'setDefaultTaskForProject',
  validate(args) {
    check(args, {
      projectId: String,
      taskId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, taskId }) {
    const project = await Projects.findOneAsync({
      _id: projectId,
      $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
    })
    if (!project) {
      throw new Meteor.Error('notifications.project_not_found')
    }
    const task = await Tasks.findOneAsync({ _id: taskId })
    if (!task || task.projectId !== projectId) {
      throw new Meteor.Error('notifications.task_not_found')
    }
    if (task.isDefaultTask) {
      await Projects.updateAsync({ _id: projectId }, { $unset: { defaultTask: 1 } })
      await Tasks.updateAsync({ _id: taskId }, { $set: { isDefaultTask: false } })
      return 'notifications.default_task_success'
    }
    await Projects.updateAsync({ _id: projectId }, { $set: { defaultTask: task.name } })
    await Tasks.updateAsync({ projectId }, { $set: { isDefaultTask: false } }, { multi: true })
    await Tasks.updateAsync({ _id: taskId }, { $set: { isDefaultTask: true } })
    return 'notifications.default_task_success'
  },
})

/**
 * Set the rate for a user in a project
 * @param {Object} options
 * @param {String} options.projectId - The ID of the project to set the rate for the user in
 * @param {String} options.userId - The ID of the user to set the rate for
 * @param {Number} options.rate - The rate to set for the user
 * @throws {Meteor.Error} If the project is not found or the user does not have
 * permission to set the rate for the user
 * @return {undefined}
 */
const setRateForUser = new ValidatedMethod({
  name: 'setRateForUser',
  validate(args) {
    check(args, {
      projectId: String,
      userId: String,
      rate: Number,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ projectId, userId, rate }) {
    const project = await Projects.findOneAsync({
      _id: projectId,
      $or: [{ userId: this.userId }, { admins: { $in: [this.userId] } }],
    })
    if (!project) {
      throw new Meteor.Error('notifications.project_not_found')
    }
    const rates = project.rates || {}
    const rateId = JSON.parse(`{ "rates.${userId}": 1}`)
    if (parseFloat(rate) > 0) {
      rates[userId] = rate
      await Projects.updateAsync({ _id: projectId }, { $set: { rates } })
    } else {
      await Projects.updateAsync({ _id: projectId }, { $unset: rateId })
    }
    return 'notifications.rate_success'
  },
})

/**
 * Searches for a project based on the provided query.
 *
 * @param {Object} args - The arguments for the method.
 * @param {string} args.query - The query string to search for.
 * @returns {string|null} - The ID of the project with the highest
 * similarity score to the query, or null if no projects are found.
 */
const searchForProject = new ValidatedMethod({
  name: 'searchForProject',
  validate(args) {
    check(args, {
      query: String,
    })
  },
  mixins: [authenticationMixin],
  async run({ query }) {
    const projects = await Projects.find({
      $and: [
        {
          $or: [{ userId: this.userId }, { public: true }, { team: this.userId }],
        },
        { $or: [{ archived: false }, { archived: { $exists: false } }] },
      ],
    }).fetchAsync()
    projects.map((entry) => ({ ...entry, score: calculateSimilarity(entry.name, query) }))
    projects.sort((a, b) => b.score - a.score)
    return projects.length > 0 ? projects[0]._id : null
  },
})

export {
  getAllProjectStats,
  getProjectUsers,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  restoreProject,
  getTopTasks,
  getProjectDistribution,
  addTeamMember,
  removeTeamMember,
  changeProjectRole,
  updatePriority,
  setDefaultTaskForProject,
  setRateForUser,
  searchForProject,
}
