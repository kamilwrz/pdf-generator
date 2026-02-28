import { ENDPOINTS } from "../services/api";

export async function download(url) {
    const response = await fetch(url, { method: "POST", credentials: "include", body: 74, headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` } });
    console.log(response)
}


