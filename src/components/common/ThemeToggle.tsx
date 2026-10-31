import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/ThemeContext'

/** One-click light/dark switch for public pages (Account settings offers System too). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setTheme } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <Button variant="ghost" size="icon-lg" className={className} aria-label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      {resolved === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}
