import classes from "./DropzoneContainer.module.css";
import Dropzone from "./Dropzone";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import PanelShell from "../../common/PanelShell/PanelShell";

export default function DropzoneContainer() {

    const { isDropzone, showDropzone } = use(PdfContext)

    return (
        <PanelShell
            open={isDropzone}
            onClose={showDropzone}
            className={classes.dropzoneContainer}
            motionProps={{
                initial: { opacity: 0, x: -24 },
                animate: { opacity: 1, x: 0 },
                exit: { opacity: 0, x: -24 },
                transition: { type: "spring", damping: 26, stiffness: 320 },
            }}
            title="Prześlij obrazy"
            subtitle="Maks. 12 plików · JPG, PNG"
        >
            <Dropzone />
        </PanelShell>
    );
}
