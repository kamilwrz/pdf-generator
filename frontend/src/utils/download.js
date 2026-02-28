import { ENDPOINTS } from "../services/api";

export async function download(url,id){
    const response = await fetch(url, {method:"POST", body:id, headers:{"Authorization": `Bearer ${localStorage.getItem("token")}`}});
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob)
    console.log(blobUrl);
}


download('https://pdf-generator-07cb.onrender.com'+ENDPOINTS.PDF.DOWNLOAD, 74)