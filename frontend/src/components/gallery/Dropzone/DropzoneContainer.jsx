/**
 * Dialog wrapper that mounts Dropzone when the profile-photo upload surface is open.
 */
import { useCallback, useState } from "react";
import classes from "./DropzoneContainer.module.css";
import Dropzone from "./Dropzone";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import DialogShell from "../../common/DialogShell/DialogShell";
import { MAX_PROFILE_PHOTOS } from "../../../constants/profilePhotos";

export default function DropzoneContainer() {
    const { isDropzone, showDropzone } = useUiSurfaces();
    const [libraryCount, setLibraryCount] = useState(0);

    const handleLibraryChange = useCallback((info) => {
        setLibraryCount(info?.libraryCount ?? 0);
    }, []);

    return (
        <DialogShell
            open={isDropzone}
            onClose={showDropzone}
            width={720}
            radius={2}
            title="Prześlij zdjęcia profilowe"
            subtitle={`Do użycia w CV · maks. ${MAX_PROFILE_PHOTOS} zdjęć · JPG, PNG, WEBP, GIF`}
            footer={(
                <>
                    <span className={classes.countLabel}>
                        {libraryCount}
                        {" "}
                        z
                        {" "}
                        {MAX_PROFILE_PHOTOS}
                        {" "}
                        zdjęć w galerii
                    </span>
                    <button type="button" className={classes.closeFooterBtn} onClick={showDropzone}>Zamknij</button>
                </>
            )}
        >
            <Dropzone onLibraryChange={handleLibraryChange} />
        </DialogShell>
    );
}
