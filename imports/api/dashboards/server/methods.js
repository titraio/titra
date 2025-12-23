import { ValidatedMethod } from 'meteor/mdg:validated-method'
import { Dashboards } from '../dashboards'
import { sanitizeSlug } from '../../../utils/sanitizer'
import { authenticationMixin, transactionLogMixin, getGlobalSettingAsync } from '../../../utils/server_method_helpers.js'
import bcrypt from 'bcrypt';

// dashboard passwords salt rounds
const saltRounds = 10;
// Remove existing index first

// Create index with partialFilterExpression only (no sparse)
Dashboards.rawCollection().createIndex(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $exists: true, $gt: "" } }
  }
);

/**
 * Adds a dashboard.
 *
 * @param {Object} args - The arguments to use when adding the dashboard.
 * @param {string} args.projectId - The ID of the project to associate with the dashboard.
 * @param {string} args.timePeriod - The time period to associate with the dashboard.
 * @param {string} [args.startDate] - The custom start date (required only when timePeriod is "custom").
 * @param {string} [args.endDate] - The custom end date (required only when timePeriod is "custom").
 * @param {string} [args.password] - An optional password used to protect the dashboard. If provided, it will be hashed.
 * @param {string} [args.slug] - An optional custom slug to use in the dashboard URL. Must be unique if provided.
 *
 * @return {Promise<string>} - A promise that resolves to the ID of the added dashboard.
 */

const addDashboard = new ValidatedMethod({
  name: 'addDashboard',
  validate(args) {
    check(args, {
      projectId: String,
      timePeriod: String,
      startDate: Match.Optional(String),
      endDate: Match.Optional(String),
      password: Match.Optional(String),
      slug: Match.Optional(String),
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    projectId, timePeriod, startDate, endDate, password, slug
  }) {
    let inserted_slug
    if (slug) {
      const sanitizedSlug = sanitizeSlug(slug)
      const existing = await Dashboards.findOneAsync({ slug:sanitizedSlug });
      if (existing) {
        throw new Meteor.Error('slug-exists', 'This URL is already taken.');
      } else {
        inserted_slug = sanitizedSlug
      }
    } else {
      inserted_slug = null
    }
    const meteorUser = await Meteor.users.findOneAsync({ _id: this.userId })
    let timeunit = await getGlobalSettingAsync('timeunit')
    let hoursToDays = await getGlobalSettingAsync('hoursToDays')
    if (meteorUser.profile.timeunit) {
      timeunit = meteorUser.profile.timeunit
    }
    if (meteorUser.profile.hoursToDays) {
      hoursToDays = meteorUser.profile.hoursToDays
    }
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, saltRounds);
    }
    const _id = Random.id()
    await Dashboards.insertAsync({
      _id, projectId, timePeriod, startDate, endDate, timeunit, hoursToDays, password:hashedPassword, slug:inserted_slug
    })
    return _id
  },
})

/**
 * Updates an existing dashboard.
 *
 * @param {Object} args - The arguments used to update the dashboard.
 * @param {string} args.dashboardId - The ID of the dashboard to update.
 * @param {string} [args.timePeriod] - The updated time period (e.g., "this_week", "last_month", "custom").
 * @param {string} [args.startDate] - The updated custom start date (required only when timePeriod is "custom").
 * @param {string} [args.endDate] - The updated custom end date (required only when timePeriod is "custom").
 * @param {string} [args.slug] - The updated slug to use for the dashboard URL.
 * @param {string} [args.password] - The updated password for protected dashboards. If provided, it will be hashed.
 *
 * @return {Promise<number>} - A promise that resolves to the number of documents modified.
 */
const updateDashboard = new ValidatedMethod({
  name: 'updateDashboard',
  validate(args) {
    check(args, {
      dashboardId: String,
      timePeriod: Match.Optional(String),
      startDate: Match.Optional(String),
      endDate: Match.Optional(String),
      slug: Match.Optional(String),
      password: Match.Optional(String)
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    dashboardId, timePeriod, startDate, endDate, slug, password
  }) {
    const update = {}
    const sanitizedSlug = sanitizeSlug(slug)

    if (slug) {
      const existing = await Dashboards.findOneAsync({ slug:sanitizedSlug });
      if (existing._id != dashboardId) {
        throw new Meteor.Error('slug-exists', 'This URL is already taken.');
      }
    }

    if (timePeriod !== undefined) update.timePeriod = timePeriod
    if (startDate !== undefined) update.startDate = startDate
    if (endDate !== undefined) update.endDate = endDate
    if (slug !== undefined) update.slug = sanitizedSlug

    // Hash password if provided
    if (password) {
      update.password = await bcrypt.hash(password, saltRounds)
    }
    return Dashboards.updateAsync(
      { _id: dashboardId },
      { $set: update }
    )
  }
})


/**
 * Removes a dashboard.
 *
 * @param {Object} args
 * @param {string} args.dashboardId - The ID of the dashboard to remove.
 *
 * @return {Number} - Number of documents removed.
 */
const removeDashboard = new ValidatedMethod({
  name: 'removeDashboard',
  validate(args) {
    check(args, {
      dashboardId: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    dashboardId
  }) {

    const removedCount = await Dashboards.removeAsync(dashboardId);
    return removedCount; // usually 1 or 0
  },
})

/**
 * Checks a dashboard slug.
 *
 * @param {Object} args
 * @param {string} args.slug - The ID of the dashboard to remove.
 *
 * @return {Boolean} - True if it's availabe else false.
 */
const checkDashboardSlug = new ValidatedMethod({
  name: 'checkDashboardSlug',
  validate(args) {
    check(args, {
      slug: String,
    })
  },
  mixins: [authenticationMixin, transactionLogMixin],
  async run({
    slug
  }) {
    const sanitizedSlug = sanitizeSlug(slug)
    const match = await Dashboards.findOneAsync({slug:sanitizedSlug});
    return match ? false : true
  },
})


export { addDashboard, updateDashboard, removeDashboard, checkDashboardSlug }
