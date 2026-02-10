# Data Preparation Guide for converting GeoTIFFs to COG files

This guide provides a detailed workflow for converting GeoTIFF files to Cloud-Optimized GeoTIFFs (COG) for seamless integration with `@gisatcz/deckgl-geolib`, ensuring compatibility with Panther.

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
```

### Step 3: Convert to Cloud-Optimized GeoTIFF (COG)
Use [rio-cogeo ](https://cogeotiff.github.io/rio-cogeo/CLI/) to generate a COG from your prepared GeoTIFF:

```
rio cogeo create \
  --cog-profile=deflate \
  --blocksize=256 \
  --overview-blocksize=256 \
  --web-optimized \
  --nodata=nan \
  --forward-band-tags \
  [input_file.tif] \
  [output_cog_file.tif]
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
  - supports all COG styles available in [Geoimage](api-reference.md) library from Geolib Visualiser
  - <ins>requirements</ins>: URL for COG file uploaded on S3 server

    <img src = "/geoimage/docs/images/gisat_cog_explorer.jpg" width = "60%">
  
  
# More information about COG format

These are links for existing articles about COGs:
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 1: Overview](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-1-overview/)
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 2: Converting Regular GeoTIFFs into COGs](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-2-converting-regular-geotiffs-into-cogs/)
- [Planet Developers: An Introduction to Cloud Optimized GeoTIFFS (COGs) Part 3: Dynamic Web Tiling with Titiler](https://developers.planet.com/docs/planetschool/an-introduction-to-cloud-optimized-geotiffs-cogs-part-3-dynamic-web-tiling-with-titiler/)
- [Medium: COGs in production](https://sean-rennie.medium.com/cogs-in-production-e9a42c7f54e4)

