#!/usr/bin/env python2

__author__ = "Kyle Taylor, Alex Daniels"
__copyright__ = "Copyright 2018, Playa Lakes Joint Venture"
__credits__ = ["Alex Daniels", "Kyle Taylor"]
__license__ = "GPL"
__version__ = "3"
__maintainer__ = "Kyle Taylor"
__email__ = "kyle.taylor@pljv.org"
__status__ = "Production"
__description__ = "This script pulls from the Landsat 8 satellite to generate an estimate of recent surface wetness"

import ee
import json
import time

_SLEEP_TIME_SECONDS = 60 # Usually takes about 9 minutes to generate this asset
_SCALE = 30 # units here are meters
_MAX_PIXELS = 3E09 # Max pixels for an export to use before throwing an error
_MAX_CLOUD_COVER = 10 # Maximum cloud cover contamination to accept in landsat

def now_minus_n_months(*args):
    """
    accept a single positional argument (month) specifying how far from now
    to go back in our landsat imagery
    """
    now = ee.datetime.datetime.now()
    dst_year = now.year
    dst_month = now.month - args[0]
    dst_day = now.day
    if dst_month < 0:
        dst_year = dst_year - 1
        dst_month = dst_month + 12
    return str(dst_year) + '-' + str(dst_month) + '-' + str(dst_day)

def apply_bitwise_qa_filter(image):
  """
  a function to mask out unwanted pixels using 5471 as a bitwise mask
  because it's binary equivalent is the inverse of what we want in the qa
  band info gleaned from https://landsat.usgs.gov/collectionqualityband 
  """
  qa_mask= image\
    .select('BQA')\
    .bitwiseAnd(5471)\
    .neq(0)\
    .eq(0)

  return image\
    .updateMask(qa_mask)

def add_time_stamp_band(image):
   """ a function to add the time stamp bands """
   return ee.Image(image)\
     .addBands(ee.Image.constant(image.get(u'system:time_start'))\
     .rename("time")\
     .cast({"time": "long"})\
     .copyProperties(image, ['system:time_start']))

def image_mosaic_from_ls8_collection(collection_id='LANDSAT/LC08/C01/T1_RT', cloud_mask=_MAX_CLOUD_COVER, region=None):
    """
    The image collection and sorting that all out. Get the most recent image from a given collection
    """
    collection = ee.ImageCollection(collection_id).\
        filterMetadata('CLOUD_COVER', 'less_than', cloud_mask).\
        filterMetadata('CLOUD_COVER', 'greater_than', -0.1).\
        filterBounds(region)
    
    # add a time band
    collection = collection.map(add_time_stamp_band)
    # map the qa function over the collection to mask out snow, shadows, clouds
    collection = collection.map(apply_bitwise_qa_filter)

    # build a mosiac from the resulting collection using the most recent pixel
    return collection.qualityMosaic('time')

def water_ruiz2014(image):
    """
    surface water detection from Ruiz et al. 2014 that just uses band 6
    and band 4
    """
    band_magic = {
        'B4': image.select('B4'),
        'B6': image.select('B6'),
        'blank': ee.Image(0)
    }
    return band_magic['blank'].where(band_magic['B6'].lte(band_magic['B4']), 1)

def water_mcfeeters1996(plandsatimage):
  """
  The normalized difference water index method (green - nir)/(green + nir)
  """
  b3 = plandsatimage.select('B3')
  b5 = plandsatimage.select('B5')
  ndwi = b3.subtract(b5).divide((b3.add(b5)))
  blank = ee.Image(0)
  out = blank.where(ndwi.gte(0),1)
  return out.updateMask(out)

def water_xu2007(plandsatimage):
  """ 
  The modified normalized difference water index method
  (green - swir)/(green + swir)
  """
  b3 = plandsatimage.select('B3')
  b6 = plandsatimage.select('B6')
  mndwi = b3.subtract(b6).divide((b3.add(b6)))
  blank = ee.Image(0)
  out = blank.where(mndwi.gte(0),1)
  return out.updateMask(out)

