import { Accounts } from 'meteor/accounts-base'
import { SHA256 } from 'meteor/sha'
import util from 'util'
import { getGlobalSettingAsync } from './server_method_helpers'
import { debugLog } from './debugLog'

class LDAP {
  constructor() {
    this.LdapClient = null // Will be imported dynamically
    this.connected = false
    this.options = {
      host: this.constructor.getSettings('LDAP_HOST'),
      port: this.constructor.getSettings('LDAP_PORT'),
      Reconnect: this.constructor.getSettings('LDAP_RECONNECT'),
      timeout: this.constructor.getSettings('LDAP_TIMEOUT') || 10000,
      connect_timeout: this.constructor.getSettings('LDAP_CONNECT_TIMEOUT') || 10000,
      idle_timeout: this.constructor.getSettings('LDAP_IDLE_TIMEOUT'),
      encryption: this.constructor.getSettings('LDAP_ENCRYPTION'),
      ca_cert: this.constructor.getSettings('LDAP_CA_CERT'),
      reject_unauthorized: this.constructor.getSettings('LDAP_REJECT_UNAUTHORIZED') !== undefined ? this.constructor.getSettings('LDAP_REJECT_UNAUTHORIZED') : true,
      Authentication_UserDN: this.constructor.getSettings('LDAP_AUTHENTICATION_USERDN') || this.constructor.getSettings('LDAP_BASEDN'),
      Authentication_Password: this.constructor.getSettings('LDAP_AUTHENTICATION_PASSWORD'),
      Authentication_Fallback: this.constructor.getSettings('LDAP_LOGIN_FALLBACK'),
      BaseDN: this.constructor.getSettings('LDAP_BASEDN'),
      User_Authentication: this.constructor.getSettings('LDAP_USER_AUTHENTICATION') || this.constructor.getSettings('LDAP_USERNAME_FIELD') || 'uid',
      User_Authentication_Field: this.constructor.getSettings('LDAP_USER_AUTHENTICATION_FIELD') || 'uid',
      User_Attributes: this.constructor.getSettings('LDAP_USER_ATTRIBUTES'),
      User_Search_Filter: this.constructor.getSettings('LDAP_USER_SEARCH_FILTER'),
      User_Search_Scope: this.constructor.getSettings('LDAP_USER_SEARCH_SCOPE'),
      User_Search_Field: this.constructor.getSettings('LDAP_USER_SEARCH_FIELD') || this.constructor.getSettings('LDAP_USERNAME_FIELD') || 'uid',
      Search_Page_Size: this.constructor.getSettings('LDAP_SEARCH_PAGE_SIZE'),
      Search_Size_Limit: this.constructor.getSettings('LDAP_SEARCH_SIZE_LIMIT'),
      group_filter_enabled: this.constructor.getSettings('LDAP_GROUP_FILTER_ENABLE'),
      group_filter_object_class: this.constructor.getSettings('LDAP_GROUP_FILTER_OBJECTCLASS'),
      group_filter_group_id_attribute: this.constructor.getSettings('LDAP_GROUP_FILTER_GROUP_ID_ATTRIBUTE'),
      group_filter_group_member_attribute: this.constructor.getSettings('LDAP_GROUP_FILTER_GROUP_MEMBER_ATTRIBUTE'),
      group_filter_group_member_format: this.constructor.getSettings('LDAP_GROUP_FILTER_GROUP_MEMBER_FORMAT'),
      group_filter_group_name: this.constructor.getSettings('LDAP_GROUP_FILTER_GROUP_NAME'),
      UsernameField: LDAP.getSettings('LDAP_USERNAME_FIELD') || 'uid',
    }
  }

  static getSettings(name, ...args) {
    let value = process.env[name]
    if (value !== undefined) {
      if (value === 'true' || value === 'false') {
        value = JSON.parse(value)
      } else if (value !== '' && !isNaN(value)) {
        value = Number(value)
      }
      return value
    }
    debugLog(`Lookup for unset variable: ${name}`)
    return undefined
  }

  // connectSync(...args) {
  //   if (!this._connectSync) {
  //     this._connectSync = Meteor.wrapAsync(this.connectAsync, this)
  //   }
  //   return this._connectSync(...args)
  // }

  // searchAllSync(...args) {
  //   if (!this._searchAllSync) {
  //     this._searchAllSync = await this.searchAllAsync
  //   }
  //   return this._searchAllSync(...args)
  // }

