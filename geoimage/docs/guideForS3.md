# Guide how to use S3 server
*for Gisat internal purposes*

## Step 1: Set up connection
You need to get your credentials first: 

```
host: eu-central-1.linodeobjects.com
bucket: gisat-gis
key: ***
secret: ***
```

For Windows connection use [WinSCP](https://winscp.net/eng/index.php):
    
Navigate to *Tabs -> New Tab* and create *New Site*.
- set file protocol to `Amazon S3`
- host name is: `eu-central-1.linodeobjects.com`
- access key ID is the obtained *key*
- secret access key is the obtained *secret*

    <img src = "/geoimage/docs/images/winscp_new_site_1.jpg" width = "50%">

- Go to *Advanced -> Directories* and set Remote directory to `gisat-gis`

    <img src = "/geoimage/docs/images/winscp_new_site_2.jpg" width = "50%">

## Step 2: Upload data
Now, you should see window with two menus; on the left menu you can see your local directories, 
on the right menu there is data structure of the Gisat's S3 server. Navigate to the local file you would like to upload and
drag and drop it to the desired folder on the S3 server.

:exclamation: You must update visibility in file *Properties* (right click on the uploaded file) that it is readable for everyone:

  <img src = "/geoimage/docs/images/winscp_new_site_3.jpg" width = "30%">

## Step 3: Get link
To get the final URL data, modify *project_folder* based on your directory structure and *cog_file_name* based on your COG file:

https://gisat-gis.eu-central-1.linodeobjects.com/project_folder/cog_file_name.tif

***Example***, below is the directory which you can see in WinSCP:
- /gisat-gis/esaGdaAdbNepal23/rasters/sentinel_cog/imagery.tif
- replace `/gisat.gis/` with `https://gisat-gis.eu-central-1.linodeobjects.com/`
- resulting in: https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/sentinel_cog/imagery.tif
