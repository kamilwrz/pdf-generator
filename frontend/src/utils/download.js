export async function download(url,id){
    const response = await fetch(url, {method:"POST", body:JSON.stringify(id), headers:{"Authorization": `Bearer ${localStorage.getItem("token")}`}, credentials: "include"});
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob)
    console.log(blobUrl);
}