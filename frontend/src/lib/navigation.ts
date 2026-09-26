import type { ComponentType } from 'react'

import {
  IconAdmissions, IconAssignments, IconAttention, IconCarePlans, IconIncoming,
  IconOverview, IconPatients, IconPostDischarge, IconStaff, IconActiveCalls,
} from '../components/layout/icons'
import type { MembershipRole, OrganizationType } from './database.types'
import { t } from './i18n'

export interface NavItem {
  to: string
  label: string
  Icon: ComponentType
  badge?: 'incoming' | 'overdue'
  end?: boolean
}

const overview: NavItem = { to: '/', label: t.nav.overview, Icon: IconOverview, end: true }
const patients: NavItem = { to: '/patients', label: t.nav.patients, Icon: IconPatients }
const attention: NavItem = { to: '/attention', label: t.nav.attention, Icon: IconAttention }
const activeCalls: NavItem = {
  to: '/active-calls',
  label: t.nav.activeCalls,
  Icon: IconActiveCalls,
  badge: 'overdue',
}
const staff: NavItem = { to: '/staff', label: t.nav.staff, Icon: IconStaff }

const HOSPITAL: NavItem[] = [
  overview,
  patients,
  { to: '/admissions', label: t.nav.admissions, Icon: IconAdmissions },
  { to: '/care-plans', label: t.nav.carePlans, Icon: IconCarePlans },
  { to: '/post-discharge', label: t.nav.postDischarge, Icon: IconPostDischarge },
]

const POLYCLINIC: NavItem[] = [
  overview,
  { to: '/incoming', label: t.nav.incoming, Icon: IconIncoming, badge: 'incoming' },
  activeCalls,
  { to: '/assignments', label: t.nav.assignments, Icon: IconAssignments },
  patients,
  attention,
]

const NURSE: NavItem[] = [
  { to: '/', label: t.nav.myPatients, Icon: IconPatients, end: true },
  activeCalls,
  attention,
]

export function navigationFor(
  role: MembershipRole | null,
  organizationType: OrganizationType | null,
): NavItem[] {
  switch (role) {
    case 'HOSPITAL_DOCTOR':
      return HOSPITAL
    case 'POLYCLINIC_DOCTOR':
      return POLYCLINIC
    case 'NURSE':
      return NURSE
    case 'ORGANIZATION_ADMIN':
      return organizationType === 'CENTRAL_HOSPITAL'
        ? [...HOSPITAL, staff]
        : [...POLYCLINIC, staff]
    case 'SUPER_ADMIN':
      return [overview, patients, activeCalls, attention, staff]
    default:
      return [overview]
  }
}