  async connectAsync() {
    debugLog('Init setup')

    // Import the new client dynamically
    if (!this.LdapClient) {
      const { default: LdapClient } = await import('ldapjs-client')
      this.LdapClient = LdapClient
    }

    const connectionOptions = {
      url: `${this.options.host}:${this.options.port}`,
      timeout: this.options.timeout,
      connectTimeout: this.options.connect_timeout,
      idleTimeout: this.options.idle_timeout,
      reconnect: this.options.Reconnect,
    }

    const tlsOptions = {
      rejectUnauthorized: this.options.reject_unauthorized,
    }

    if (this.options.ca_cert && this.options.ca_cert !== '') {
      // Split CA cert into array of strings
      const chainLines = this.constructor.getSettings('LDAP_CA_CERT').replace(/\\n/g, '\n').split('\n')
      let cert = []
      const ca = []
      chainLines.forEach((line) => {
        cert.push(line)
        if (line.match(/-END CERTIFICATE-/)) {
          ca.push(cert?.join('\n'))
          cert = []
        }
      })
      tlsOptions.ca = ca
    }

    if (this.options.encryption === 'ssl') {
      connectionOptions.url = `ldaps://${connectionOptions.url}`
      connectionOptions.tlsOptions = tlsOptions
    } else {
      connectionOptions.url = `ldap://${connectionOptions.url}`
    }

    debugLog('Connecting', connectionOptions.url)
    debugLog(`connectionOptions${util.inspect(connectionOptions)}`)

    // Create client using new library - no createClient method, use constructor directly
    this.client = new this.LdapClient(connectionOptions)

    // The new library's bind method returns a Promise, so we simplify bindAsync
    this.bindAsync = async (dn, password) => {
      await this.client.bind(dn, password)
      return true
    }

    try {
      // The new library auto-connects when needed, no explicit connect required
      // Just test the connection by attempting to bind if we have credentials
      this.connected = true
      debugLog('LDAP client initialized')
      return true
    } catch (error) {
      debugLog('LDAP connection error', error)
      throw error
    }
  }

  getUserFilter(username) {
    const filter = []

    if (this.options.User_Search_Filter !== '' && this.options.User_Search_Filter !== undefined) {
      if (this.options.User_Search_Filter[0] === '(') {
        filter.push(`${this.options.User_Search_Filter}`)
      } else {
        filter.push(`(${this.options.User_Search_Filter})`)
      }
    }
    const usernameFilter = this.options.User_Search_Field ? this.options.User_Search_Field.split(',').map((item) => `(${item}=${username})`) : this.options.UsernameField.split(',').map((item) => `(${item}=${username})`)
    if (usernameFilter === undefined || usernameFilter?.length === 0) {
      debugLog('LDAP_User_Search_Field not defined')
    } else if (usernameFilter?.length === 1) {
      filter.push(`${usernameFilter[0]}`)
    } else {
      filter.push(`(|${usernameFilter?.join('')})`)
    }
    return filter?.length > 0 ? `(&${filter?.join('')})` : ''
  }

  async bindUserIfNecessary(username, password) {
    if (this.domainBinded === true) {
      return
    }

    if (!this.options.User_Authentication) {
      return
    }

    if (!this.options.BaseDN) throw new Error('BaseDN is not provided')

    const userDn = `${this.options.User_Authentication_Field}=${username},${this.options.BaseDN}`

    await this.bindAsync(userDn, password)
    this.domainBinded = true
  }

  async bindIfNecessary() {
    if (this.domainBinded === true) {
      return
    }
    debugLog('Binding UserDN', this.options.Authentication_UserDN)

    await this.bindAsync(this.options.Authentication_UserDN, this.options.Authentication_Password)
    this.domainBinded = true
  }

