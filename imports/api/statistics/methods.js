import { ValidatedMethod } from 'meteor/mdg:validated-method'
import { MongoInternals } from 'meteor/mongo'
import os from 'os'
import { authenticationMixin } from '../../utils/server_method_helpers.js'

/**
 * Retrieves statistics related to the host running the titra application.
 * @returns {Object} The statistics object containing information about the host running the titra application.
 */
const getStatistics = new ValidatedMethod({
  name: 'getStatistics',
  validate: null,
  mixins: [authenticationMixin],
  async run() {
    // this is completely based on WeKans implementation
    // https://github.com/wekan/wekan/blob/master/server/statistics.js
    const pjson = require('../../../package.json')
    const statistics = {}
    const { isAdmin } = await Meteor.userAsync()
    statistics.version = pjson.version
    if (isAdmin) {
      statistics.os = {
        type: os.type(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus(),
      }
    } else {
      statistics.os = {
        type: os.type(),
        arch: os.arch(),
      }
    }
    if (isAdmin) {
      let nodeVersion = process.version
      nodeVersion = nodeVersion.replace('v', '')
      statistics.process = {
        nodeVersion,
        pid: process.pid,
        uptime: process.uptime(),
      }
      // Remove beginning of Meteor release text METEOR@
      let meteorVersion = Meteor.release
      meteorVersion = meteorVersion.replace('METEOR@', '')
      statistics.meteor = {
        meteorVersion,
      }
      // Thanks to RocketChat for MongoDB version detection !
      // https://github.com/RocketChat/Rocket.Chat/blob/develop/app/utils/server/functions/getMongoInfo.js
      let mongoVersion
      let mongoStorageEngine
      let mongoOplogEnabled
      try {
        const { mongo } = MongoInternals.defaultRemoteCollectionDriver()
        const oplogEnabled = Boolean(
          mongo._oplogHandle && mongo._oplogHandle.onOplogEntry,
        )
        const { version, storageEngine } = await mongo.db.command({ serverStatus: 1 })
        mongoVersion = version
        mongoStorageEngine = storageEngine.name
        mongoOplogEnabled = oplogEnabled
      } catch (e) {
        try {
          const { mongo } = MongoInternals.defaultRemoteCollectionDriver()
          const { version } = await mongo.db.command({ buildinfo: 1 })
          mongoVersion = version
          mongoStorageEngine = 'unknown'
        } catch (error) {
          mongoVersion = 'unknown'
          mongoStorageEngine = 'unknown'
        }
      }
      statistics.mongo = {
        mongoVersion,
        mongoStorageEngine,
        mongoOplogEnabled,
      }
    }
    return statistics
  },
})

export { getStatistics }
