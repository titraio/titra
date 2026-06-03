import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { validateEmail, getGlobalSetting } from '../../utils/frontend_helpers'
import { isOidcConfigured, disableDefaultLoginForm, isAutoLoginEnabled } from '../../utils/oidc/oidc_helper'
import { oidcReady } from '../../utils/oidc/oidc_client'
import { t } from '../../utils/i18n.js'
import { debugLog } from '../../utils/debugLog'
import './signIn.html'

function handleLoginResult(error, templateInstance) {
  debugLog('[OIDC] handleLoginResult called', { error, templateInstance })
  if (error) {
    if (error.error === 403 || error.error === 400) {
      templateInstance.$('.notification').text(t(`login.${error.error}`))
    } else {
      templateInstance.$('.notification').text(error.message)
    }
    document.querySelector('.notification').classList.remove('d-none')
  } else {
    debugLog('[OIDC] Redirecting to projectlist')
    FlowRouter.go('/')
  }
}

function signInOidc(event, templateInstance) {
  event.preventDefault()
  debugLog('[OIDC] signInOidc called')
  Meteor.loginWithOidc((error) => {
    debugLog('[OIDC] OIDC callback invoked', { error })
    handleLoginResult(error, templateInstance)
  })
}

function signIn(event, templateInstance) {
  event.preventDefault()
  if (!templateInstance.$('#at-field-email').val() || !validateEmail(templateInstance.$('#at-field-email').val())) {
    templateInstance.$('#at-field-email').addClass('is-invalid')
    return
  }
  if (!templateInstance.$('#at-field-password').val()) {
    templateInstance.$('#at-field-password').addClass('is-invalid')
    return
  }

  let loginMethod
  if (Meteor.loginWithLDAP) {
    loginMethod = Meteor.loginWithLDAP
  } else {
    loginMethod = Meteor.loginWithPassword
  }

  loginMethod(templateInstance.$('#at-field-email').val(), templateInstance.$('#at-field-password').val(), (error) => {
    templateInstance.$('#at-field-email').removeClass('is-invalid')
    templateInstance.$('#at-field-password').removeClass('is-invalid')
    handleLoginResult(error, templateInstance)
  })
}

Template.signIn.helpers({
  isOidcConfigured: () => isOidcConfigured(),
  disableUserRegistration: () => getGlobalSetting('disableUserRegistration') || disableDefaultLoginForm(),
  disableDefaultLoginForm:() => disableDefaultLoginForm(),
})

Template.signIn.events({
  'click #oidc': signInOidc,
  'click #signIn': signIn,
  'keypress #at-field-password': (event, templateInstance) => {
    if (event.keyCode === 13) {
      signIn(event, templateInstance)
    }
  },
  'click #at-forgotPwd': (event, templateInstance) => {
    event.preventDefault()
    if (templateInstance.$('#at-field-email').val() && validateEmail(templateInstance.$('#at-field-email').val())) {
      Accounts.forgotPassword({ email: templateInstance.$('#at-field-email').val() }, (error) => {
        templateInstance.$('.notification').text(t('login.reset_password_mail'))
        document.querySelector('.notification').classList.remove('d-none')
        templateInstance.$('#at-field-email').removeClass('is-invalid')
        templateInstance.$('#at-field-password').removeClass('is-invalid')
      })
    } else {
      templateInstance.$('#at-field-email').addClass('is-invalid')
    }
  },
  'click .js-register': (event, templateInstance) => {
    event.preventDefault()
    FlowRouter.go('register', {}, { email: templateInstance.$('#at-field-email').val() })
  },
})

Template.signIn.onRendered(function signInRendered() {
  const templateInstance = this
  this.autorun(() => {
    if (oidcReady.get() && isAutoLoginEnabled() && !Meteor.loggingIn() && !Meteor.user()) {
      debugLog('[OIDC] Auto OIDC login triggered')
      Meteor.loginWithOidc((error) => {
        debugLog('[OIDC] OIDC callback invoked (auto login)', { error })
        handleLoginResult(error, templateInstance)
      })
    }
  })
})