  async searchUsersAsync(username, page) {
    await this.bindIfNecessary()
    const filter = this.getUserFilter(username)
    const sizeLimit = this.options.Search_Size_Limit
    const searchOptions = {
      scope: this.options.User_Search_Scope || 'sub',
    }
    if (filter && filter !== '') {
      searchOptions.filter = filter
    }
    if (sizeLimit && sizeLimit !== '') {
      searchOptions.sizeLimit = sizeLimit
    }
    if (this.options.User_Attributes) searchOptions.attributes = this.options.User_Attributes.split(',')

    if (this.options.Search_Page_Size > 0) {
      searchOptions.paged = {
        pageSize: this.options.Search_Page_Size,
        pagePause: !!page,
      }
    }

    debugLog('Searching user', username)
    debugLog('searchOptions', searchOptions)
    debugLog('BaseDN', this.options.BaseDN)

    if (page) {
      return this.searchAllPaged(this.options.BaseDN, searchOptions, page)
    }

    return this.searchAllAsync(this.options.BaseDN, searchOptions)
  }

  async getUserByIdAsync(id, attribute) {
    await this.bindIfNecessary()

    const Unique_Identifier_Field = this.constructor.getSettings('LDAP_UNIQUE_IDENTIFIER_FIELD').split(',')

    let filter

    if (attribute) {
      // Convert hex ID back to string for filter
      const idValue = Buffer.from(id, 'hex').toString()
      filter = `(${attribute}=${idValue})`
    } else {
      const filterParts = []
      Unique_Identifier_Field.forEach((item) => {
        const idValue = Buffer.from(id, 'hex').toString()
        filterParts.push(`(${item}=${idValue})`)
      })

      // Create OR filter for multiple fields
      filter = filterParts.length > 1 ? `(|${filterParts.join('')})` : filterParts[0]
    }

    const searchOptions = {
      filter,
      scope: 'sub',
    }

    debugLog('Searching by id', id)
    debugLog('search filter', filter)
    debugLog('BaseDN', this.options.BaseDN)

    const result = await this.searchAllAsync(this.options.BaseDN, searchOptions)

    if (!Array.isArray(result) || result.length === 0) {
      return
    }

    if (result?.length > 1) {
      debugLog('Search by id', id, 'returned', result.length, 'records')
    }
    return result[0]
  }

  async getUserByUsernameSync(username) {
    await this.bindIfNecessary()

    const searchOptions = {
      filter: this.getUserFilter(username),
      scope: this.options.User_Search_Scope || 'sub',
    }

    debugLog('Searching user', username)
    debugLog('searchOptions', searchOptions)
    debugLog('BaseDN', this.options.BaseDN)

    const result = await this.searchAllAsync(this.options.BaseDN, searchOptions)
    debugLog('searchAllAsync result', result)
    if (!Array.isArray(result) || result?.length === 0) {
      return
    }

    if (result?.length > 1) {
      debugLog('Search by username', username, 'returned', result.length, 'records')
    }
    return result[0]
  }

