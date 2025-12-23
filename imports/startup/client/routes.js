import $ from 'jquery'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { AccountsAnonymous } from 'meteor/faburem:accounts-anonymous'
import '../../ui/layouts/appLayout.js'
import '../../ui/pages/signIn.js'
import '../../ui/pages/register.js'
import '../../ui/pages/changePassword.js'
import '../../ui/pages/404.html'
import { getGlobalSetting } from '../../utils/frontend_helpers.js'

if (!Meteor.settings.public.sandstorm) {
  FlowRouter.triggers.enter([(context, redirect) => {
    if (!Meteor.loggingIn() && !Meteor.user()) {
      redirect('/signIn')
    }
  }], { except: ['dashboard', 'signIn', 'changePassword', 'register', 'reset-password', 'try'] })
  FlowRouter.triggers.exit([() => {
    $("[data-bs-toggle='popover']").length > 0 ? $("[data-bs-toggle='popover']").popover('hide') : null
    $("[data-bs-toggle='tooltip']").length > 0 ? $("[data-bs-toggle='tooltip']").tooltip('hide') : null
    $('.tooltip').length > 0 ? $('.tooltip').remove() : null
    $('.popover').length > 0 ? $('.popover').remove() : null
  }], { except: ['claimAdmin'] })
}
// FlowRouter.decodeQueryParamsOnce = true;

FlowRouter.route('*', {
  action() {
    this.render('appLayout', '404');
  }
})
FlowRouter.route('/', {
  waitOn() {
    return import('../../ui/pages/overview/projectlist.js')
  },
  action() {
    document.title = 'titra - overview'
    this.render('appLayout', 'projectlist')
  },
  name: 'projectlist',
})
FlowRouter.route('/tracktime/:projectId?', {
  waitOn() {
    return import('../../ui/pages/track/tracktime.js')
  },
  action() {
    document.title = 'titra - track time'
    this.render('appLayout', 'tracktimemain')
  },
  name: 'tracktime',
})
FlowRouter.route('/edit/timecard/:tcid', {
  waitOn() {
    return import('../../ui/pages/track/tracktime.js')
  },
  action() {
    document.title = 'titra - edit time'
    this.render('appLayout', 'tracktime')
  },
  name: 'edittime',
})
FlowRouter.route('/list/projects', {
  waitOn() {
    return import('../../ui/pages/overview/projectlist.js')
  },
  action() {
    document.title = 'titra - overview'
    this.render('appLayout', 'projectlist')
  },
  name: 'projectlist',
})
FlowRouter.route('/edit/project/:id', {
  waitOn() {
    return import('../../ui/pages/overview/editproject/editproject.js')
  },
  action() {
    document.title = 'titra - edit project'
    this.render('appLayout', 'editproject')
  },
  name: 'editproject',
})
FlowRouter.route('/create/project/', {
  waitOn() {
    return import('../../ui/pages/overview/editproject/editproject.js')
  },
  action() {
    document.title = 'titra - create project'
    this.render('appLayout', 'editproject')
  },
  name: 'createProject',
})
FlowRouter.route('/list/timecards/:projectId', {
  waitOn() {
    return [import('../../ui/pages/details/details.js'), import('../../ui/pages/track/tracktime.js')]
  },
  action() {
    document.title = 'titra - details'
    this.render('appLayout', 'timecardlist')
  },
  name: 'timecards',
})
FlowRouter.route('/settings', {
  waitOn() {
    return import('../../ui/pages/settings.js')
  },
  action() {
    document.title = 'titra - settings'
    this.render('appLayout', 'settings')
  },
  name: 'settings',
})
FlowRouter.route('/profile', {
  waitOn() {
    return import('../../ui/pages/profile.js')
  },
  action() {
    document.title = 'titra - profile'
    this.render('appLayout', 'profile')
  },
  name: 'profile',
})
FlowRouter.route('/about', {
  waitOn() {
    return import('../../ui/pages/about.js')
  },
  action() {
    document.title = 'titra - about'
    this.render('appLayout', 'about')
  },
  name: 'about',
})
FlowRouter.route('/admin', {
  waitOn() {
    return import('../../ui/pages/administration/administration.js')
  },
  action() {
    document.title = 'titra - administration'
    this.render('appLayout', 'administration')
  },
  name: 'administration',
})
FlowRouter.route('/dashboard/:_id', {
  waitOn() {
    return import('../../ui/pages/details/dashboard.js')
  },
  action() {
    document.title = 'titra - dashboard'
    this.render('appLayout', 'dashboard')
  },
  name: 'dashboard',
})
FlowRouter.route('/join', {
  action() {
    this.render('appLayout', 'register')
  },
  name: 'register',
})
FlowRouter.route('/signIn', {
  action() {
    this.render('appLayout', 'signIn')
  },
  name: 'signIn',
})
FlowRouter.route('/changePwd/:token?', {
  action() {
    this.render('appLayout', 'changePassword')
  },
  name: 'changePassword',
})
FlowRouter.route('/try', {
  waitOn() {
    return Meteor.subscribe('globalsettings')
  },
  action() {
    if (Meteor.userId()) {
      FlowRouter.go('/')
    } else if (getGlobalSetting('enableAnonymousLogins')) {
      AccountsAnonymous.login((error) => {
        console.log(error)
        if (!error) {
          FlowRouter.go('/')
        } else {
          console.error(error)
        }
      })
    } else {
      this.render('appLayout', '404')
    }
  },
  name: 'try',
})
FlowRouter.route('/claim/admin', {
  action() {
    if (Meteor.userId()) {
      Meteor.call('claimAdmin', (error, result) => {
        if (error) {
          console.error(error)
          alert(error.error)
        } else {
          alert(result)
        }
        FlowRouter.go('administration')
      })
    }
  },
  name: 'claimAdmin',
})

FlowRouter.route('/404', {
  action() {
    this.render('appLayout', '404')
  },
  name: '404',
})
