export async function download(url){
    const response = await fetch(url, {headers:{"Authorization": `Bearer ${localStorage.getItem("token")}`}, credentials: "include"});
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob)
    console.log(blobUrl);
}