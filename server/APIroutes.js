import { Match, check } from 'meteor/check'
import { WebApp } from 'meteor/webapp'
import { getJson } from './bodyparser'
import { insertTimeCard } from '../imports/api/timecards/server/methods'
import Timecards from '../imports/api/timecards/timecards'
import Projects from '../imports/api/projects/projects'
import Tasks from '../imports/api/tasks/tasks'

function normalizeDomain(host) {
  if (!host) return null
  // Remove port
  let domain = host.split(':')[0]
  // Convert to lowercase
  domain = domain.toLowerCase()
  // Remove protocol prefix
  domain = domain.replace(/^https?:\/\//, '')
  return domain
}

function sendResponse(res, statusCode, message, payload) {
  const response = {}
  response.statusCode = statusCode
  response.message = message
  if (payload) {
    response.payload = payload
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  })
  res.end(JSON.stringify(response))
}
async function checkAuthorization(req, res) {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const meteorUser = await Meteor.users.findOneAsync({ 'profile.APItoken': authHeader.split(' ')[1] })
    if (authHeader && authHeader.split(' ')[1] && meteorUser) {
      return meteorUser
    }
  }
  sendResponse(res, 401, 'Missing authorization header or invalid authorization token supplied.')
  return false
}

async function checkProjectAccess(projectId, userId, res) {
  const project = await Projects.findOneAsync({
    _id: projectId,
    $or: [
      { userId },
      { public: true },
      { team: userId },
      { admins: userId },
    ],
  })
  if (!project) {
    sendResponse(res, 403, 'Access denied to project.')
    return false
  }
  return project
}
/**
 * @apiDefine AuthError
 * @apiError {json} AuthError The request is missing the authentication header or an invalid API token has been provided.
 * @apiErrorExample {json} Authorization-Error-Response:
 *     HTTP/1.1 401 Unauthorized
 *     {
 *       "message": "Missing authorization header or invalid authorization token supplied."
 *     }
 */

/**
 * @api {post} /timeentry/create Create time entry
 * @apiName createTimeEntry
 * @apiDescription Create a new time entry for the user assigned to the provided API token
 * @apiGroup TimeEntry
 *
 * @apiHeader {String} Token The authorization header Bearer API token.
 * @apiBody {String} projectId The project ID.
 * @apiBody {String} task The task description of the new time entry.
 * @apiBody {Date} date The date for the new time entry in format YYYY-MM-DD.
 * @apiBody {Number} hours The number of hours to track.
 * @apiBody {Number} [taskRate] The rate for the task.
 * @apiBody {Object} [customfields] An object containing custom fields for the time entry.
 * @apiParamExample {json} Request-Example:
 *                  {
 *                    "projectId": "123456",
 *                    "task": "Work done.",
 *                    "date": "2019-11-10",
 *                    "hours": 8
 *                  }
 * @apiSuccess {json} response The id of the new time entry.
 * @apiSuccessExample {json} Success response:
 * {
 *  message: "time entry created."
 *  payload: {
 *    timecardId: "123456"
 *  }
 *  }
 * @apiUse AuthError
 */
WebApp.handlers.use('/timeentry/create/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  let json
  try {
    json = await getJson(req)
  } catch (e) {
    sendResponse(res, 400, `Invalid JSON received. ${e}`)
  }
  if (json) {
    try {
      check(json.projectId, String)
      check(json.task, String)
      check(new Date(json.date), Date)
      check(json.hours, Number)
      check(json.taskRate, Match.Maybe(Number))
      check(json.customfields, Match.Maybe(Object))
    } catch (error) {
      sendResponse(res, 500, `Invalid parameters received.${error}`)
      return
    }
    // Check if user has access to the project
    const project = await checkProjectAccess(json.projectId, meteorUser._id, res)
    if (!project) {
      return
    }
    const timecardId = await insertTimeCard(json.projectId, json.task, new Date(json.date), json.hours, meteorUser._id, json.taskRate, json.customfields)
    const payload = {}
    payload.timecardId = timecardId
    sendResponse(res, 200, 'Time entry created.', payload)
    return
  }
  sendResponse(res, 500, 'Missing mandatory parameters.')
})

