import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ListSkeleton, PageHeader } from '@/components/common/States'
import { useNotifications } from '@/context/NotificationsContext'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  const { items, unread, loading, live, reload, markRead, markAllRead } = useNotifications()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const navigate = useNavigate()
  const rows = tab === 'unread' ? items.filter((n) => !n.read_at) : items

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', live ? 'bg-emerald-500' : 'bg-slate-300')} />
            {live ? 'Live updates connected' : 'Live updates unavailable — refreshing every 30 seconds'}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => reload()}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={markAllRead} disabled={!unread}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'unread')} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All <span className="tabular ml-1 text-xs text-muted-foreground">{items.length}</span></TabsTrigger>
          <TabsTrigger value="unread">Unread <span className="tabular ml-1 text-xs text-muted-foreground">{unread}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {loading && !items.length ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={Bell} title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'} description="Requests, acceptances, pickup updates and expiry alerts appear here." />
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {rows.map((n) => (
            <li key={n.id} className={cn('flex gap-3 border-b p-4 last:border-0', !n.read_at && 'bg-emerald-50/40')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-slate-200' : 'bg-emerald-brand')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400" title={format(new Date(n.created_at), 'PPpp')}>
                  {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                {n.link && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!n.read_at) void markRead(n.id)
                      navigate(n.link!)
                    }}
                  >
                    Open
                  </Button>
                )}
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
