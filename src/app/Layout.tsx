import { Link, NavLink, Outlet } from 'react-router-dom'

const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link')

export function Layout() {
  return (
    <>
      <header className="topbar">
        <nav className="topbar-inner">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              &gt;_
            </span>
            Tester
          </Link>
          <NavLink className={link} to="/" end>
            Курсы
          </NavLink>
          <NavLink className={link} to="/import">
            Импорт
          </NavLink>
          <NavLink className={link} to="/settings">
            Настройки
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </>
  )
}
