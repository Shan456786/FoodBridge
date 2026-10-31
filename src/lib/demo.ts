import type { Role } from './types'

/**
 * Public demo accounts. These are deliberately public: they are restricted
 * by the database to fictional demo records (is_demo = true), and the demo
 * administrator can only see and moderate demo data. They are provisioned
 * by `npm run seed:demo` (service-role key stays on the operator's machine).
 */
export const DEMO_PASSWORD = 'FoodBridge-Demo-2026'

export const DEMO_ACCOUNTS: { role: Role; email: string; label: string; description: string }[] = [
  { role: 'donor', email: 'demo.donor@foodbridge.test', label: 'Donor', description: 'Central Canteen' },
  { role: 'receiver', email: 'demo.receiver@foodbridge.test', label: 'Receiver', description: 'Community Food Collective' },
  { role: 'volunteer', email: 'demo.volunteer@foodbridge.test', label: 'Volunteer', description: 'Assigned pickups' },
  { role: 'admin', email: 'demo.admin@foodbridge.test', label: 'Admin', description: 'Demo-scoped moderation' },
]
