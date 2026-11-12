import { ValidatedMethod } from 'meteor/mdg:validated-method'
import { check, Match } from 'meteor/check'
import Tasks from '../tasks.js'
import { sanitizeObject } from '../../../utils/sanitizer.js'
import { taskForbiddenCustomfieldKeys } from '../../../utils/securityFieldPolicies.js'
import { authenticationMixin, transactionLogMixin } from '../../../utils/server_method_helpers.js'

/**
Inserts a new project task into the Tasks collection.
@param {Object} args - The arguments object containing the task information.
@param {string} args.projectId - The ID of the project for the task.
@param {string} args.name - The name of the task.
@param {Date} args.start - The start date of the task.
@param {Date} [args.end] - The end date of the task; defaults to the start date.
@param {number} [args.estimatedHours] - The estimated/planned hours for the task.
@param {string[]} [args.dependencies] - An array of task IDs that this task depends on.
*/
const insertProjectTask = new ValidatedMethod({
  name: 'insertProjectTask',
  validate(args) {
    check(args, {
      projectId: String,
      name: String,
      start: Date,
      end: Match.Optional(Date),
      estimatedHours: Match.Optional(Number),
      dependencies: Match.Optional([String]),
      customfields: Match.Optional(Object),
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, name, start, end = start, estimatedHours, dependencies, customfields,
  }) {
    await Tasks.insertAsync({
      ...sanitizeObject(customfields, taskForbiddenCustomfieldKeys),
      projectId,
      name,
      start,
      end,
      estimatedHours,
      dependencies,
    })
  },
})
/**
 * Updates a task in the Tasks collection.
 * @param {Object} args - The arguments object containing the task information.
 * @param {string} args.taskId - The ID of the task to update.
 * @param {string} [args.projectId] - The ID of the project for the task.
 * @param {string} [args.name] - The name of the task.
 * @param {Date} [args.start] - The start date of the task.
 * @param {Date} [args.end] - The end date of the task.
 * @param {number} [args.estimatedHours] - The estimated/planned hours for the task.
 * @param {string[]} [args.dependencies] - An array of task IDs that this task depends on.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 */
const updateTask = new ValidatedMethod({
  name: 'updateTask',
  validate(args) {
    check(args, {
      taskId: String,
      projectId: Match.Optional(String),
      name: Match.Optional(String),
      start: Match.Optional(Date),
      end: Match.Optional(Date),
      estimatedHours: Match.Optional(Number),
      dependencies: Match.Optional([String]),
      customfields: Match.Optional(Object),
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    taskId, name, start, end, estimatedHours, dependencies, customfields,
  }) {
    await Tasks.updateAsync(taskId, {
      $set: {
        ...sanitizeObject(customfields, taskForbiddenCustomfieldKeys),
        name,
        start,
        end,
        estimatedHours,
        dependencies,
      },
    })
  },
})
/**
 * Removes a task from the Tasks collection.
 * @param {Object} args - The arguments object containing the task information.
 * @param {string} args.taskId - The ID of the task to remove.
 * @throws {Meteor.Error} If user is not authenticated.
 * @returns {String} 'notifications.success' if successful
 */
const removeProjectTask = new ValidatedMethod({
  name: 'removeProjectTask',
  validate(args) {
    check(args, {
      taskId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({ taskId }) {
    await Tasks.removeAsync({ _id: taskId })
  },
})

export {
  insertProjectTask, updateTask, removeProjectTask,
}
