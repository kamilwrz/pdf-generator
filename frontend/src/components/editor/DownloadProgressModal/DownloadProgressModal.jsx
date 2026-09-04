import PdfOperationProgressModal from "../PdfOperationProgressModal/PdfOperationProgressModal";

/**
 * Download-specific adapter for the shared PDF operation progress surface.
 *
 * @param {{ open?: boolean, phase?: "prepare"|"render"|"download", title?: string }} props
 * @returns {React.ReactElement} The PDF download progress modal.
 */
export default function DownloadProgressModal(props) {
    return <PdfOperationProgressModal {...props} operation="download" />;
}
