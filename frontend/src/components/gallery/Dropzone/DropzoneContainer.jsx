import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
  useTranslation();
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
            title={uiText("editor:dropzoneContainer.uploadProfilePhotos")}
            subtitle={uiText("editor:dropzoneContainer.forYourCvMaxPhotosJpgPng", { value0: (MAX_PROFILE_PHOTOS) })}
            footer={(
                <>
                    <span className={classes.countLabel}>
                        {libraryCount}
                        {" "}
                        z
                        {" "}
                        {MAX_PROFILE_PHOTOS}
                        {" "}{uiText("editor:dropzoneContainer.photosInTheGallery")}</span>
                    <button type="button" className={classes.closeFooterBtn} onClick={showDropzone}>{uiText("editor:sectionsPanel.close")}</button>
                </>
            )}
        >
            <Dropzone onLibraryChange={handleLibraryChange} />
        </DialogShell>
    );
}