/**
  * @api {get} /timeentry/list/:date Get time entries for date
  * @apiDescription list time entries of the authorized user for the provided date
  * @apiName getTimeEntriesForDate
  * @apiGroup TimeEntry
  *
  * @apiHeader {String} Token The authorization header Bearer API token.
  * @apiParam {Date} date The date to list time entries for in format YYYY-MM-DD.

  * @apiSuccess {json} response An array of time entries tracked for the user with the provided API token
  * for the provided date.
  * @apiUse AuthError
  */
WebApp.handlers.use('/timeentry/list/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const date = new Date(url[3])
  try {
    check(date, Date)
  } catch (error) {
    sendResponse(res, 500, `Invalid parameters received.${error}`)
    return
  }
  const payload = await Timecards.find({
    userId: meteorUser._id,
    date,
  }).fetchAsync()
  sendResponse(res, 200, `Returning user time entries for date ${date}`, payload)
})
/**
  * @api {get} /timeentry/daterange/:fromDate/:toDate Get time entries for daterange
  * @apiDescription list time entries of the authorized user for the provided date range
  * @apiName getTimeEntriesForDateRange
  * @apiGroup TimeEntry
  *
  * @apiHeader {String} Token The authorization header Bearer API token.
  * @apiParam {Date} fromDate The date to list time entries starting from in format YYYY-MM-DD.
  * @apiParam {Date} toDate The date to list time entries ending at in format YYYY-MM-DD.
  * @apiSuccess {json} response An array of time entries tracked for the user with the provided API token
  * for the provided date range.
  * @apiUse AuthError
  */
WebApp.handlers.use('/timeentry/daterange/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const fromDate = new Date(url[3])
  const toDate = new Date(url[4])
  try {
    check(fromDate, Date)
    check(toDate, Date)
  } catch (error) {
    sendResponse(res, 500, `Invalid parameters received.${error}`)
    return
  }
  const payload = await Timecards.find({
    userId: meteorUser._id,
    date: { $gte: fromDate, $lte: toDate },
  }).fetchAsync()
  sendResponse(res, 200, `Returning user time entries for date range ${fromDate} to ${toDate}`, payload)
})

/**
   * @api {get} /project/list/ Get all projects
   * @apiDescription Lists all projects visible to the user assigned to the provided API token
   * @apiName getProjects
   * @apiGroup Project
   *
   * @apiHeader {String} Token The authorization header Bearer API token.
   * @apiSuccess {json} response An array of all projects visible for the user with the provided API token.
   * @apiUse AuthError
   */
WebApp.handlers.use('/project/list/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const payload = await Projects.find({
    $or: [{ userId: meteorUser._id }, { public: true }, { team: meteorUser._id }],
  }).fetchAsync()
  sendResponse(res, 200, 'Returning projects', payload)
})

/**
 * @api {get} /project/timeentries/:projectId Get time entries for project
 * @apiDescription List time entries for the specified project
 * @apiName getTimeEntriesForProject
 * @apiGroup Project
 *
 * @apiHeader {String} Token The authorization header Bearer API token.
 * @apiParam {String} projectId The ID of the project to list time entries for.
 * @apiSuccess {json} response An array of time entries for the specified project.
 * @apiUse AuthError
 */
WebApp.handlers.use('/project/timeentries/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const projectId = url[3]

  // Check if user has access to the project
  const project = await checkProjectAccess(projectId, meteorUser._id, res)
  if (!project) {
    return
  }

  const payload = await Timecards.find({
    projectId,
  }).fetchAsync()
  sendResponse(res, 200, 'Returning time entries for project', payload)
})
/**
 * @api {get} /project/timeentriesfordaterange/:projectId/:fromDate/:toDate Get time entries for a project within a date range
 * @apiName GetTimeEntriesForDateRange
 * @apiGroup Project
 *
 * @apiParam {String} projectId The ID of the project.
 * @apiParam {String} fromDate The start date of the range (ISO 8601 format).
 * @apiParam {String} toDate The end date of the range (ISO 8601 format).
 *
 * @apiSuccess {Object[]} payload A list of time entries for the specified project and date range.
 * @apiSuccess {String} payload.projectId The ID of the project.
 * @apiSuccess {String} payload.date The date of the time entry.
 * @apiSuccess {Number} payload.hours The number of hours logged.
 * @apiSuccess {String} payload.description A description of the work done.
 *
 * @apiError (500) InvalidParameters Invalid parameters received.
 *
 * @apiExample {curl} Example usage:
 *     curl -i http://localhost:3000/project/timeentriesfordaterange/12345/2023-01-01/2023-01-31
 */
