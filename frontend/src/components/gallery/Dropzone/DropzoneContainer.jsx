/**
 * Dialog wrapper that mounts Dropzone when the upload surface is open.
 */
import { useState } from "react";
import classes from "./DropzoneContainer.module.css";
import Dropzone from "./Dropzone";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import DialogShell from "../../common/DialogShell/DialogShell";

const MAX_FILES = 12;

export default function DropzoneContainer() {
    const { isDropzone, showDropzone } = useUiSurfaces();
    const [count, setCount] = useState(0);

    return (
        <DialogShell
            open={isDropzone}
            onClose={showDropzone}
            width={1280}
            radius={2}
            title="Prześlij obrazy"
            subtitle="Maks. 12 plików · JPG, PNG — miniatury pojawią się w siatce poniżej."
            footer={(
                <>
                    <span className={classes.countLabel}>{count} z {MAX_FILES} przesłanych obrazów</span>
                    <button type="button" className={classes.closeFooterBtn} onClick={showDropzone}>Zamknij</button>
                </>
            )}
        >
            <Dropzone onCountChange={setCount} />
        </DialogShell>
    );
}