  async getUserGroups(username, ldapUser) {
    if (!this.options.group_filter_enabled) {
      return true
    }

    const filter = ['(&']

    if (this.options.group_filter_object_class !== '') {
      filter.push(`(objectclass=${this.options.group_filter_object_class})`)
    }

    if (this.options.group_filter_group_member_attribute !== '') {
      const format_value = ldapUser[this.options.group_filter_group_member_format]
      if (format_value) {
        filter.push(`(${this.options.group_filter_group_member_attribute}=${format_value})`)
      }
    }

    filter.push(')')

    const searchOptions = {
      filter: filter?.join('').replace(/#{username}/g, username),
      scope: 'sub',
    }

    debugLog('Group list filter LDAP:', searchOptions.filter)

    const result = await this.searchAllAsync(this.options.BaseDN, searchOptions)

    if (!Array.isArray(result) || result?.length === 0) {
      return []
    }

    const grp_identifier = this.options.group_filter_group_id_attribute || 'cn'
    const groups = []
    result.map((item) => {
      groups.push(item[grp_identifier])
    })
    debugLog(`Groups: ${groups?.join(', ')}`)
    return groups
  }

  async isUserInGroup(username, ldapUser) {
    if (!this.options.group_filter_enabled) {
      return true
    }

    const grps = await this.getUserGroups(username, ldapUser)

    const filter = ['(&']

    if (this.options.group_filter_object_class !== '') {
      filter.push(`(objectclass=${this.options.group_filter_object_class})`)
    }

    if (this.options.group_filter_group_member_attribute !== '') {
      const format_value = ldapUser[this.options.group_filter_group_member_format]
      if (format_value) {
        filter.push(`(${this.options.group_filter_group_member_attribute}=${format_value})`)
      }
    }

    if (this.options.group_filter_group_id_attribute !== '') {
      filter.push(`(${this.options.group_filter_group_id_attribute}=${this.options.group_filter_group_name})`)
    }
    filter.push(')')

    const searchOptions = {
      filter: filter?.join('').replace(/#{username}/g, username),
      scope: 'sub',
    }

    debugLog('Group filter LDAP:', searchOptions.filter)

    const result = await this.searchAllAsync(this.options.BaseDN, searchOptions)

    if (!Array.isArray(result) || result?.length === 0) {
      return false
    }
    return true
  }

  extractLdapEntryData(entry) {
    try {
      const returnValues = {}

      // Handle both old ldapjs format and new ldapjs-client format
      if (entry.attributes && Array.isArray(entry.attributes)) {
        // Old format from ldapjs
        entry.attributes.forEach((attribute) => {
          const { type, values } = attribute
          returnValues[type] = values
        })
        returnValues.dn = entry.objectName || entry.dn
      } else if (entry.dn) {
        // New format from ldapjs-client - entry is likely {dn: string, ...attributes}
        returnValues.dn = entry.dn
        // Copy all other properties as attributes
        Object.keys(entry).forEach((key) => {
          if (key !== 'dn') {
            returnValues[key] = entry[key]
          }
        })
      } else {
        // Fallback - entry might be a plain object with attributes
        Object.assign(returnValues, entry)
      }

      return returnValues
    } catch (error) {
      debugLog('Error extracting LDAP entry data:', error)
      return undefined
    }
  }

  async searchAllPaged(BaseDN, options, page) {
    await this.bindIfNecessary()

    try {
      // For now, use regular search and simulate paging
      // The new library may handle paging differently or might not support it in the same way
      const searchResult = await this.client.search(BaseDN, options)
      const entries = []

      if (searchResult && Array.isArray(searchResult)) {
        for (const entry of searchResult) {
          const extractedData = this.extractLdapEntryData(entry)
          if (extractedData) {
            entries.push(extractedData)
          }
        }
      }

      // Simulate the page callback pattern from the old library
      const processPage = ({
        entries, title, end, next,
      }) => {
        debugLog(title)
        page(null, entries, {
          end,
          next: next || (() => {}),
        })
      }

      // For now, just return all results as one page
      processPage({
        entries,
        title: 'Complete Results',
        end: true,
      })
    } catch (error) {
      debugLog('Paged search error:', error)
      page(error)
    }
  }

  async searchAllAsync(BaseDN, options) {
    await this.bindIfNecessary()
    try {
      const searchResult = await this.client.search(BaseDN, options)
      const entries = []

      if (searchResult && Array.isArray(searchResult)) {
        // ldapjs-client returns an array of entries directly
        for (const entry of searchResult) {
          const extractedData = this.extractLdapEntryData(entry)
          if (extractedData) {
            entries.push(extractedData)
          }
        }
      }

      debugLog('Search result count', entries.length)
      return entries
    } catch (error) {
      debugLog('Search error:', error)
      throw error
    }
  }

  async authAsync(dn, password) {
    debugLog('Authenticating', dn)

    try {
      if (password === '') {
        throw new Error('Password is not provided')
      }
      await this.bindAsync(dn, password)
      debugLog('Authenticated', dn)
      return true
    } catch (error) {
      debugLog('Not authenticated', dn)
      debugLog('error', error)
      return false
    }
  }

  disconnect() {
    this.connected = false
    this.domainBinded = false
    debugLog('Disconnecting')
    if (this.client) {
      this.client.unbind()
    }
  }
}

function getLdapUsername(ldapUser) {
  const usernameField = LDAP.getSettings('LDAP_USERNAME_FIELD') || 'uid'

  if (usernameField.indexOf('#{') > -1) {
    return usernameField.replace(/#{(.+?)}/g, (match, field) => {
      const v = ldapUser[field]
      return Array.isArray(v) ? v[0] : v
    })
  }

  return ldapUser[usernameField]
}

function getLdapEmail(ldapUser) {
  const emailField = LDAP.getSettings('LDAP_EMAIL_FIELD') || 'mail'

  if (emailField?.indexOf('#{') > -1) {
    return emailField.replace(/#{(.+?)}/g, (match, field) => {
      const v = ldapUser[field]
      return Array.isArray(v) ? v[0] : v
    })
  }

  const v = ldapUser[emailField]
  return Array.isArray(v) ? v[0] : v
}

