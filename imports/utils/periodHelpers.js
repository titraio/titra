import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import isoWeek from 'dayjs/plugin/isoWeek'
import { getGlobalSetting, getUserSetting } from './frontend_helpers'
import { getUserSettingAsync, getGlobalSettingAsync } from './server_method_helpers'
import { t } from './i18n'

async function periodToDates(period) {
  check(period, String)
  dayjs.extend(utc)
  dayjs.extend(isoWeek)
  let startDate
  let endDate
  switch (period) {
    case 'currentWeek':
      startDate = dayjs.utc().startOf('day').isoWeekday(await getUserSettingAsync('startOfWeek')).toDate()
      endDate = dayjs.utc().endOf('day').isoWeekday(await getUserSettingAsync('startOfWeek')).add(6, 'day')
        .toDate()
      break
    case 'lastMonth':
      startDate = dayjs.utc().subtract(1, 'month').startOf('month').toDate()
      endDate = dayjs.utc().subtract(1, 'month').endOf('month').toDate()
      break
    case 'last3months':
      startDate = dayjs.utc().subtract(3, 'month').startOf('month').toDate()
      endDate = dayjs.utc().toDate()
      break
    case 'lastWeek':
      startDate = dayjs.utc().subtract(1, 'week').startOf('day').isoWeekday(await getUserSettingAsync('startOfWeek'))
        .toDate()
      endDate = dayjs.utc().subtract(1, 'week').endOf('day').isoWeekday(await getUserSettingAsync('startOfWeek'))
        .add(6, 'day')
        .toDate()
      break
    case 'currentYear':
      startDate = dayjs.utc().startOf('year').toDate()
      endDate = dayjs.utc().endOf('year').toDate()
      break
    case 'lastYear':
      startDate = dayjs.utc().subtract(1, 'year').startOf('year').toDate()
      endDate = dayjs.utc().subtract(1, 'year').endOf('year').toDate()
      break
    case 'all':
      startDate = dayjs.utc().subtract(20, 'year').startOf('month').toDate()
      endDate = dayjs.utc().add(20, 'year').toDate()
      break
    default:
      startDate = dayjs.utc().startOf('month').toDate()
      endDate = dayjs.utc().endOf('month').toDate()
      break
  }
  return { startDate, endDate }
}
function periodToString(period) {
  check(period, String)
  switch (period) {
    case 'currentMonth':
      return t( "period.currentMonth");
    case 'currentWeek' :
      return t( "period.currentWeek" );
    case 'currentYear' :
      return t( "period.currentYear" );
    case 'lastMonth'   :
      return t( "period.lastMonth"   );
    case 'last3months' :
      return t( "period.last3months" );
    case 'lastWeek'    :
      return t( "period.lastWeek"    );
    case 'lastYear'    :
      return t( "period.lastYear"    );
    case 'custom'      :
      return t( "period.custom"      );
    case 'all'         :
      return t( "period.all"         );
    default:
      return 'N/A'
  }
}

function timeInUserUnit(time, meteorUser) {
  const precision = meteorUser?.profile?.precision ? meteorUser.profile.precision : getGlobalSetting('precision')
  if (meteorUser?.profile?.timeunit === 'd') {
    let hoursToDays = getGlobalSetting('hoursToDays')
    if (meteorUser?.profile?.hoursToDays) {
      hoursToDays = meteorUser.profile.hoursToDays
    }
    const convertedTime = Number(time / hoursToDays).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  if (meteorUser?.profile?.timeunit === 'm') {
    const convertedTime = Number(time * 60).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  return Number(time).toFixed(precision)
}
async function timeInUserUnitAsync(time, meteorUser) {
  const precision = meteorUser?.profile?.precision ? meteorUser.profile.precision : await getGlobalSettingAsync('precision')
  if (meteorUser?.profile?.timeunit === 'd') {
    let hoursToDays = await getGlobalSettingAsync('hoursToDays')
    if (meteorUser?.profile?.hoursToDays) {
      hoursToDays = meteorUser.profile.hoursToDays
    }
    const convertedTime = Number(time / hoursToDays).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  if (meteorUser?.profile?.timeunit === 'm') {
    const convertedTime = Number(time * 60).toFixed(precision)
    return convertedTime !== Number(0).toFixed(precision) ? convertedTime : undefined
  }
  return Number(time).toFixed(precision)
}
export { periodToString,periodToDates, timeInUserUnit, timeInUserUnitAsync }
