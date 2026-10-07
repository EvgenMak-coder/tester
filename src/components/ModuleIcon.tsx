import {
  Activity,
  Braces,
  CalendarClock,
  Cog,
  Container,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  Network,
  Package,
  Power,
  ScrollText,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react'

/** Значки, которые можно указать модулю в поле icon файла курса. */
const ICONS: Record<string, LucideIcon> = {
  terminal: Terminal,
  files: FolderTree,
  key: KeyRound,
  text: FileText,
  activity: Activity,
  users: Users,
  package: Package,
  disk: HardDrive,
  network: Network,
  lock: Lock,
  service: Cog,
  power: Power,
  logs: ScrollText,
  code: Braces,
  schedule: CalendarClock,
  shield: ShieldCheck,
  gauge: Gauge,
  container: Container,
  server: Server,
  layers: Layers,
}

/** Сколько цветов чередуется у модулей; сами цвета — классы .hue-N в global.css. */
const HUES = 8

export const hueClass = (index: number): string => `hue-${index % HUES}`

/** Цветная плитка со значком модуля; неизвестное или пустое имя даёт обычную папку. */
export function ModuleIcon({ name, size = 22 }: { name?: string; size?: number }) {
  const Icon = (name && ICONS[name]) || Folder
  return (
    <span className="module-icon" aria-hidden="true">
      <Icon size={size} strokeWidth={1.9} />
    </span>
  )
}
