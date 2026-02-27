export async function download(url){
    const response = await fetch(url, {credentials: "include"});
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob)
    console.log(blobUrl);
}