function getLdapFullname(ldapUser) {
  const fullnameField = LDAP.getSettings('LDAP_FULLNAME_FIELD') || 'cn'

  if (fullnameField.indexOf('#{') > -1) {
    return fullnameField.replace(/#{(.+?)}/g, (match, field) => {
      const v = ldapUser[field]
      return Array.isArray(v) ? v[0] : v
    })
  }

  return ldapUser[fullnameField]
}

function getLdapUserUniqueID(ldapUser) {
  let Unique_Identifier_Field = LDAP.getSettings('LDAP_UNIQUE_IDENTIFIER_FIELD') || LDAP.getSettings('LDAP_USERNAME_FIELD') || 'uid'

  if (Unique_Identifier_Field !== '' && Unique_Identifier_Field !== undefined) {
    Unique_Identifier_Field = Unique_Identifier_Field.replace(/\s/g, '').split(',')
  } else {
    Unique_Identifier_Field = []
  }

  let User_Search_Field = LDAP.getSettings('LDAP_USER_SEARCH_FIELD')

  if (User_Search_Field !== '' && User_Search_Field !== undefined) {
    User_Search_Field = User_Search_Field.replace(/\s/g, '').split(',')
  } else {
    User_Search_Field = []
  }

  Unique_Identifier_Field = Unique_Identifier_Field.concat(User_Search_Field)

  if (Unique_Identifier_Field?.length > 0) {
    Unique_Identifier_Field = Unique_Identifier_Field
      .find((field) => !isEmpty(ldapUser[field]))
    if (Unique_Identifier_Field) {
      debugLog(`Identifying user with: ${Unique_Identifier_Field}`)
      Unique_Identifier_Field = {
        attribute: Unique_Identifier_Field,
        value: ldapUser[Unique_Identifier_Field].toString('hex'),
      }
    }
    return Unique_Identifier_Field
  }
}

