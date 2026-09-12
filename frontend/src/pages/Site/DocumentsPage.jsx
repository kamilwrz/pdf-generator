import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { getUiLocale } from '../../i18n/index.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Standalone library: owned reads, local search, and explicit per-document actions. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiUpload, FiFileText, FiFolder, FiArrowRight, FiDownload } from 'react-icons/fi';
import { useEntitlements } from '../../hooks/useEntitlements';
import { HeroNote, SiteMarker } from '../../components/common/SiteLayout/SitePrimitives';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import SavedImports from './SavedImports';
import DialogShell from '../../components/common/DialogShell/DialogShell';
import { listOwnedDocuments } from '../../services/documents';
import { ApiClient, ENDPOINTS } from '../../services/api';
import { getAccessToken } from '../../utils/authSession';
import { getDocumentPath } from '../../utils/siteRoutes';
import { fetchOwnedPdfDownload, triggerBlobDownload } from '../../utils/download';

function documentDate(document) {
  const date = new Date(document.updated_at || document.created_at);
  return Number.isNaN(date.getTime()) ? uiText("documents:documentsPage.dateUnavailable") : date.toLocaleString(getUiLocale());
}

export default function DocumentsPage() {
  useTranslation();
  const [tab, setTab] = useState('cvs');
  const locale = getUiLocale();
  const { entitlements } = useEntitlements();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useMessageState(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useMessageState('');
  const [notice, setNotice] = useMessageState('');
  const listHeading = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    listOwnedDocuments().then((data) => { if (active) setDocuments(data); })
      .catch((failure) => { if (active) setError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const visible = useMemo(() => [...documents].filter((item) => (item.title || '').toLocaleLowerCase(getUiLocale()).includes(query.trim().toLocaleLowerCase(getUiLocale()))).sort((a, b) => sort === 'name' ? (a.title || '').localeCompare(b.title || '', getUiLocale()) : (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0)), [documents, query, sort, locale]);

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
      await new ApiClient({ Authorization: `Bearer ${getAccessToken()}` }).httpRequest(ENDPOINTS.PDF.DELETE, 'DELETE', JSON.stringify(deleting.id), uiText("documents:documentsPage.couldNotDeleteTheDocument"));
      setDocuments((current) => current.filter((item) => item.id !== deleting.id));
      setNotice(messageRef("documents:documentsPage.documentDeleted", { value0: (deleting.title || messageRef("editor:sectionsPanel.untitled")) }));
      setDeleting(null);
      requestAnimationFrame(() => listHeading.current?.focus());
    } catch (failure) { setDeleteError(messageOf(failure)); }
    finally { pendingRef.current = false; setPending(null); }
  }

  return <SiteLayout workspace title={uiText("public:siteLayout.myDocuments")} eyebrow={uiText("account:accountPage.yourWorkspace")} intro={uiText("documents:documentsPage.returnToASavedCvOrPrepare")}
    heroActions={<><Link className={classes.primary} to="/app/new"><FiPlus aria-hidden="true" />{uiText("editor:newCvSetupModal.createANewCv")}</Link><Link className={classes.secondary} to="/app/import"><FiUpload aria-hidden="true" />{uiText("editor:topbar.importPdf")}</Link></>}
    heroAside={entitlements?.ai_assistant === true ? <HeroNote icon={<FiFileText />} label={uiText("documents:documentsPage.interviewAvailableWithYourPro")} title={uiText("documents:documentsPage.notSureHowToDescribeYourExperience")}><p>{uiText("documents:documentsPage.answerQuestionsAboutYourActivitiesAndResults")}</p><Link className={classes.secondary} to="/app/interview">{uiText("account:accountPage.createACvThroughAnInterview")} <FiArrowRight aria-hidden="true" /></Link><Link to="/help#dopasowanie">{uiText("documents:documentsPage.iWantToTailorMyCurrentCv")}</Link></HeroNote> : <HeroNote icon={<FiFolder />} label={uiText("documents:documentsPage.everythingInOnePlace")} title={uiText("documents:documentsPage.anotherApplicationYouHaveAStartingPoint")}><p>{uiText("documents:documentsPage.openASavedProjectTailorItsContent")}</p><Link to="/help#powrot">{uiText("documents:documentsPage.returningToYourWork")} <FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <section className={classes.library} aria-label={uiText("public:siteLayout.myDocuments")}>
    <div role="tablist" aria-label={uiText("public:siteLayout.myDocuments")} className={classes.tabs}>
      {['cvs', 'imports'].map((value, index) => <button key={value} id={`library-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`library-panel-${value}`} tabIndex={tab === value ? 0 : -1} className={classes.tab} onClick={() => setTab(value)} onKeyDown={(event) => {
        // Automatic activation keeps arrow/Home/End navigation in the two-tab group.
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'cvs' : event.key === 'End' ? 'imports' : ['cvs', 'imports'][1 - index];
        setTab(next);
        document.getElementById(`library-tab-${next}`)?.focus();
      }}>{uiText(value === 'cvs' ? "documents:documentsPage.savedCvs" : "documents:documentsPage.savedImports")}</button>)}
    </div>
    <div id="library-panel-imports" role="tabpanel" aria-labelledby="library-tab-imports" hidden={tab !== 'imports'} tabIndex={0}>
      {tab === 'imports' && <SavedImports />}
    </div>
    <div id="library-panel-cvs" role="tabpanel" aria-labelledby="library-tab-cvs" hidden={tab !== 'cvs'} tabIndex={0}>
    <div className={classes.sectionHeading}><h2 id="library-heading" ref={listHeading} tabIndex={-1}>{uiText("documents:documentsPage.savedCvs")}</h2>{!loading && !error && <span className={classes.count}>{uiText("documents:documentsPage.projects")} {documents.length}</span>}</div>
    {notice && <p role="status" className={classes.notice}>{notice}</p>}
    {error && <div role="alert" className={classes.error}><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Fdocuments">{uiText("editor:pdfCanvas.signInAgain")}</Link> : <button className={classes.secondary} onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1); }}>{uiText("errors:errorBoundary.tryAgain")}</button>}</div>}
    {loading ? <div role="status" aria-label={uiText("documents:documentsPage.loadingDocuments")}><p>{uiText("documents:documentsPage.loadingDocuments2")}</p>{[0, 1, 2].map((id) => <div key={id} className={classes.skeleton} aria-hidden="true" />)}</div> : <>
      {documents.length > 0 && <div className={classes.toolbar}><div className={classes.field}><label htmlFor="document-search">{uiText("documents:modalPdfs.searchDocuments")}</label><input id="document-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className={classes.field}><label htmlFor="document-sort">{uiText("documents:documentsPage.order")}</label><select id="document-sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">{uiText("documents:documentsPage.recentlyModified")}</option><option value="name">{uiText("documents:modalPdfs.nameAZ")}</option></select></div></div>}
      {!error && documents.length === 0 && <section className={classes.emptyState}><SiteMarker><FiFileText /></SiteMarker><h2>{uiText("documents:documentsPage.yourFirstCvStartsHere")}</h2><p>{uiText("documents:documentsPage.chooseCreateANewCvOrImport")}</p><Link className={classes.secondary} to="/templates">{uiText("interview:interviewFlow.browseTemplates")}<FiArrowRight aria-hidden="true" /></Link></section>}
      {documents.length > 0 && visible.length === 0 && <div className={classes.emptyState}><p role="status">{uiText("documents:documentsPage.noDocumentsMatchYourSearchChangeOr")}</p><button className={classes.secondary} onClick={() => { setQuery(''); document.getElementById('document-search')?.focus(); }}>{uiText("documents:documentsPage.clearSearch")}</button></div>}
      <ul className={classes.list}>{visible.map((document) => <li key={document.id} className={classes.documentRow}><div className={classes.documentIdentity}><SiteMarker><FiFileText /></SiteMarker><div><h3><Link to={getDocumentPath(document.id)}>{document.title || uiText("editor:sectionsPanel.untitled")}</Link></h3><p>{uiText("documents:documentsPage.lastUpdated")} {documentDate(document)}</p></div></div><div className={classes.actions}><Link className={classes.secondary} to={getDocumentPath(document.id)}>{uiText("documents:documentsPage.open")}<FiArrowRight aria-hidden="true" /></Link><button className={classes.secondary} disabled={pending !== null} onClick={() => download(document)}><FiDownload aria-hidden="true" />{pending === document.id ? 'Przetwarzanie…' : uiText("editor:pdfOperationProgressModal.downloadPdf")}</button><button className={classes.danger} disabled={pending !== null} onClick={() => { setDeleteError(''); setDeleting(document); }} aria-label={uiText("documents:documentsPage.delete", { value0: (document.title || 'dokument') })}>{uiText("ai:aiAssistant.delete")}</button></div></li>)}</ul>
    </>}
    </div>
    </section>
    <DialogShell open={Boolean(deleting)} onClose={() => { if (!pendingRef.current) setDeleting(null); }} title={uiText("documents:modalPdfs.deleteDocument")} subtitle={uiText("documents:documentsPage.willBePermanentlyDeletedThisCannotBe", { value0: (deleting?.title || uiText("editor:sectionsPanel.untitled")) })} role="alertdialog" initialFocusSelector="[data-cancel-delete]" footer={<div className={classes.actions}><button data-cancel-delete className={classes.secondary} disabled={pending !== null} onClick={() => setDeleting(null)}>{uiText("ai:aiAssistant.cancel")}</button><button className={classes.danger} disabled={pending !== null} onClick={remove}>{pending !== null ? 'Usuwanie…' : uiText("ai:aiCvPanel.deletePermanently")}</button></div>}>{deleteError && <p role="alert" className={classes.error}>{deleteError}</p>}</DialogShell>
  </SiteLayout>;
}
