import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/common/Notice'
import { useNotifications } from '@/context/NotificationsContext'
import { OFFLINE_DEMO } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function NotificationSettings() {
  const { live } = useNotifications()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          FoodBridge sends in-app notifications only. It does not send SMS, WhatsApp or email alerts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', live ? 'bg-emerald-500' : 'bg-amber-500')} />
          Delivery:{' '}
          <span className="font-medium">
            {OFFLINE_DEMO ? 'Simulated in this browser' : live ? 'Realtime (connected)' : 'Polling every 30 seconds'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Expiry warnings are generated when any signed-in user loads the app (or by a scheduled job if the operator enabled
          pg_cron), so they are not guaranteed to arrive at an exact time.
        </p>
        {OFFLINE_DEMO && <Notice tone="offline">Offline demo notifications are sample data stored in this browser.</Notice>}
      </CardContent>
    </Card>
  )
}
