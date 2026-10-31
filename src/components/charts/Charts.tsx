import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { CATEGORY_LABELS, LISTING_STATUS_LABELS } from '@/lib/constants'
import type { ImpactStats, ListingStatus } from '@/lib/types'

// Theme tokens (src/index.css), so charts follow light/dark mode.
const FOREST = 'var(--chart-1)'
const EMERALD = 'var(--chart-2)'
const MUTED_SERIES = 'var(--chart-4)'
const GRID = 'var(--border)'
const AXIS = { fontSize: 11, fill: 'var(--muted-foreground)' }
const CURSOR = { fill: 'var(--muted)' }

const tooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--popover)',
    color: 'var(--popover-foreground)',
    fontSize: 12,
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
  },
  labelStyle: { color: 'var(--popover-foreground)', fontWeight: 600 },
  itemStyle: { color: 'var(--popover-foreground)' },
}

export function RescueTrendChart({ data, height = 260 }: { data: ImpactStats['timeseries']; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: format(parseISO(d.day), 'd MMM') }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gVerified" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EMERALD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="listed_meals" name="Listed meals" stroke={MUTED_SERIES} strokeDasharray="4 4" fill="transparent" strokeWidth={1.5} />
        <Area type="monotone" dataKey="verified_meals" name="Verified rescued meals" stroke={EMERALD} fill="url(#gVerified)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const STATUS_COLORS: Record<ListingStatus, string> = {
  available: EMERALD,
  reserved: '#0EA5E9',
  collected: '#6EE7B7',
  completed: FOREST,
  expired: '#CBD5E1',
  cancelled: '#94A3B8',
  removed: '#EF4444',
}

export function StatusDonut({ data, height = 240 }: { data: ImpactStats['status_distribution']; height?: number }) {
  const rows = data.map((d) => ({ name: LISTING_STATUS_LABELS[d.status], value: d.count, status: d.status }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((r) => (
            <Cell key={r.status} fill={STATUS_COLORS[r.status]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function CategoryBars({ data, height = 260 }: { data: ImpactStats['categories']; height?: number }) {
  const rows = data.map((d) => ({ ...d, name: CATEGORY_LABELS[d.category] }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={48} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={CURSOR} />
        <Bar dataKey="verified_meals" name="Verified rescued meals" fill={FOREST} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonorBars({ data, height = 260 }: { data: ImpactStats['top_donors']; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={130} />
        <Tooltip {...tooltipStyle} cursor={CURSOR} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="verified_meals" name="Verified meals" fill={EMERALD} radius={[0, 6, 6, 0]} maxBarSize={18} />
        <Bar dataKey="listings" name="Listings" fill={MUTED_SERIES} fillOpacity={0.5} radius={[0, 6, 6, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
