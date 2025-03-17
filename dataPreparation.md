# Data Preparation Guide for converting GeoTIFFs to COG files

This guide provides a detailed workflow for converting GeoTIFF files to Cloud-Optimized GeoTIFFs (COG) for seamless integration with Geolib Visualizer, ensuring compatibility with Panther.

We are using [gdalwarp](https://gdal.org/en/latest/programs/gdalwarp.html), GDAL warping utility for preparation of correct input GeoTIFF files and [rio-cogeo](https://cogeotiff.github.io/rio-cogeo/) library for creating COG files.

### Step 1: Install Requirements
Ensure Python 3.7 or higher is installed. Then, install **rio-cogeo** for creating COGs and **gdal** for pre-processing.


- rio-cogeo

  Using pip
  ```bash
  pip install rio-cogeo
  ```
  Using conda
  ```bash
  conda install -c conda-forge rio-cogeo
  ```
- GDAL
  ```bash
  conda install -c conda-forge gdal
  ```

### Step 2: Prepare GeoTIFFs for COG Conversion
GeoTIFF files should meet the following specifications:

- **Coordinate Reference System (CRS)**: Use Spherical Mercator, EPSG:3857.

- **Extent and Tile Boundaries**: Ensure raster extent aligns with [Google Maps Tiles](https://docs.maptiler.com/google-maps-coordinates-tile-bounds-projection)
for the desired zoom level and tile number.

- **Resolution and Dimension**: 
Set dimensions (512x512, 1024x1024, 2048x2048, ...) based on the required spatial resolution (in meters per pixel)

- **NoData Value**: Define a NoData value.

- **Compression**: Use Deflate compression for efficiency.
##

#### Adjust GeoTIFF with GDAL:

If your GeoTIFF does not meet these specifications, use [gdalwarp](https://gdal.org/en/latest/programs/gdalwarp.html):

```
gdalwarp -t_srs EPSG:3857 -r near -co COMPRESS=DEFLATE input.tif input_projected.tif

use  -te  -ts  -ot  -dstnodata  and other gdalwarp options to ensure GeoTIFF will meet required specifications
```

### Step 3: Convert to Cloud-Optimized GeoTIFF (COG)
Use [rio-cogeo ](https://cogeotiff.github.io/rio-cogeo/CLI/) to generate a COG from your prepared GeoTIFF:

```
rio cogeo create --blocksize 256 --overview-blocksize 256 input_projected.tif output_cog.tif

use --dtype  --nodata  and other options for specification
```

### Step 4: Validate and Check COG Metadata
- Validate the COG file with [rio-cogeo](https://cogeotiff.github.io/rio-cogeo/CLI/) to ensure it’s properly formatted:
```
rio cogeo validate output_cog.tif
```
To view COG metadata, use:
```
rio cogeo info output_cog.tif
```
- You can display a COG file saved locally on your computer e.g. with **QGIS**. 
In *Layer Properties* you can check detailed information about format, compression, bands, metadata, etc.


### Step 5: Validate in COG Explorer
- [COG Explorer](https://gisat.github.io/app-gisat-cog-explorer/)
  - application for verification and style creation for COG files developed by Gisat
  - based on Panther components
  - supports all COG styles available in [Geoimage](./geoimage/src/geoimage/README.md) library from Geolib Visualiser
  - <ins>requirements</ins>: URL for COG file uploaded on S3 server

    <img src = "/images/gisat_cog_explorer.jpg" width = "60%">


# Example for region in Ethiopia
This example demonstrates how to convert a GeoTIFF file covering a region in Ethiopia to a Cloud-Optimized GeoTIFF (COG) for a zoom level 4 tile alignment.

### Input Requirements:
Refer to the [Google Maps Tile Projection Guide](https://docs.maptiler.com/google-maps-coordinates-tile-bounds-projection/#4/16.84/26.01) to align coordinates with tile boundaries. For this region in Ethiopia, which fits entirely within the zoom level 4 TMS Tile (9,8), the Coordinate bounds are: 2504689, 0 to 5009377, 2504689. 

| <img src="/images/Ethiopia_region_maptiler_zoom4_1.jpg" alt="Example region" width="40%"> | <img src="/images/Ethiopia_region_maptiler_zoom4_2.jpg" alt="Coordinate bounds" width="40%"> |
    


For expected spatial resolution, which is approx. 300m per pixel, the output dimension 8192 x 8192 pixels is used.

### Reproject GeoTIFF with GDAL

```bash
gdalwarp -te 2504689 0 5009377 2504689 -ts 8192 8192 -t_srs EPSG:3857 -ot Float32 -dstnodata -200 -r near -co COMPRESS=DEFLATE -co BIGTIFF=YES  ET_input.tif ET_input_3857_zoom4.tif
  ```
### Convert the prepared GeoTIFF to COG with rio-cogeo:

```bash
rio cogeo create --blocksize 256 --overview-blocksize 256 --dtype float32 --nodata -200 ET_input_3857_zoom4.tif ET_output_3857_zoom4_COG.tif
  ```
### Validation and check COG metadata:

```bash
rio cogeo validate ET_output_3857_zoom4_COG.tif

rio cogeo info ET_output_3857_zoom4_COG.tif
  ```

- You can display a COG file saved locally on your computer e.g. with **QGIS**. 
In *Layer Properties* you can check detailed information about format, compression, bands, metadata, etc.


### Validate in COG Explorer:
- **Upload data into your S3 server**

You must update visibility in file *Properties* (right click on the uploaded file) that it is readable for everyone:
- **Get URL link**

To get the final URL data, modify *bucket-name*, *project_folder* based on your directory structure and *cog_file_name* based on your COG file:


***Example***, below is the directory which you can see in WinSCP:
- /bucket-name/project_folder/test_cog/imagery.tif
- replace `/bucket-name/` with `https://bucket-name.eu-central-1.linodeobjects.com/`
- resulting in COG url: `https://bucket-name.eu-central-1.linodeobjects.com/project_folder/test_cog/imagery.tif`


Put COG Url into [COGexplorer](https://gisat.github.io/app-gisat-cog-explorer/)


# 
# More information about COG format

These are links for existing articles about COGs:
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 1: Overview](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-1-overview/)
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 2: Converting Regular GeoTIFFs into COGs](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-2-converting-regular-geotiffs-into-cogs/)
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 3: Dynamic Web Tiling with Titiler](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-3-dynamic-web-tiling-with-titiler/)
- [Medium: COGs in production](https://sean-rennie.medium.com/cogs-in-production-e9a42c7f54e4)

