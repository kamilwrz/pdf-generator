/** Shared navigation and reading layout for public pages and account workspaces. */
import { useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getAccessToken, getEditorPath } from '../../../utils/authSession';
import classes from './SiteLayout.module.css';

/** Public and workspace menus share order, active indicators, and the primary start action. */
export function SiteHeader({ workspace = false }) {
  const signedIn = Boolean(getAccessToken());
  return <header className={classes.header}>
    <Link to="/" className={classes.brand} aria-label="CV Studio — strona główna"><img src="/cv-studio-logo.svg" alt="" /></Link>
    <nav aria-label="Główna nawigacja" className={classes.nav}>
      {workspace ? <><NavLink to="/app/documents">Moje dokumenty</NavLink><NavLink to="/app/career-profile">Profil zawodowy</NavLink><NavLink to="/app/account">Konto i plan</NavLink></> : <><NavLink to="/templates">Szablony</NavLink><NavLink to="/pricing">Cennik</NavLink></>}
      <NavLink to="/help">Pomoc</NavLink>
      {!workspace && <Link to={signedIn ? '/app/documents' : '/login'}>{signedIn ? 'Moje dokumenty' : 'Zaloguj się'}</Link>}
      <Link className={classes.primary} to={getEditorPath({ start: 'new' })}>Stwórz CV</Link>
    </nav>
  </header>;
}

/** Only implemented destinations appear in the shared secondary navigation. */
export function SiteFooter() {
  return <footer className={classes.footer}>
    <p>CV Studio <span>Wybierz szablon, wpisz treść i pobierz PDF.</span></p>
    <nav aria-label="Stopka"><Link to="/templates">Szablony</Link><Link to="/pricing">Cennik</Link><Link to="/help">Pomoc</Link><Link to="/privacy">Prywatność</Link></nav>
  </footer>;
}

/** Route changes reset reading position and focus, while anchors keep native navigation. */
export default function SiteLayout({ title, eyebrow = 'CV STUDIO', intro, workspace = false, breadcrumbs, heroAside, heroActions, compact = false, children }) {
  const heading = useRef(null);
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${title} — CV Studio`;
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      heading.current?.focus({ preventScroll: true });
    } else {
      // Client-side route links mount help content after navigation. Restore
      // the native anchor destination once that content exists, including focus.
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView({ behavior: 'instant', block: 'start' });
      target?.focus({ preventScroll: true });
    }
  }, [pathname, hash, title]);
  return <div className={classes.site}>
    <a className={classes.skip} href="#site-content">Przejdź do treści</a>
    <SiteHeader workspace={workspace} />
    <main id="site-content" tabIndex={-1} className={`${classes.main} ${workspace ? classes.workspace : ''}`}>
      {breadcrumbs && <nav className={classes.breadcrumbs} aria-label="Ścieżka strony">{breadcrumbs.map((item) => item.to ? <Link key={item.label} to={item.to}>{item.label}</Link> : <span key={item.label} aria-current="page">{item.label}</span>)}</nav>}
      <div className={`${heroAside ? classes.hero : ''} ${compact ? classes.compactHero : ''}`}>
        <div className={classes.introduction}><p className={classes.eyebrow}>{eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{intro && <p>{intro}</p>}{heroActions && <div className={classes.actions}>{heroActions}</div>}</div>
        {heroAside && <aside className={classes.heroAside}>{heroAside}</aside>}
      </div>
      {children}
    </main>
    <SiteFooter />
  </div>;
}
