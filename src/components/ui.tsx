import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Page({ title, back, lead, icon, children }: { title: string; back?: { to: string; label: string }; lead?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <main className="page">
      <header className="page-head">
        {back && (
          <Link className="back" to={back.to}>
            ← {back.label}
          </Link>
        )}
        <div className="page-title">
          {icon}
          <h1>{title}</h1>
        </div>
        {lead && <p className="muted">{lead}</p>}
      </header>
      {children}
    </main>
  )
}

/** Полоса заполнения, share от 0 до 1. */
export function Meter({ share, label }: { share: number; label: string }) {
  const value = Math.round(Math.min(Math.max(share, 0), 1) * 100)
  return (
    <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={{ width: `${value}%` }} />
    </div>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