WebApp.handlers.use('/project/timeentriesfordaterange/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const projectId = url[3]
  const fromDate = new Date(url[4])
  const toDate = new Date(url[5])
  try {
    check(projectId, String)
    check(fromDate, Date)
    check(toDate, Date)
  } catch (error) {
    sendResponse(res, 500, `Invalid parameters received.${error}`)
    return
  }

  // Check if user has access to the project
  const project = await checkProjectAccess(projectId, meteorUser._id, res)
  if (!project) {
    return
  }

  const payload = await Timecards.find({
    projectId,
    date: { $gte: fromDate, $lte: toDate },
  }).fetchAsync()
  sendResponse(res, 200, `Returning project time entries for date range ${fromDate} to ${toDate}`, payload)
})

/**
   * @api {post} /project/create/ Create a new project
   * @apiDescription Creates a new titra project based on the parameters provided
   * @apiName CreateProject
   * @apiGroup Project
   *
   * @apiHeader {String} Token The authorization header Bearer API token.
   * @apiBody {String} name The project name.
   * @apiBody {String} [description] The description of the project.
   * @apiBody {String} [color] The project color in HEX color code.
   * @apiBody {String} [customer] The customer of the project.
   * @apiBody {Number} [rate] The hourly rate of the project.
   * @apiBody {Number} [budget] The budget for this project in hours.

   * @apiParamExample {json} Request-Example:
   *                  {
   *                    "name": "Project A",
   *                    "description": "This is the description of Project A.",
   *                    "color": "#009688",
   *                    "customer": "Paying customer",
   *                    "rate": 100,
   *                    "budget": 50
   *                  }
   * @apiSuccess {json} response The id of the new project.
   *  * @apiSuccessExample {json} Success response:
    * {
    *    message: "time entry created.",
    *    payload: {
    *      projectId: "123456"
    *    }
    *  }
   * @apiUse AuthError
   * @apiExample {curl} Example usage:
 *     curl -d '{"name":"api-test-project", "description":"fabians api project"}' -H "Content-Type: application/json" -H "Authorization: Token abcdefgHIJKLMNOP" -X POST http://localhost:3000/project/create
   */
WebApp.handlers.use('/project/create/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  let json
  try {
    json = await getJson(req)
  } catch (e) {
    sendResponse(res, 400, `Invalid JSON received. ${e}`)
  }
  if (json) {
    try {
      check(json.name, String)
      check(json.description, Match.Maybe(String))
      check(json.color, Match.Maybe(String))
      check(json.customer, Match.Maybe(String))
      check(json.rate, Match.Maybe(Number))
      check(json.budget, Match.Maybe(Number))
    } catch (error) {
      sendResponse(res, 500, `Invalid parameters received.${error}`)
      return
    }
    json.userId = meteorUser._id
    const projectId = await Projects.insertAsync(json)
    const payload = {}
    payload.projectId = projectId
    sendResponse(res, 200, 'Project created.', payload)
  }
})
/**
   * @api {post} /timer/start/ Start a new timer
   * @apiDescription Starts a new timer for the API user if there is no current running timer.
   * @apiName startTimer
   * @apiGroup TimeEntry
   *
   * @apiHeader {String} Token The authorization header Bearer API token.
   * @apiSuccess {json} response If there is no current running timer a new one will be started.
   *  * @apiSuccessExample {json} Success response:
    * {
    *  message: "New timer started."
    *  payload: {
    *    "startTime": "Sat Jun 26 2021 21:48:11 GMT+0200"
    *  }
    * }
   * @apiError {json} response There is already another running timer.
    *      @apiErrorExample {json} Error-Response:
    *     HTTP/1.1 500 Internal Server Error
    *     {
    *       "message": "There is already another running timer."
    *     }
   * @apiUse AuthError
   */
WebApp.handlers.use('/timer/start/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const payload = {}
  if (!meteorUser.profile.timer) {
    payload.startTime = meteorUser.profile.timer
    await Meteor.users.updateAsync({ _id: meteorUser._id }, { $set: { 'profile.timer': new Date() } })
    sendResponse(res, 200, 'New timer started.', payload)
  } else {
    sendResponse(res, 500, 'There is already another running timer.')
  }
})

