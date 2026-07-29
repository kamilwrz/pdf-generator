/**
 * Legacy download helper stub.
 *
 * Prefer Topbar / ModalPdfs flows that call POST /pdf/download_pdf via ApiClient
 * and then navigate to the returned URL or FileResponse. This module is unused
 * by the current editor UI.
 */
import { ENDPOINTS } from "../services/api";

export async function download(url) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        body: 74,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    console.log(response);
}
