import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { Dashboards } from '../dashboards.js'
import Timecards from '../../timecards/timecards'
import { periodToDates } from '../../../utils/periodHelpers.js'
import { checkAdminAuthentication } from '../../../utils/server_method_helpers.js'
import bcrypt from 'bcrypt';

const saltRounds = 10;

/**
 * Publishes all dashboards (dashboard details only)
 * No timecards included.
 */
Meteor.publish('allDashboardsDetails', async function allDashboardsDetails() {
  await checkAdminAuthentication(this)
  return Dashboards.find({})
})

/**
 * Publishes the dashboard matching the provided ID with timecards.
 * Supports 'all' startDate/endDate (overrides with calculated dates).
 * @param {string} _id - The ID of the dashboard to publish.
 * @param {string} password - The password of the dashboard to publish, empty if no password is set on dashboard
 * @returns {Mongo.Cursor} The timecards for the dashboard.
 */
Meteor.publish('dashboardTimecardsById', async function dashboardTimecardsById(_id,password) {
  check(_id, String);
  check(password, Match.Optional(String));
  // Import dayjs extensions
  dayjs.extend(utc);
  dayjs.extend(customParseFormat);
  let access_granted;
  let startDate, endDate;

  const dashboard = await Dashboards.findOneAsync({ _id });
  if (!dashboard) return this.ready();
  if (!dashboard.password){
    access_granted = true;
  } else {
    access_granted = bcrypt.compareSync(password, dashboard.password);
  }

  if (!access_granted){
    throw new Meteor.Error('Wrong password', 'inserted password is not correct');
  } else {
    const now = dayjs(); // Current date/time

    // Map the dashboard period to actual dates
    switch (dashboard.timePeriod) {

      case 'custom':
        // Use the custom dates stored in the dashboard
        startDate = dashboard.startDate ? new Date(dashboard.startDate) : now.startOf('month').toDate();
        endDate = dashboard.endDate ? new Date(dashboard.endDate) : now.endOf('month').toDate();
        break;

      case 'all':
        // No date filter for 'all' - return all timecards
        const selector = dashboard.projectId !== 'all'
        ? { projectId: dashboard.projectId }
          : {};
        return Timecards.find(selector, { sort: { date: 1 } });

      default:
        const dates = await periodToDates(dashboard.timePeriod);
        startDate = dates.startDate
        endDate = dates.endDate
    }

    // Build the selector
    const selector = {
      date: { $gte: startDate, $lte: endDate }
    };

    // Add project filter if not 'all'
    if (dashboard.projectId && dashboard.projectId !== 'all') {
      selector.projectId = dashboard.projectId;
    }


    return Timecards.find(selector, { sort: { date: 1 } });
  }

});

/**
 * Publishes only the dashboard details (no timecards)
 * @param {string} _id - The ID or slug of the dashboard
 * @returns {Mongo.Cursor} The dashboard document
 */
Meteor.publish('dashboardPublicMeta', async function(_id) {
  check(_id, String);

  const dashboard = await Dashboards.findOneAsync({
    $or: [{ _id }, { slug: _id }]
  });

  if (dashboard) {
    this.added('dashboards', dashboard._id, {
      slug: dashboard.slug,
      hasPassword: !!dashboard.password,
      exists: true
    });
  } else {
    // Publish a placeholder document
    this.added('dashboards', _id, {
      exists: false,
      hasPassword: false
    });
  }

  this.ready();
});

Meteor.publish('dashboardDetailsById', async function(_id,password) {
  check(_id, String);
  check(password, Match.Optional(String));
  const dashboard = await Dashboards.findOneAsync({ _id });
  if (!dashboard.password) {
    return Dashboards.find({_id });
  } else {
    const ok = bcrypt.compareSync(password, dashboard.password);
    if (ok){
      return Dashboards.find({_id });
    } else {
      throw new Meteor.Error('Wrong password', 'inserted password is not correct');
    }
  }
});
