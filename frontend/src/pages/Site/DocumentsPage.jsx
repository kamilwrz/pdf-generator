/** Standalone library: owned reads, local search, and explicit per-document actions. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiUpload, FiFileText, FiFolder, FiArrowRight, FiDownload } from 'react-icons/fi';
import { HeroNote, SiteMarker } from '../../components/common/SiteLayout/SitePrimitives';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import DialogShell from '../../components/common/DialogShell/DialogShell';
import { listOwnedDocuments } from '../../services/documents';
import { ApiClient, ENDPOINTS } from '../../services/api';
import { getAccessToken } from '../../utils/authSession';
import { getDocumentPath } from '../../utils/siteRoutes';
import { fetchOwnedPdfDownload, triggerBlobDownload } from '../../utils/download';

function documentDate(document) {
  const date = new Date(document.updated_at || document.created_at);
  return Number.isNaN(date.getTime()) ? 'Data niedostępna' : date.toLocaleString('pl-PL');
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const listHeading = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    listOwnedDocuments().then((data) => { if (active) setDocuments(data); })
      .catch((failure) => { if (active) setError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const visible = useMemo(() => [...documents].filter((item) => (item.title || '').toLocaleLowerCase('pl').includes(query.trim().toLocaleLowerCase('pl'))).sort((a, b) => sort === 'name' ? (a.title || '').localeCompare(b.title || '', 'pl') : (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0)), [documents, query, sort]);

  async function download(document) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(document.id);
    setNotice('');
    setError(null);
    try {
      const prepared = await fetchOwnedPdfDownload(document.id);
      triggerBlobDownload(prepared.blob, prepared.title);
      setNotice(`Przekazano do pobrania: ${document.title || 'CV'}.`);
    } catch (failure) { setError(failure); }
    finally { pendingRef.current = false; setPending(null); }
  }

  // Keep confirmation open on failures, disable duplicate writes, and focus the
  // library heading if the deleted row can no longer receive restored focus.
  async function remove() {
    if (!deleting || pendingRef.current) return;
    pendingRef.current = true;
    setPending(deleting.id);
    setDeleteError('');
    try {
      await new ApiClient({ Authorization: `Bearer ${getAccessToken()}` }).httpRequest(ENDPOINTS.PDF.DELETE, 'DELETE', JSON.stringify(deleting.id), 'Nie udało się usunąć dokumentu.');
      setDocuments((current) => current.filter((item) => item.id !== deleting.id));
      setNotice(`Usunięto dokument: ${deleting.title || 'Bez nazwy'}.`);
      setDeleting(null);
      requestAnimationFrame(() => listHeading.current?.focus());
    } catch (failure) { setDeleteError(failure.message); }
    finally { pendingRef.current = false; setPending(null); }
  }

  return <SiteLayout workspace title="Moje dokumenty" eyebrow="TWOJA PRZESTRZEŃ" intro="Wróć do zapisanego CV albo przygotuj nową wersję do kolejnej aplikacji."
    heroActions={<><Link className={classes.primary} to="/app/new"><FiPlus aria-hidden="true" />Utwórz nowe CV</Link><Link className={classes.secondary} to="/app/import"><FiUpload aria-hidden="true" />Importuj PDF</Link></>}
    heroAside={<HeroNote icon={<FiFolder />} label="WSZYSTKO W JEDNYM MIEJSCU" title="Kolejna aplikacja? Masz punkt wyjścia."><p>Otwórz zapisany projekt, dopasuj treść do oferty i pobierz gotowe CV.</p><Link to="/help#powrot">Jak wrócić do pracy <FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <section className={classes.library} aria-labelledby="library-heading">
    <div className={classes.sectionHeading}><h2 id="library-heading" ref={listHeading} tabIndex={-1}>Zapisane CV</h2>{!loading && !error && <span className={classes.count}>Liczba projektów: {documents.length}</span>}</div>
    {notice && <p role="status" className={classes.notice}>{notice}</p>}
    {error && <div role="alert" className={classes.error}><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Fdocuments">Zaloguj się ponownie</Link> : <button className={classes.secondary} onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1); }}>Spróbuj ponownie</button>}</div>}
    {loading ? <div role="status" aria-label="Ładowanie dokumentów"><p>Ładowanie dokumentów…</p>{[0, 1, 2].map((id) => <div key={id} className={classes.skeleton} aria-hidden="true" />)}</div> : <>
      {documents.length > 0 && <div className={classes.toolbar}><div className={classes.field}><label htmlFor="document-search">Szukaj dokumentów</label><input id="document-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className={classes.field}><label htmlFor="document-sort">Kolejność</label><select id="document-sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Ostatnio zmienione</option><option value="name">Nazwa A–Z</option></select></div></div>}
      {!error && documents.length === 0 && <section className={classes.emptyState}><SiteMarker><FiFileText /></SiteMarker><h2>Twoje pierwsze CV zaczyna się tutaj.</h2><p>Wybierz „Utwórz nowe CV” lub zaimportuj PDF. Zapisany projekt pojawi się w tej bibliotece.</p><Link className={classes.secondary} to="/templates">Obejrzyj szablony<FiArrowRight aria-hidden="true" /></Link></section>}
      {documents.length > 0 && visible.length === 0 && <div className={classes.emptyState}><p role="status">Brak dokumentów pasujących do wyszukiwania. Zmień lub usuń wpisaną nazwę.</p><button className={classes.secondary} onClick={() => { setQuery(''); document.getElementById('document-search')?.focus(); }}>Wyczyść wyszukiwanie</button></div>}
      <ul className={classes.list}>{visible.map((document) => <li key={document.id} className={classes.documentRow}><div className={classes.documentIdentity}><SiteMarker><FiFileText /></SiteMarker><div><h3><Link to={getDocumentPath(document.id)}>{document.title || 'Bez nazwy'}</Link></h3><p>Ostatnia zmiana: {documentDate(document)}</p></div></div><div className={classes.actions}><Link className={classes.secondary} to={getDocumentPath(document.id)}>Otwórz<FiArrowRight aria-hidden="true" /></Link><button className={classes.secondary} disabled={pending !== null} onClick={() => download(document)}><FiDownload aria-hidden="true" />{pending === document.id ? 'Przetwarzanie…' : 'Pobierz PDF'}</button><button className={classes.danger} disabled={pending !== null} onClick={() => { setDeleteError(''); setDeleting(document); }} aria-label={`Usuń ${document.title || 'dokument'}`}>Usuń</button></div></li>)}</ul>
    </>}
    </section>
    <DialogShell open={Boolean(deleting)} onClose={() => { if (!pendingRef.current) setDeleting(null); }} title="Usunąć dokument?" subtitle={`„${deleting?.title || 'Bez nazwy'}” zostanie trwale usunięty. Tej operacji nie można cofnąć.`} role="alertdialog" initialFocusSelector="[data-cancel-delete]" footer={<div className={classes.actions}><button data-cancel-delete className={classes.secondary} disabled={pending !== null} onClick={() => setDeleting(null)}>Anuluj</button><button className={classes.danger} disabled={pending !== null} onClick={remove}>{pending !== null ? 'Usuwanie…' : 'Usuń trwale'}</button></div>}>{deleteError && <p role="alert" className={classes.error}>{deleteError}</p>}</DialogShell>
  </SiteLayout>;
}