function fallbackDefaultAccountSystem(bind, username, password) {
  if (typeof username === 'string') {
    if (username.indexOf('@') === -1) {
      username = { username }
    } else {
      username = { email: username }
    }
  }

  debugLog('Fallback to default account system: ', username)

  const loginRequest = {
    user: username,
    password: {
      digest: SHA256(password),
      algorithm: 'sha-256',
    },
  }
  debugLog('Fallback options: ', loginRequest)

  return Accounts._runLoginHandlers(bind, loginRequest)
}
getGlobalSettingAsync('enableLDAP').then((ldapEnabled) => {
  if (ldapEnabled) {
    Accounts.registerLoginHandler('ldap', async function (loginRequest) {
      if (!loginRequest.ldap || !loginRequest.ldapOptions) {
        return undefined
      }

      debugLog('Init LDAP login', loginRequest.username)

      const self = this
      const ldap = new LDAP()
      let ldapUser

      try {
        await ldap.connectAsync()
        const user_authentication = LDAP.getSettings('LDAP_USER_AUTHENTICATION') || LDAP.getSettings('LDAP_USERNAME_FIELD') || 'uid'
        debugLog(user_authentication)
        if (user_authentication && user_authentication !== 'none') {
          await ldap.bindUserIfNecessary(loginRequest.username, loginRequest.ldapPass)
          const tempLdapUser = await ldap.searchUsersAsync(loginRequest.username)
          ldapUser = tempLdapUser[0]
        } else {
          const users = await ldap.searchUsersAsync(loginRequest.username)
          if (users?.length !== 1) {
            debugLog('Search returned', users.length, 'record(s) for', loginRequest.username)
            throw new Error('User not Found')
          }

          if (await ldap.isUserInGroup(loginRequest.username, users[0])) {
            ldapUser = users[0]
          } else {
            throw new Error('User not in a valid group')
          }
          if (await ldap.authAsync(ldapUser.dn, loginRequest.ldapPass) !== true) {
            ldapUser = null
            debugLog('Wrong password for', loginRequest.username)
          }
        }
      } catch (error) {
        debugLog(error)
      }

      if (!ldapUser) {
        if (LDAP.getSettings('LDAP_LOGIN_FALLBACK') === true) {
          return fallbackDefaultAccountSystem(self, loginRequest.username, loginRequest.ldapPass)
        }

        throw new Meteor.Error('LDAP-login-error', `LDAP Authentication failed with provided username [${loginRequest.username}]`)
      }

      // Look to see if user already exists

      let userQuery

      const Unique_Identifier_Field = getLdapUserUniqueID(ldapUser)
      let user
      // Attempt to find user by unique identifier

      if (Unique_Identifier_Field) {
        userQuery = {
          'services.ldap.id': Unique_Identifier_Field.value,
        }

        debugLog('Querying user')
        debugLog('userQuery', userQuery)

        user = await Meteor.users.findOneAsync(userQuery)
      }

      // Attempt to find user by username

      let username
      let email

      if (LDAP.getSettings('LDAP_USERNAME_FIELD') !== '') {
        username = getLdapUsername(ldapUser)
      } else {
        username = loginRequest.username
      }

      if (LDAP.getSettings('LDAP_EMAIL_FIELD') !== '') {
        email = getLdapEmail(ldapUser)
      }

      if (!user) {
        if (email && LDAP.getSettings('LDAP_EMAIL_MATCH_REQUIRE') === true) {
          if (LDAP.getSettings('LDAP_EMAIL_MATCH_VERIFIED') === true) {
            userQuery = {
              _id: username,
              'emails.0.address': email,
              'emails.0.verified': true,
            }
          } else {
            userQuery = {
              _id: username,
              'emails.0.address': email,
            }
          }
        } else {
          userQuery = {
            username,
          }
        }

        debugLog('userQuery', userQuery)

        user = await Meteor.users.findOneAsync(userQuery)
      }

      // Attempt to find user by e-mail address only

      if (!user && email && LDAP.getSettings('LDAP_EMAIL_MATCH_ENABLE') === true) {
        debugLog('No user exists with username', username, '- attempting to find by e-mail address instead')

        if (LDAP.getSettings('LDAP_EMAIL_MATCH_VERIFIED') === true) {
          userQuery = {
            'emails.0.address': email,
            'emails.0.verified': true,
          }
        } else {
          userQuery = {
            'emails.0.address': email,
          }
        }

        debugLog('userQuery', userQuery)

        user = await Meteor.users.findOneAsync(userQuery)
      }

      // Login user if they exist
      if (user) {
        if (user.authenticationMethod !== 'ldap' && LDAP.getSettings('LDAP_MERGE_EXISTING_USERS') !== true) {
          debugLog('User exists without "authenticationMethod : ldap"')
          throw new Meteor.Error('LDAP-login-error', 'LDAP Authentication succeeded, but there\'s already a matching titra account in MongoDB')
        }

        debugLog('Logging user')

        const stampedToken = Accounts._generateStampedLoginToken()
        const update_data = {
          $push: {
            'services.resume.loginTokens': Accounts._hashStampedToken(stampedToken),
          },
        }

        if (LDAP.getSettings('LDAP_SYNC_ADMIN_STATUS') === true) {
          debugLog('Updating admin status')
          const targetGroups = LDAP.getSettings('LDAP_SYNC_ADMIN_GROUPS').split(',')
          const groups = (await ldap.getUserGroups(username, ldapUser))
            .filter((value) => targetGroups.includes(value))

          user.isAdmin = groups?.length > 0
          await Meteor.users.updateAsync({ _id: user._id }, { $set: { isAdmin: user.isAdmin } })
        }

        await Meteor.users.updateAsync(user._id, update_data)

        syncUserData(user, ldapUser)

        if (LDAP.getSettings('LDAP_LOGIN_FALLBACK') === true) {
          await Accounts.setPasswordAsync(user._id, loginRequest.ldapPass, { logout: false })
        }

        return {
          userId: user._id,
          token: stampedToken.token,
        }
      }

      // Create new user

      debugLog('User does not exist, creating', username)

      if (LDAP.getSettings('LDAP_USERNAME_FIELD') === '') {
        username = undefined
      }

      if (LDAP.getSettings('LDAP_LOGIN_FALLBACK') !== true) {
        loginRequest.ldapPass = undefined
      }

      const result = await addLdapUser(ldapUser, username, loginRequest.ldapPass)

      if (LDAP.getSettings('LDAP_SYNC_ADMIN_STATUS') === true) {
        debugLog('Updating admin status')
        const targetGroups = LDAP.getSettings('LDAP_SYNC_ADMIN_GROUPS').split(',')
        const groups = (await ldap.getUserGroups(username, ldapUser)).filter((value) => targetGroups.includes(value))

        result.isAdmin = groups?.length > 0
        await Meteor.users.updateAsync({ _id: result.userId }, { $set: { isAdmin: result.isAdmin } })
      }
      if (result instanceof Error) {
        throw result
      }
      return result
    })
  }
})
// Object.defineProperty(Object.prototype, 'getLDAPValue', {
//   value(prop) {
//     if (!prop) {
//       return
//     }
//     const self = this
//     for (const key in self) {
//       if (key.toLowerCase() == prop.toLowerCase()) {
//         return self[key]
//       }
//     }
//   },
//   enumerable: false,
// })

