import Dropzone from "./Dropzone";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import DialogShell from "../../common/DialogShell/DialogShell";

export default function DropzoneContainer() {
    const { isDropzone, showDropzone } = use(PdfContext);

    return (
        <DialogShell
            open={isDropzone}
            onClose={showDropzone}
            width={640}
            title="Prześlij obrazy"
            subtitle="Maks. 12 plików · JPG, PNG — miniatury w siatce 4 kolumn"
        >
            <Dropzone />
        </DialogShell>
    );
}