/**
   * @api {get} /timer/get/ Get the duration of the current timer
   * @apiDescription Get the duration in milliseconds and the start timestamp of the currently running timer for the API user.
   * @apiName getTimer
   * @apiGroup TimeEntry
   *
   * @apiHeader {String} Token The authorization header Bearer API token.
   * @apiSuccess {json} response Returns the duration of the currently running timer.
   *  * @apiSuccessExample {json} Success response:
    * {
    *  message: "Running timer received."
    *  payload: {
    *    "duration": 60000,
    *    "startTime": "Sat Jun 26 2021 21:48:11 GMT+0200"
    *  }
    * }
   * @apiError {json} response There is no running timer.
    *      @apiErrorExample {json} Error-Response:
    *     HTTP/1.1 500 Internal Server Error
    *     {
    *       "message": "No running timer found."
    *     }
   * @apiUse AuthError
   */
WebApp.handlers.use('/timer/get/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const payload = {}
  if (meteorUser.profile.timer) {
    payload.startTime = meteorUser.profile.timer
    const currentTime = new Date()
    const timerTime = new Date(meteorUser.profile.timer)
    payload.duration = currentTime.getTime() - timerTime.getTime()
    sendResponse(res, 200, 'Running timer received.', payload)
  } else {
    sendResponse(res, 500, 'No running timer found.')
  }
})
/**
   * @api {post} /timer/stop/ Stop a running timer
   * @apiDescription Stop a running timer of the API user and return the start timestamp and duration in milliseconds.
   * @apiName stopTimer
   * @apiGroup TimeEntry
   *
   * @apiHeader {String} Token The authorization header Bearer API token.
   * @apiSuccess {json} response Returns the duration in milliseconds and the start timestamp of the stopped timer as result.
   *  * @apiSuccessExample {json} Success response:
    * {
    *  message: "Running timer stopped."
    *  payload: {
    *    "duration": 60000,
    *    "startTime": "Sat Jun 26 2021 21:48:11 GMT+0200"
    *  }
    * }
  * @apiError {json} response No running timer to stop.
    *      @apiErrorExample {json} Error-Response:
    *     HTTP/1.1 500 Internal Server Error
    *     {
    *       "message": "No running timer found."
    *     }
   * @apiUse AuthError
   */
WebApp.handlers.use('/timer/stop/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const payload = {}
  if (meteorUser.profile.timer) {
    payload.startTime = meteorUser.profile.timer
    const currentTime = new Date()
    const timerTime = new Date(meteorUser.profile.timer)
    payload.duration = currentTime.getTime() - timerTime.getTime()
    await Meteor.users.updateAsync({ _id: meteorUser._id }, { $unset: { 'profile.timer': '' } })
    sendResponse(res, 200, 'Running timer stopped.', payload)
  } else {
    sendResponse(res, 500, 'No running timer found.')
  }
})

/**
 * @api {post} /project/task/create Create a predefined task for a project
 * @apiName createProjectTask
 * @apiDescription Create a new predefined task for a project with estimated hours
 * @apiGroup Task
 *
 * @apiHeader {String} Token The authorization header Bearer API token.
 * @apiBody {String} projectId The project ID.
 * @apiBody {String} name The name of the task.
 * @apiBody {Date} start The start date of the task in ISO format.
 * @apiBody {Date} end The end date of the task in ISO format.
 * @apiBody {Number} [estimatedHours] The estimated/planned hours for the task.
 * @apiBody {String[]} [dependencies] An array of task IDs that this task depends on.
 * @apiBody {Object} [customfields] An object containing custom fields for the task.
 * @apiParamExample {json} Request-Example:
 *                  {
 *                    "projectId": "123456",
 *                    "name": "Development Task",
 *                    "start": "2024-01-01T09:00:00.000Z",
 *                    "end": "2024-01-05T17:00:00.000Z",
 *                    "estimatedHours": 40
 *                  }
 * @apiSuccess {json} response The id of the new task.
 * @apiSuccessExample {json} Success response:
 * {
 *  message: "Task created."
 *  payload: {
 *    taskId: "123456"
 *  }
 *  }
 * @apiUse AuthError
 */