const isEmpty = (obj) => [Object, Array]
  .includes((obj || {}).constructor) && !Object.entries((obj || {})).length

function templateVarHandler(variable, object) {
  const templateRegex = /#{([\w\-]+)}/gi
  let match = templateRegex.exec(variable)
  let tmpVariable = variable

  if (match == null) {
    if (!object.hasOwnProperty(variable)) {
      return
    }
    return object[variable]
  }
  while (match != null) {
    const tmplVar = match[0]
    const tmplAttrName = match[1]

    if (!object.hasOwnProperty(tmplAttrName)) {
      return
    }

    const attrVal = object[tmplAttrName]
    tmpVariable = tmpVariable.replace(tmplVar, attrVal)
    match = templateRegex.exec(variable)
  }
  return tmpVariable
}

function getPropertyValue(obj, key) {
  try {
    return key.split('.').reduce((acc, el) => acc[el], obj)
  } catch (err) {
    return undefined
  }
}

function getDataToSyncUserData(ldapUser, user) {
  const syncUserData = LDAP.getSettings('LDAP_SYNC_USER_DATA')
  const syncUserDataFieldMap = LDAP.getSettings('LDAP_SYNC_USER_DATA_FIELDMAP')?.trim()

  const userData = {}

  if (syncUserData && syncUserDataFieldMap) {
    const whitelistedUserFields = ['email', 'name', 'customFields']
    const fieldMap = JSON.parse(syncUserDataFieldMap)
    const emailList = []
    fieldMap.map((userField, ldapField) => {
      debugLog(`Mapping field ${ldapField} -> ${userField}`)
      switch (userField) {
        case 'email':
          if (!ldapUser.hasOwnProperty(ldapField)) {
            debugLog(`user does not have attribute: ${ldapField}`)
            return
          }

          if (ldapUser[ldapField] === Object(ldapUser[ldapField])) {
            ldapUser[ldapField].map((item) => {
              emailList.push({ address: item, verified: true })
            })
          } else {
            emailList.push({ address: ldapUser[ldapField], verified: true })
          }
          break

        default:
          const [outerKey, innerKeys] = userField.split(/\.(.+)/)

          if (!whitelistedUserFields.find((el) => el === outerKey)) {
            debugLog(`user attribute not whitelisted: ${userField}`)
            return
          }

          if (outerKey === 'customFields') {
            let customFieldsMeta

            try {
              customFieldsMeta = JSON.parse(LDAP.getSettings('Accounts_CustomFields'))
            } catch (e) {
              debugLog('Invalid JSON for Custom Fields')
              return
            }

            if (!getPropertyValue(customFieldsMeta, innerKeys)) {
              debugLog(`user attribute does not exist: ${userField}`)
              return
            }
          }
          const tmpUserField = getPropertyValue(user, userField)
          const tmpLdapField = templateVarHandler(ldapField, ldapUser)

          if (tmpLdapField && tmpUserField !== tmpLdapField) {
          // creates the object structure instead of just assigning 'tmpLdapField' to
          // 'userData[userField]' in order to avoid the "cannot use the part (...)
          // to traverse the element" (MongoDB) error that can happen. Do not handle
          // arrays.
          // TODO: Find a better solution.
            const dKeys = userField.split('.')
            const lastKey = dKeys[dKeys.length - 1]
            dKeys.reduce(
              (obj, currKey) => ((currKey === lastKey)
                ? obj[currKey] = tmpLdapField
                : obj[currKey] = obj[currKey] || {}),
              userData,
            )
            debugLog(`user.${userField} changed to: ${tmpLdapField}`)
          }
      }
    })

    if (emailList?.length > 0) {
      if (JSON.stringify(user.emails) !== JSON.stringify(emailList)) {
        userData.emails = emailList
      }
    }
  }

  const uniqueId = getLdapUserUniqueID(ldapUser)

  if (uniqueId
    && (!user.services
      || !user.services.ldap
      || user.services.ldap.id !== uniqueId.value
      || user.services.ldap.idAttribute !== uniqueId.attribute)) {
    userData['services.ldap.id'] = uniqueId.value
    userData['services.ldap.idAttribute'] = uniqueId.attribute
  }

  if (user.authenticationMethod !== 'ldap') {
    userData.ldap = true
  }

  if (Object.keys(userData).length) {
    return userData
  }
}

