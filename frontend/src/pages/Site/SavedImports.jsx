import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFileText, FiArrowRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { t, getUiLocale } from '../../i18n/index.js';
import { useMessageState, messageRef } from '../../i18n/messageState.js';
import { ApiClient, ENDPOINTS } from '../../services/api';
import { getAccessToken, getEditorPath } from '../../utils/authSession';
import { cvImportStatusLabel, cvImportRecoveryMessage } from '../../utils/cvImportRequest';
import DialogShell from '../../components/common/DialogShell/DialogShell';
import { SiteMarker } from '../../components/common/SiteLayout/SitePrimitives';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';

/** Owned import metadata with cursor pagination; extracted personal data is read only in the creation wizard. */
export default function SavedImports() {
  useTranslation();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useMessageState(null);
  const [notice, setNotice] = useMessageState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useMessageState(null);
  const lock = useRef(false);
  const retryCursor = useRef(null);
  const heading = useRef(null);
  const mounted = useRef(false);
  const load = useCallback(async (next = null) => {
    if (lock.current) return;
    lock.current = true;
    retryCursor.current = next;
    setLoading(true);
    setError(null);
    try {
      const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
      const data = await api.httpRequest(`${ENDPOINTS.AI.IMPORTS}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, 'GET', undefined, t('ai:aiCvPanel.couldNotLoadImportHistory'));
      if (!mounted.current) return;
      const rows = data.items || data.imports || [];
      setItems((current) => next ? [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))] : rows);
      setCursor(data.next_cursor || null);
    } catch (failure) { if (mounted.current) setError(failure); }
    finally { lock.current = false; if (mounted.current) setLoading(false); }
  }, [setError]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  // Keep failed deletion reviewable and restore focus to the list after removing its trigger.
  async function remove() {
    if (!deleting || lock.current) return;
    lock.current = true;
    setBusy(true);
    setDeleteError(null);
    try {
      await new ApiClient({ Authorization: `Bearer ${getAccessToken()}` }).httpRequest(ENDPOINTS.AI.IMPORT(deleting.id), 'DELETE', undefined, t('ai:aiCvPanel.couldNotDeleteTheImport'));
      setItems((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
      setNotice(messageRef('ai:aiCvPanel.theImportWasRemovedFromYourHistory'));
      requestAnimationFrame(() => heading.current?.focus());
    } catch (failure) { setDeleteError(failure); }
    finally { lock.current = false; setBusy(false); }
  }

  return <>
    <div className={classes.sectionHeading}>
      <h2 ref={heading} tabIndex={-1}>{t('documents:documentsPage.savedImports')}</h2>
      <button className={classes.secondary} disabled={loading || busy} onClick={() => load()}>{t('ai:aiCvPanel.refreshStatus')}</button>
    </div>
    {notice && <p role="status" className={classes.notice}>{notice}</p>}
    {error && <div role="alert" className={classes.error}><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Fdocuments">{t('editor:pdfCanvas.signInAgain')}</Link> : <button className={classes.secondary} onClick={() => load(retryCursor.current)}>{t('errors:errorBoundary.tryAgain')}</button>}</div>}
    {loading && <div role="status"><p>{t('ai:aiCvPanel.loadingHistory')}</p>{items.length === 0 && [0, 1, 2].map((id) => <div key={id} className={classes.skeleton} aria-hidden="true" />)}</div>}
    {!loading && !error && items.length === 0 && <div className={classes.emptyState}><SiteMarker><FiFileText /></SiteMarker><p>{t('ai:aiCvPanel.youHaveNoSavedImportsYet')}</p><Link className={classes.secondary} to="/app/import">{t('editor:topbar.importPdf')}</Link></div>}
    <ul className={classes.list}>{items.map((item) => <li className={classes.documentRow} key={item.id}>
      <div className={classes.documentIdentity}><SiteMarker><FiFileText /></SiteMarker><div>
        <h3>{item.filename || t('ai:aiCvPanel.importCv')}</h3>
        <p>{item.created_at ? new Date(item.created_at).toLocaleString(getUiLocale()) : t('documents:documentsPage.dateUnavailable')} · {cvImportStatusLabel(item.status)}</p>
        <p>{item.size_bytes == null ? t('ai:aiCvPanel.unknownSize') : `${Math.ceil(item.size_bytes / 1024)} KB`}{t('ai:aiCvPanel.cvsCreated', { value0: item.document_count || 0 })}</p>
        {item.status === 'failed' && <p>{cvImportRecoveryMessage(item.error_code)}</p>}
      </div></div>
      <div className={classes.actions}>
        {item.status === 'succeeded' && <Link className={classes.secondary} to={`${getEditorPath({ start: 'import' })}&savedImport=${item.id}`}>{t('ai:aiCvPanel.createCv')}<FiArrowRight aria-hidden="true" /></Link>}
        <button className={classes.danger} disabled={loading || busy} onClick={() => { setDeleteError(null); setDeleting(item); }} aria-label={t('documents:documentsPage.delete', { value0: item.filename || t('ai:aiCvPanel.importCv') })}>{t('ai:aiAssistant.delete')}</button>
      </div>
    </li>)}</ul>
    {cursor && <button className={classes.secondary} disabled={loading || busy} onClick={() => load(cursor)}>{t('ai:aiCvPanel.showOlderImports')}</button>}
    <DialogShell open={Boolean(deleting)} onClose={() => { if (!lock.current) setDeleting(null); }} title={t('ai:aiCvPanel.confirmDeletionOfDataFrom', { value0: deleting?.filename || 'CV' })} subtitle={`${t('ai:aiCvPanel.importDataWillBePermanentlyDeletedCreated')}${deleting?.status === 'processing' ? t('ai:aiCvPanel.deletionDoesNotStopExtractionAlreadyIn') : ''}`} role="alertdialog" initialFocusSelector="[data-cancel-import]" footer={<div className={classes.actions}><button data-cancel-import className={classes.secondary} disabled={busy} onClick={() => setDeleting(null)}>{t('ai:aiAssistant.cancel')}</button><button className={classes.danger} disabled={busy} onClick={remove}>{busy ? t('documents:documentsPage.deleting') : t('ai:aiCvPanel.deletePermanently')}</button></div>}>
      {deleteError && <p role="alert" className={classes.error}>{deleteError.message}</p>}
    </DialogShell>
  </>;
}
