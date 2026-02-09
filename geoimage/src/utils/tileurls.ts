function isTileServiceUrl(url:string) {
  if (url && url.includes('{x}') && url.includes('{y}') && url.includes('{z}')) {
    return true;
  }
  return false;
}

function isCogUrl(url:string) {
  if (url.includes('.tif') || url.includes('.tiff') || url.includes('.TIF') || url.includes('.TIFF')) {
    return true;
  }
  return false;
}

function getTileUrl(service:string, x:number, y:number, z:number) {
  const url = service.replace('{x}', String(x)).replace('{y}', String(y)).replace('{z}', String(z));

  return url;
}

export { isTileServiceUrl, isCogUrl, getTileUrl };