async function syncUserData(user, ldapUser) {
  debugLog('Syncing user data')
  debugLog('user', { email: user.email, _id: user._id })
  // logDebug('ldapUser', ldapUser.object);

  if (LDAP.getSettings('LDAP_USERNAME_FIELD') !== '') {
    const username = getLdapUsername(ldapUser)
    if (user && user._id && username !== user.username) {
      debugLog('Syncing user username', user.username, '->', username)
      await Meteor.users.findOneAsync({ _id: user._id }, { $set: { username } })
    }
  }

  if (LDAP.getSettings('LDAP_FULLNAME_FIELD') !== '') {
    const fullname = getLdapFullname(ldapUser)
    debugLog('fullname=', fullname)
    if (user && user._id && fullname !== '') {
      debugLog('Syncing user fullname:', fullname)
      await Meteor.users.updateAsync({ _id: user._id }, { $set: { 'profile.fullname': fullname } })
    }
  }

  if (LDAP.getSettings('LDAP_EMAIL_FIELD') !== '') {
    const email = getLdapEmail(ldapUser)
    debugLog('email=', email)

    if (user && user._id && email !== '') {
      debugLog('Syncing user email:', email)
      await Meteor.users.updateAsync({
        _id: user._id,
      }, {
        $set: {
          'emails.0.address': email,
        },
      })
    }
  }
}

async function addLdapUser(ldapUser, username, password) {
  const uniqueId = getLdapUserUniqueID(ldapUser)

  const userObject = {
  }

  if (username) {
    userObject.username = username
  }

  const userData = getDataToSyncUserData(ldapUser, {})

  if (userData && userData.emails && userData.emails[0] && userData.emails[0].address) {
    if (Array.isArray(userData.emails[0].address)) {
      userObject.email = userData.emails[0].address[0]
    } else {
      userObject.email = userData.emails[0].address
    }
  } else if (ldapUser.mail && ldapUser.mail.indexOf('@') > -1) {
    userObject.email = ldapUser.mail
  } else if (LDAP.getSettings('LDAP_DEFAULT_DOMAIN') !== '') {
    userObject.email = `${username || uniqueId.value}@${LDAP.getSettings('LDAP_DEFAULT_DOMAIN')}`
  } else {
    const error = new Meteor.Error('LDAP-login-error', 'LDAP Authentication succeeded, there is no email to create an account. Have you tried setting your Default Domain in LDAP Settings?')
    debugLog(error)
    throw error
  }
  // handle special case for titra to sync profile.name
  // and initial project description as this is a mandatory field for us
  if (getLdapFullname(ldapUser)) {
    userObject.profile = {}
    userObject.profile.name = getLdapFullname(ldapUser)
    userObject.profile.currentLanguageProject = 'Project'
    userObject.profile.currentLanguageProjectDesc = { ops: [{ insert: 'This project has been automatically created for you, feel free to change it! Did you know that you can use emojis like 💰 ⏱ 👍 everywhere?' }] }
  }
  debugLog('New user data', userObject)

  if (password) {
    userObject.password = password
  }

  try {
    // This creates the account with password service
    userObject.ldap = true
    userObject._id = await Accounts.createUserAsync(userObject)
    debugLog('New user created through LDAP login: ', userObject._id)
    // Add the services.ldap identifiers
    await Meteor.users.updateAsync({ _id: userObject._id }, {
      $set: {
        'services.ldap': { id: uniqueId.value },
        'emails.0.verified': true,
        authenticationMethod: 'ldap',
      },
    })
  } catch (error) {
    debugLog('Error creating user', error)
    return error
  }

  await syncUserData(userObject, ldapUser)

  return {
    userId: userObject._id,
  }
}