WebApp.handlers.use('/project/task/create/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  let json
  try {
    json = await getJson(req)
  } catch (e) {
    sendResponse(res, 400, `Invalid JSON received. ${e}`)
  }
  if (json) {
    try {
      check(json.projectId, String)
      check(json.name, String)
      check(new Date(json.start), Date)
      check(new Date(json.end), Date)
      check(json.estimatedHours, Match.Maybe(Number))
      check(json.dependencies, Match.Maybe([String]))
      check(json.customfields, Match.Maybe(Object))
    } catch (error) {
      sendResponse(res, 500, `Invalid parameters received.${error}`)
      return
    }

    // Check if user has access to the project
    const project = await checkProjectAccess(json.projectId, meteorUser._id, res)
    if (!project) {
      return
    }

    const taskId = await Tasks.insertAsync({
      projectId: json.projectId,
      name: json.name,
      start: new Date(json.start),
      end: new Date(json.end),
      estimatedHours: json.estimatedHours,
      dependencies: json.dependencies,
      ...json.customfields,
    })

    const payload = { taskId }
    sendResponse(res, 200, 'Task created.', payload)
    return
  }
  sendResponse(res, 500, 'Missing mandatory parameters.')
})

/**
 * @api {get} /project/tasks/:projectId Get all tasks for a project
 * @apiName getProjectTasks
 * @apiDescription List all tasks for the specified project
 * @apiGroup Task
 *
 * @apiHeader {String} Token The authorization header Bearer API token.
 * @apiParam {String} projectId The ID of the project to list tasks for.
 * @apiSuccess {json} response An array of tasks for the specified project.
 * @apiUse AuthError
 */
WebApp.handlers.use('/project/tasks/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const projectId = url[3]

  // Check if user has access to the project
  const project = await checkProjectAccess(projectId, meteorUser._id, res)
  if (!project) {
    return
  }

  const payload = await Tasks.find({ projectId }).fetchAsync()
  sendResponse(res, 200, 'Returning tasks for project', payload)
})

/**
 * @api {get} /project/task/stats/:projectId Get task statistics for a project
 * @apiName getProjectTaskStats
 * @apiDescription Get planned vs actual hours statistics for all tasks in a project
 * @apiGroup Task
 *
 * @apiHeader {String} Token The authorization header Bearer API token.
 * @apiParam {String} projectId The ID of the project to get task statistics for.
 * @apiSuccess {json} response Task statistics with planned vs actual hours.
 * @apiUse AuthError
 */
WebApp.handlers.use('/project/task/stats/', async (req, res) => {
  const meteorUser = await checkAuthorization(req, res)
  if (!meteorUser) {
    return
  }
  const { pathname } = req._parsedUrl
  const url = pathname.split('/')
  const projectId = url[4]

  // Check if user has access to the project
  const project = await checkProjectAccess(projectId, meteorUser._id, res)
  if (!project) {
    return
  }

  const tasks = await Tasks.find({ projectId }).fetchAsync()

  // Get actual hours from timecards for each task
  const taskStats = await Promise.all(tasks.map(async (task) => {
    const actualHours = await Timecards.rawCollection().aggregate([
      { $match: { projectId, task: task.name } },
      { $group: { _id: null, totalHours: { $sum: '$hours' } } },
    ]).toArray()

    return {
      taskId: task._id,
      taskName: task.name,
      estimatedHours: task.estimatedHours || 0,
      actualHours: actualHours[0]?.totalHours || 0,
      variance: (actualHours[0]?.totalHours || 0) - (task.estimatedHours || 0),
      start: task.start,
      end: task.end,
    }
  }))

  const payload = {
    projectId,
    totalEstimatedHours: taskStats.reduce((sum, task) => sum + task.estimatedHours, 0),
    totalActualHours: taskStats.reduce((sum, task) => sum + task.actualHours, 0),
    tasks: taskStats,
  }

  sendResponse(res, 200, 'Returning task statistics for project', payload)
})

/**
 * @api {post} /user/action-verification/webhook User Action Verification Webhook
 * @apiName userActionVerificationWebhook
 * @apiDescription Webhook endpoint for external services to manage user verification status
 * @apiGroup UserVerification
 *
 * @apiBody {Object} Any webhook payload - processing depends on configured webhook verification interface
 * @apiParamExample {json} Stripe-Example:
 *                  {
 *                    "type": "checkout.session.completed",
 *                    "data": {
 *                      "object": {
 *                        "client_reference_id": "abc123def456"
 *                      }
 *                    }
 *                  }
 * @apiSuccess {json} response Confirmation of webhook processing.
 * @apiSuccessExample {json} Success response:
 * {
 *  message: "Webhook processed successfully."
 *  }
 * @apiError (400) InvalidJSON Invalid JSON received.
 * @apiError (403) DomainNotAllowed Sender domain not whitelisted.
 * @apiError (404) NoActiveInterface No active webhook verification interface found.
 * @apiError (500) ProcessingError Error processing webhook data.
 */
