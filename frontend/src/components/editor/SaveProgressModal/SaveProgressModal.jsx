import PdfOperationProgressModal from "../PdfOperationProgressModal/PdfOperationProgressModal";

/**
 * Save-specific adapter for the shared PDF operation progress surface.
 *
 * @param {{ open?: boolean, phase?: "prepare"|"persist"|"confirm", title?: string }} props
 * @returns {React.ReactElement} The save progress modal.
 */
export default function SaveProgressModal(props) {
    return <PdfOperationProgressModal {...props} operation="save" />;
}
