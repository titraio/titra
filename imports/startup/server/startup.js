import { AccountsAnonymous } from 'meteor/faburem:accounts-anonymous'
import { BrowserPolicy } from 'meteor/browser-policy-content'
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter'
import { ServiceConfiguration } from 'meteor/service-configuration'
import { defaultSettings, Globalsettings } from '../../api/globalsettings/globalsettings.js'
import { getGlobalSettingAsync } from '../../utils/server_method_helpers.js'

Meteor.startup(async () => {
  AccountsAnonymous.init()
  for await (const setting of defaultSettings) {
    if (!await Globalsettings.findOneAsync({ name: setting.name })) {
      await Globalsettings.insertAsync(setting)
    }
  }
  if (Meteor.settings.disablePublic) {
    // eslint-disable-next-line i18next/no-literal-string
    await Globalsettings.updateAsync({ name: 'disablePublicProjects' }, { $set: { value: Meteor.settings.disablePublic === 'true' } })
  }
  if (Meteor.settings.enableAnonymousLogins) {
    // eslint-disable-next-line i18next/no-literal-string
    await Globalsettings.updateAsync({ name: 'enableAnonymousLogins' }, { $set: { value: Meteor.settings.disablePublic === 'true' } })
  }
  if (await getGlobalSettingAsync('enableOpenIDConnect')) {
    import('../../utils/oidc/oidc_server').then((Oidc) => {
      if(Accounts.oauth.serviceNames().indexOf('oidc') === -1) {
        Oidc.registerOidc()
      }
    })
  }
  if (await getGlobalSettingAsync('google_clientid') && await getGlobalSettingAsync('google_secret')) {
    await ServiceConfiguration.configurations.upsertAsync({
      service: 'googleapi',
    }, {
      $set: {
        clientId: await getGlobalSettingAsync('google_clientid'),
        secret: await getGlobalSettingAsync('google_secret'),
      },
    })
    import('../../utils/google/google_server.js').then((registerGoogleAPI) => {
      registerGoogleAPI.default()
    })
  }
  if (await getGlobalSettingAsync('XFrameOptionsOrigin')) {
    BrowserPolicy.content.allowFrameAncestorsOrigin(await getGlobalSettingAsync('XFrameOptionsOrigin'))
  }
  if (process.env.NODE_ENV !== 'development') {
    // eslint-disable-next-line no-console
    console.log(`titra started on port ${process.env.PORT}`)
  }

  // Rate limiting all methods and subscriptions, defaulting to 100 calls per second
  for (const subscription in Meteor.server.publish_handlers) {
    if ({}.hasOwnProperty.call(Meteor.server.publish_handlers, subscription)) {
      DDPRateLimiter.addRule({
        type: 'subscription',
        name: subscription,
      }, 100, 1000)
    }
  }
  for (const method in Meteor.server.method_handlers) {
    if ({}.hasOwnProperty.call(Meteor.server.method_handlers, method)) {
      DDPRateLimiter.addRule({
        type: 'method',
        name: method,
      }, 100, 1000)
    }
  }
})