def get_fc_coordinates(collection=None):
    return collection.geometry().getInfo()

def set_asset_globally_readable(assetId=None):
   acl = ee.data.getAssetAcl(assetId)
   acl['all_users_can_read'] = True
   acl.pop('owners')
   ee.data.setAssetAcl(assetId, json.dumps(acl))
   validate = ee.data.getAssetAcl(assetId)
   if not validate['all_users_can_read']:
        time.sleep(5)
        set_asset_globally_readable(assetId=assetId)
        

def export_as_asset(image=None, assetId=None, region=None, timeout_minutes=90, description='Generating LS8 last wet scene product', scale=_SCALE):
    task = ee.batch.Export.image.toAsset(
        image=image,
        assetId=assetId,
        scale=scale,
        description=description,
        maxPixels=_MAX_PIXELS,
        region=region
    )
    # delete the asset if it exists
    try:
      ee.batch.data.deleteAsset(assetId)
    except ee.ee_exception.EEException:
      pass
    # start the task and monitor our progress
    task.start()
    # give ourselves a healthy amount of burn-in for a valid start_timestamp
    time.sleep(_SLEEP_TIME_SECONDS)
    try:
      task_start_time = int(task.status()['start_timestamp_ms'])
    except Exception as e:
      print("Task initiation failed completely -- perhaps we have this task duplicated on the server-side")
      raise(e)
    while str(task.status()['state']) != 'COMPLETED':
      time.sleep(_SLEEP_TIME_SECONDS)
      task_runtime = (int(task.status()['update_timestamp_ms']) - task_start_time ) / 1000
      # if we take longer than 30 minutes, throw an error
      if task_runtime > (60 * timeout_minutes):
        raise Exception('EE task timed out')
      if task.status()['state'] == 'FAILED':
        raise Exception('EE task FAILED')
    # if we succeeded, let's set the asset to globally readable
    time.sleep(3)
    set_asset_globally_readable(assetId)
    # return the task to the user for inspection
    return (task)


def export_image_to_drive(image, assetId, description='Generating LS8 last wet scene product', scale=_SCALE):
    # define our EE task options
    task_config = {
        'description': description,
        'scale': scale,
        'maxPixels': _MAX_PIXELS
    }
    task = ee.batch.Export.image(
        image, 
        assetId, 
        task_config
      ).start()
    return(task)


if __name__ == "__main__":

    # Use our App Engine service account's credentials.
    ee.Initialize()

    # import the geometry for Kansas
    kansas = ee.FeatureCollection('users/adaniels/tl_2014_us_state').filter(ee.Filter.eq('NAME', 'Kansas'))
    region_boundary = kansas.geometry().bounds().coordinates().getInfo()
    
    # generate an ee.Image of (unix) time since scene acquisition 
    unix_time_image = ee.ImageCollection('LANDSAT/LC08/C01/T1_RT')\
      .filterMetadata('CLOUD_COVER', 'less_than', _MAX_CLOUD_COVER)\
      .filterMetadata('CLOUD_COVER','greater_than',-0.1)\
      .filterBounds(kansas.geometry().bounds())\
      .map(add_time_stamp_band)\
      .map(apply_bitwise_qa_filter)\
      .qualityMosaic('time')\
      .select('time')

    # define our time-series information and mask out pixels that have never been wet over a 30 year period
    last_wet_scene = water_ruiz2014(
        image_mosaic_from_ls8_collection('LANDSAT/LC08/C01/T1_RT', region=kansas)
      ).multiply(ee.Image("users/kyletaylor/shared/long_run_surface_wetness_mask"))

    # export the resulting "water
    status = export_as_asset(
        image=last_wet_scene,
        assetId='users/kyletaylor/shared/LC8dynamicwater',
        region=region_boundary,
        description='Generating LS8 last wet scene product',
        scale=30
      )
    
    status = export_as_asset(
        image=unix_time_image,
        assetId='users/kyletaylor/shared/time_of_landsat_mosaic_pixel',
        region=region_boundary,
        description='Generating LS8 unix time product'
      )