WebApp.handlers.use('/user/action-verification/webhook/', async (req, res) => {
  let json
  try {
    json = await getJson(req)
  } catch (e) {
    sendResponse(res, 400, `Invalid JSON received. ${e}`)
    return
  }

  if (json) {
    // Get sender domain/IP from request headers for validation
    let senderDomain = req.headers['x-forwarded-for']
                      || req.headers['x-real-ip']
                      || req.connection.remoteAddress
                      || req.socket.remoteAddress
                      || (req.connection.socket ? req.connection.socket.remoteAddress : null)
                      || 'unknown'

    // If we have a reverse DNS lookup result or explicit domain header, use that
    if (req.headers['x-forwarded-host']) {
      senderDomain = req.headers['x-forwarded-host']
    } else if (req.headers.host) {
      senderDomain = req.headers.host
    }
    senderDomain = normalizeDomain(senderDomain)
    try {
      // Import required modules
      const WebhookVerification = (await import('../imports/api/webhookverification/webhookverification.js')).default
      const { processWebhookVerification } = await import('../imports/api/webhookverification/server/methods.js')
      const { getGlobalSettingAsync } = await import('../imports/utils/server_method_helpers.js')

      // Check if user action verification is enabled
      const verificationEnabled = await getGlobalSettingAsync('enableUserActionVerification')
      if (!verificationEnabled) {
        sendResponse(res, 404, 'User action verification is not enabled.')
        return
      }

      // Find active webhook verification interface
      const activeInterface = await WebhookVerification.findOneAsync({ active: true })
      if (!activeInterface) {
        sendResponse(res, 404, 'No active webhook verification interface found.')
        return
      }

      // Check if sender domain/IP is allowed (support both domains and IP addresses)
      const allowedDomains = activeInterface.allowedDomains.split(',').map((d) => d.trim())
      const isAllowed = allowedDomains.some((allowed) => {
        // Exact match for domains or IPs
        if (senderDomain === allowed) return true
        // Support localhost variations for development
        if (allowed === 'localhost' && (senderDomain.includes('localhost') || senderDomain.includes('127.0.0.1'))) return true
        // Support wildcard matching for subdomains (*.example.com matches both subdomain.example.com and example.com)
        if (allowed.startsWith('*.')) {
          const domain = allowed.substring(2) // Remove *.
          return senderDomain === domain || senderDomain.endsWith(`.${domain}`)
        }
        return false
      })

      if (!isAllowed) {
        sendResponse(res, 403, `Sender ${senderDomain} not whitelisted for webhook verification.`)
        return
      }

      // Process webhook using custom code
      const result = await Meteor.callAsync('webhookverification.process', {
        _id: activeInterface._id,
        webhookData: json,
        senderDomain,
      })

      if (!result || !result.action || !result.userId) {
        sendResponse(res, 200, 'Webhook received but no action required.')
        return
      }

      // Find user
      const user = await Meteor.users.findOneAsync({
        _id: result.userId,
        'actionVerification.required': true,
      })

      if (!user) {
        sendResponse(res, 404, 'User not found or verification not required.')
        return
      }

      if (result.action === 'complete') {
        // Mark verification as completed
        await Meteor.users.updateAsync({ _id: result.userId }, {
          $set: {
            'actionVerification.completed': true,
            'actionVerification.completedAt': new Date(),
          },
        })
        sendResponse(res, 200, 'User action verification completed successfully.')
      } else if (result.action === 'revoke') {
        // Get verification period from the webhook interface and calculate new deadline
        const verificationPeriod = activeInterface.verificationPeriod || 30
        const newDeadline = new Date()
        newDeadline.setDate(newDeadline.getDate() + verificationPeriod)

        // Revoke verification
        await Meteor.users.updateAsync({ _id: result.userId }, {
          $set: {
            'actionVerification.completed': false,
            'actionVerification.deadline': newDeadline,
          },
          $unset: {
            'actionVerification.completedAt': '',
          },
        })
        sendResponse(res, 200, 'User action verification revoked successfully.')
      } else {
        sendResponse(res, 400, 'Invalid action specified. Must be "complete" or "revoke".')
      }
    } catch (error) {
      console.error('Webhook processing error:', error)
      sendResponse(res, 500, `Error processing webhook: ${error.message}`)
    }
  } else {
    sendResponse(res, 400, 'Missing webhook payload.')
  }
})
